/**
 * Executes modular actions defined in commands.json.
 *
 * Handles both shell commands (run via IPC, show spinner/errors) and agent actions
 * (send prompt to agent terminal with agent-specific overrides).
 */
import type { ActionDefinition, TemplateVars } from './commandsConfig'
import { resolveTemplateVars, detectAgentType } from './commandsConfig'
import { sendAgentPrompt } from '../../shared/utils/focusHelpers'
import { useAgentStore, type AgentConfig } from '../../store/agents'
import { useAgentChatStore } from '../../store/agentChat'
import { useSessionStore } from '../../store/sessions'
import { useRepoStore } from '../../store/repos'

export interface ActionExecutionContext {
  directory: string
  agentPtyId?: string
  agentId?: string | null
  templateVars: TemplateVars
  /** Called after successful shell execution to refresh git status */
  onGitStatusRefresh?: () => void
}

export interface ActionResult {
  success: boolean
  error?: string
}

/**
 * Execute a shell action via IPC.
 */
async function executeShellAction(
  action: ActionDefinition,
  ctx: ActionExecutionContext,
): Promise<ActionResult> {
  if (!action.command) {
    return { success: false, error: 'No command specified' }
  }

  const command = resolveTemplateVars(action.command, ctx.templateVars)

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

/**
 * Execute an agent action by sending a prompt to the agent terminal.
 */
/** Check if the active session is using API mode (Agent SDK) instead of terminal. */
function getApiModeSessionId(agentId?: string | null): string | null {
  if (!agentId) return null
  const agent = useAgentStore.getState().agents.find((a: AgentConfig) => a.id === agentId)
  if (agent?.connectionMode !== 'api') return null
  const activeSessionId = useSessionStore.getState().activeSessionId
  return activeSessionId
}

async function executeAgentAction(
  action: ActionDefinition,
  ctx: ActionExecutionContext,
): Promise<ActionResult> {
  const apiSessionId = getApiModeSessionId(ctx.agentId)

  if (!apiSessionId && !ctx.agentPtyId) {
    return { success: false, error: 'No agent terminal available' }
  }

  try {
    // Always write context.json so any prompt can reference session data
    const outputDir = `${ctx.directory}/.broomy/output`
    await window.fs.mkdir(`${ctx.directory}/.broomy`)
    await window.fs.mkdir(outputDir)
    await window.fs.writeFile(`${outputDir}/context.json`, JSON.stringify(ctx.templateVars, null, 2))

    const prompt = resolveAgentPrompt(action, ctx)

    if (apiSessionId) {
      // Send through the Agent SDK chat
      useAgentChatStore.getState().addMessage(apiSessionId, {
        id: `user-${String(Date.now())}`,
        type: 'text',
        timestamp: Date.now(),
        text: prompt,
      })
      useAgentChatStore.getState().setState(apiSessionId, 'running')
      useSessionStore.getState().updateAgentMonitor(apiSessionId, { status: 'working' })
      const session = useSessionStore.getState().sessions.find(s => s.id === apiSessionId)
      const repoList = useRepoStore.getState().repos
      const repo = session?.repoId
        ? repoList.find(r => r.id === session.repoId)
        : repoList.find(r => ctx.directory.startsWith(`${r.rootDir}/`) || ctx.directory === r.rootDir)
      const agent = ctx.agentId ? useAgentStore.getState().agents.find((a: AgentConfig) => a.id === ctx.agentId) : undefined
      void window.agentSdk.send(apiSessionId, prompt, {
        cwd: ctx.directory,
        permissionMode: (repo?.skipApproval ? 'bypassPermissions' : 'default'),
        env: agent?.env,
        sdkSessionId: session?.sdkSessionId,
      })
    } else if (ctx.agentPtyId) {
      await sendAgentPrompt(ctx.agentPtyId, prompt)
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Resolve the prompt to send, considering agent-specific overrides.
 *
 * Priority: agent-specific override prompt > base action prompt > label fallback.
 */
function resolveAgentPrompt(action: ActionDefinition, ctx: ActionExecutionContext): string {
  if (action.agents && ctx.agentId) {
    const agent = useAgentStore.getState().agents.find((a: AgentConfig) => a.id === ctx.agentId)
    if (agent) {
      const agentType = detectAgentType(agent.command)
      if (agentType && agentType in action.agents) {
        const override = action.agents[agentType]
        if (override.prompt) {
          return resolveTemplateVars(override.prompt, ctx.templateVars)
        }
      }
    }
  }

  if (action.prompt) {
    return resolveTemplateVars(action.prompt, ctx.templateVars)
  }

  return `Run the "${action.label}" action`
}

/**
 * Execute an action (shell or agent).
 */
export async function executeAction(
  action: ActionDefinition,
  ctx: ActionExecutionContext,
): Promise<ActionResult> {
  if (action.type === 'shell') {
    return executeShellAction(action, ctx)
  }
  return executeAgentAction(action, ctx)
}
