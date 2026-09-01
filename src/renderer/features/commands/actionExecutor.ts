/**
 * Executes actions defined in commands.json (v2).
 *
 * Dispatch:
 * - Resolved template starting with `!` → shell exec via window.shell.
 * - Otherwise → agent prompt via PTY paste or Agent SDK.
 *
 * After a successful run, applies `setStage` to the active session.
 */
import type { ActionDefinition } from './commandsConfig'
import { DEFAULT_STAGE } from './commandsConfig'
import type { ArgValue, SubContext } from './templateSubstitute'
import { substituteTemplate } from './templateSubstitute'
import { sendAgentPrompt } from '../../shared/utils/focusHelpers'
import { useAgentStore, type AgentConfig } from '../../store/agents'
import { useAgentChatStore } from '../../store/agentChat'
import { useSessionStore } from '../../store/sessions'
import { useRepoStore } from '../../store/repos'
import { ENABLE_AGENT_SDK } from '../../../shared/featureFlags'

export interface ActionExecutionContext {
  directory: string
  agentPtyId?: string
  agentId?: string | null
  templateVars: SubContext
  argValues: Record<string, ArgValue>
  onGitStatusRefresh?: () => void
}

export interface ActionResult {
  success: boolean
  error?: string
}

function isShellTemplate(resolved: string): boolean {
  return resolved.startsWith('!')
}

function applySetStage(action: ActionDefinition): void {
  if (action.setStage === undefined) return
  const { activeSessionId, setSessionStage } = useSessionStore.getState()
  if (!activeSessionId) return
  const stage = action.setStage ?? DEFAULT_STAGE
  setSessionStage(activeSessionId, stage)
}

async function executeShell(resolved: string, ctx: ActionExecutionContext): Promise<ActionResult> {
  const command = resolved.slice(1) // strip leading '!'
  try {
    const result = await window.shell.exec(command, ctx.directory)
    if (result.success) {
      ctx.onGitStatusRefresh?.()
      return { success: true }
    }
    // Merge conflicts are a normal state, not an error — git status will
    // show the conflicts and the "Resolve Conflicts" button will appear.
    const output = `${result.stdout}\n${result.stderr}`
    if (/CONFLICT|Merge conflict|fix conflicts/i.test(output)) {
      ctx.onGitStatusRefresh?.()
      return { success: true }
    }
    return { success: false, error: result.stderr || `Command exited with code ${result.exitCode}` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function getApiModeSessionId(agentId?: string | null): string | null {
  if (!ENABLE_AGENT_SDK || !agentId) return null
  const agent = useAgentStore.getState().agents.find((a: AgentConfig) => a.id === agentId)
  if (agent?.connectionMode !== 'api') return null
  const { activeSessionId, sessions } = useSessionStore.getState()
  if (!activeSessionId) return null
  const session = sessions.find((s) => s.id === activeSessionId)
  // A paused session runs no agent — API mode included — even though the
  // main-process query that would need tearing down isn't stopped yet (see
  // useAgentSdk.ts cleanup comment). Don't let a command reach it.
  if (session?.isPaused) return null
  return activeSessionId
}

async function executeAgent(resolved: string, ctx: ActionExecutionContext): Promise<ActionResult> {
  const apiSessionId = getApiModeSessionId(ctx.agentId)
  if (!apiSessionId && !ctx.agentPtyId) {
    // Most commonly the session is paused, but agentPtyId can also be unset
    // before the agent terminal has finished starting up — don't assert a
    // specific cause we can't confirm here.
    return { success: false, error: 'No agent terminal available — resume the session if it is paused.' }
  }
  try {
    const outputDir = `${ctx.directory}/.broomy/output`
    await window.fs.mkdir(`${ctx.directory}/.broomy`)
    await window.fs.mkdir(outputDir)
    await window.fs.writeFile(`${outputDir}/context.json`, JSON.stringify(ctx.templateVars, null, 2))

    if (apiSessionId) {
      useAgentChatStore.getState().addMessage(apiSessionId, {
        id: `user-${String(Date.now())}`,
        type: 'text',
        timestamp: Date.now(),
        text: resolved,
      })
      useAgentChatStore.getState().setState(apiSessionId, 'running')
      useSessionStore.getState().updateAgentMonitor(apiSessionId, { status: 'working' })
      const session = useSessionStore.getState().sessions.find(s => s.id === apiSessionId)
      const repoList = useRepoStore.getState().repos
      const repo = session?.repoId
        ? repoList.find(r => r.id === session.repoId)
        : repoList.find(r => ctx.directory.startsWith(`${r.rootDir}/`) || ctx.directory === r.rootDir)
      const agent = ctx.agentId ? useAgentStore.getState().agents.find((a: AgentConfig) => a.id === ctx.agentId) : undefined
      void window.agentSdk.send(apiSessionId, resolved, {
        cwd: ctx.directory,
        permissionMode: (repo?.skipApproval ? 'bypassPermissions' : 'default'),
        env: agent?.env,
        sdkSessionId: session?.sdkSessionId,
      })
    } else if (ctx.agentPtyId) {
      await sendAgentPrompt(ctx.agentPtyId, resolved)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function executeAction(action: ActionDefinition, ctx: ActionExecutionContext): Promise<ActionResult> {
  const resolved = substituteTemplate(action.template, { context: ctx.templateVars, args: ctx.argValues })

  const result = isShellTemplate(resolved)
    ? await executeShell(resolved, ctx)
    : await executeAgent(resolved, ctx)

  if (result.success) applySetStage(action)
  return result
}
