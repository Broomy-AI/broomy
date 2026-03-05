// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isClaudeCodeAgent, sendSkillAwarePrompt } from './skillAwarePrompt'
import { useAgentStore } from '../store/agents'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isClaudeCodeAgent', () => {
  it('returns false for null agentId', () => {
    expect(isClaudeCodeAgent(null)).toBe(false)
  })

  it('returns false when agent not found', () => {
    useAgentStore.setState({ agents: [] })
    expect(isClaudeCodeAgent('unknown')).toBe(false)
  })

  it('returns true when agent command is "claude"', () => {
    useAgentStore.setState({ agents: [{ id: 'a1', name: 'Claude', command: 'claude' }] })
    expect(isClaudeCodeAgent('a1')).toBe(true)
  })

  it('returns true when command starts with "claude" and has args', () => {
    useAgentStore.setState({ agents: [{ id: 'a1', name: 'Claude', command: 'claude --dangerously-skip-permissions' }] })
    expect(isClaudeCodeAgent('a1')).toBe(true)
  })

  it('returns true when command is a path ending in /claude', () => {
    useAgentStore.setState({ agents: [{ id: 'a1', name: 'Claude', command: '/usr/local/bin/claude' }] })
    expect(isClaudeCodeAgent('a1')).toBe(true)
  })

  it('returns false for non-claude agents', () => {
    useAgentStore.setState({ agents: [{ id: 'a1', name: 'Cursor', command: 'cursor' }] })
    expect(isClaudeCodeAgent('a1')).toBe(false)
  })
})

describe('sendSkillAwarePrompt', () => {
  it('sends fallback prompt for non-Claude agent', async () => {
    useAgentStore.setState({ agents: [{ id: 'a1', name: 'Other', command: 'other-agent' }] })

    const result = await sendSkillAwarePrompt({
      action: 'commit',
      agentPtyId: 'pty-1',
      directory: '/repo',
      agentId: 'a1',
      fallbackPrompt: 'fallback text',
    })

    expect(result).toEqual({ isClaudeCode: false, skillExists: false })
    expect(window.pty.write).toHaveBeenCalledWith('pty-1', 'fallback text')
  })

  it('sends fallback prompt when skill file missing for Claude agent', async () => {
    useAgentStore.setState({ agents: [{ id: 'a1', name: 'Claude', command: 'claude' }] })
    vi.mocked(window.fs.exists).mockResolvedValue(false)

    const result = await sendSkillAwarePrompt({
      action: 'commit',
      agentPtyId: 'pty-1',
      directory: '/repo',
      agentId: 'a1',
      fallbackPrompt: 'fallback text',
    })

    expect(result).toEqual({ isClaudeCode: true, skillExists: false })
    expect(window.pty.write).toHaveBeenCalledWith('pty-1', 'fallback text')
  })

  it('sends slash command when skill file exists for Claude agent', async () => {
    useAgentStore.setState({ agents: [{ id: 'a1', name: 'Claude', command: 'claude' }] })
    vi.mocked(window.fs.exists).mockResolvedValue(true)

    const result = await sendSkillAwarePrompt({
      action: 'commit',
      agentPtyId: 'pty-1',
      directory: '/repo',
      agentId: 'a1',
      fallbackPrompt: 'fallback text',
    })

    expect(result).toEqual({ isClaudeCode: true, skillExists: true })
    expect(window.fs.exists).toHaveBeenCalledWith('/repo/.claude/commands/broomy-action-commit.md')
    expect(window.pty.write).toHaveBeenCalledWith('pty-1', '/broomy-action-commit')
  })

  it('writes context.json when context is provided and skill exists', async () => {
    useAgentStore.setState({ agents: [{ id: 'a1', name: 'Claude', command: 'claude' }] })
    vi.mocked(window.fs.exists).mockResolvedValue(true)

    await sendSkillAwarePrompt({
      action: 'plan-issue',
      agentPtyId: 'pty-1',
      directory: '/repo',
      agentId: 'a1',
      fallbackPrompt: 'fallback',
      context: { issueNumber: 42 },
    })

    expect(window.fs.mkdir).toHaveBeenCalledWith('/repo/.broomy')
    expect(window.fs.mkdir).toHaveBeenCalledWith('/repo/.broomy/output')
    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/repo/.broomy/output/context.json',
      JSON.stringify({ issueNumber: 42 }, null, 2),
    )
  })

  it('does not write context.json when skill file is missing', async () => {
    useAgentStore.setState({ agents: [{ id: 'a1', name: 'Claude', command: 'claude' }] })
    vi.mocked(window.fs.exists).mockResolvedValue(false)

    await sendSkillAwarePrompt({
      action: 'plan-issue',
      agentPtyId: 'pty-1',
      directory: '/repo',
      agentId: 'a1',
      fallbackPrompt: 'fallback',
      context: { issueNumber: 42 },
    })

    expect(window.fs.writeFile).not.toHaveBeenCalled()
  })
})
