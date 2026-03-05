/**
 * Executes modular actions defined in commands.json.
 *
 * Handles both shell commands (run via IPC, show spinner/errors) and agent actions
 * (send prompt to agent terminal with agent-specific overrides).
 */
import type { ActionDefinition, TemplateVars } from './commandsConfig'
import { resolveTemplateVars, detectAgentType } from './commandsConfig'
import { sendAgentPrompt } from './focusHelpers'
import { useAgentStore, type AgentConfig } from '../store/agents'

export interface ActionExecutionContext {
  directory: string
  agentPtyId?: string
  agentId?: string | null
  templateVars: TemplateVars
  /** Called before agent actions that use writePrompt with built-in builders */
  onWritePrompt?: (builder: string, outputPath: string) => Promise<void>
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
    return { success: false, error: result.stderr || `Command exited with code ${result.exitCode}` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Execute an agent action by sending a prompt to the agent terminal.
 */
async function executeAgentAction(
  action: ActionDefinition,
  ctx: ActionExecutionContext,
): Promise<ActionResult> {
  if (!ctx.agentPtyId) {
    return { success: false, error: 'No agent terminal available' }
  }

  try {
    // Write context.json if needed
    if (action.context) {
      const resolvedContext: Record<string, string> = {}
      for (const [key, value] of Object.entries(action.context)) {
        resolvedContext[key] = resolveTemplateVars(value, ctx.templateVars)
      }
      const outputDir = `${ctx.directory}/.broomy/output`
      await window.fs.mkdir(`${ctx.directory}/.broomy`)
      await window.fs.mkdir(outputDir)
      await window.fs.writeFile(`${outputDir}/context.json`, JSON.stringify(resolvedContext, null, 2))
    }

    // Run writePrompt builder if specified
    if (action.writePrompt && ctx.onWritePrompt) {
      const outputPath = resolveTemplateVars(action.writePrompt.file, ctx.templateVars)
      await ctx.onWritePrompt(action.writePrompt.builder, `${ctx.directory}/${outputPath}`)
    }

    // Determine what to send: agent-specific override or default
    const prompt = await resolveAgentPrompt(action, ctx)
    await sendAgentPrompt(ctx.agentPtyId, prompt)

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Resolve the prompt to send, considering agent-specific overrides.
 *
 * When a skill override is specified, checks whether the skill file exists
 * on disk (`.claude/commands/<skill>.md`). If missing, falls through to the
 * action's default prompt/promptFile so the action still works without skills.
 */
async function resolveAgentPrompt(action: ActionDefinition, ctx: ActionExecutionContext): Promise<string> {
  // Check for agent-specific override
  if (action.agents && ctx.agentId) {
    const agent = useAgentStore.getState().agents.find((a: AgentConfig) => a.id === ctx.agentId)
    if (agent) {
      const agentType = detectAgentType(agent.command)
      if (agentType && agentType in action.agents) {
        const override = action.agents[agentType]
        if (override.skill) {
          const skillPath = `${ctx.directory}/.claude/commands/${override.skill}.md`
          const exists = await window.fs.exists(skillPath)
          if (exists) {
            return `/${override.skill}`
          }
          // Skill file missing — fall through to default prompt/promptFile
        }
        if (override.prompt) {
          return resolveTemplateVars(override.prompt, ctx.templateVars)
        }
        if (override.promptFile) {
          return `Please read and follow the instructions in ${resolveTemplateVars(override.promptFile, ctx.templateVars)}`
        }
      }
    }
  }

  // Default: use prompt or promptFile
  if (action.prompt) {
    return resolveTemplateVars(action.prompt, ctx.templateVars)
  }
  if (action.promptFile) {
    return `Please read and follow the instructions in ${resolveTemplateVars(action.promptFile, ctx.templateVars)}`
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
