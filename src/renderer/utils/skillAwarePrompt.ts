/**
 * Skill-aware prompt dispatch for Claude Code integration.
 *
 * Wraps sendAgentPrompt to check whether the agent is Claude Code and whether
 * a matching `.claude/commands/broomy-action-<action>.md` skill file exists.
 * When both conditions are met, sends the slash command instead of the fallback prompt.
 */
import { useAgentStore, type AgentConfig } from '../store/agents'
import { sendAgentPrompt } from './focusHelpers'
import type { SkillActionName } from './skillActions'
import { skillCommandPath } from './skillActions'

export function isClaudeCodeAgent(agentId: string | null): boolean {
  if (!agentId) return false
  const agent = useAgentStore.getState().agents.find((a: AgentConfig) => a.id === agentId)
  if (!agent) return false
  // Check if the base command starts with "claude" (covers "claude", "claude code", paths like /usr/bin/claude)
  const baseCommand = agent.command.trim().split(/\s+/)[0]
  return baseCommand === 'claude' || baseCommand.endsWith('/claude')
}

export interface SkillAwarePromptOptions {
  action: SkillActionName
  agentPtyId: string
  directory: string
  agentId: string | null
  fallbackPrompt: string
  context?: Record<string, unknown>
}

export interface SkillAwarePromptResult {
  isClaudeCode: boolean
  skillExists: boolean
}

export async function sendSkillAwarePrompt(
  options: SkillAwarePromptOptions,
): Promise<SkillAwarePromptResult> {
  const { action, agentPtyId, directory, agentId, fallbackPrompt, context } = options

  const claudeCode = isClaudeCodeAgent(agentId)
  if (!claudeCode) {
    await sendAgentPrompt(agentPtyId, fallbackPrompt)
    return { isClaudeCode: false, skillExists: false }
  }

  const path = skillCommandPath(directory, action)
  const exists = await window.fs.exists(path)

  if (!exists) {
    await sendAgentPrompt(agentPtyId, fallbackPrompt)
    return { isClaudeCode: true, skillExists: false }
  }

  // Write context file if provided
  if (context) {
    const outputDir = `${directory}/.broomy/output`
    await window.fs.mkdir(`${directory}/.broomy`)
    await window.fs.mkdir(outputDir)
    await window.fs.writeFile(`${outputDir}/context.json`, JSON.stringify(context, null, 2))
  }

  await sendAgentPrompt(agentPtyId, `/broomy-action-${action}`)
  return { isClaudeCode: true, skillExists: true }
}
