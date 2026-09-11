import { describe, it, expect } from 'vitest'
import { getAgentInstallUrl } from './agentInstallUrls'

describe('getAgentInstallUrl', () => {
  it('returns URL for known commands', () => {
    expect(getAgentInstallUrl('claude')).toBe('https://docs.anthropic.com/en/docs/claude-code/overview')
    expect(getAgentInstallUrl('codex')).toBe('https://github.com/openai/codex')
    expect(getAgentInstallUrl('gemini')).toBe('https://github.com/google-gemini/gemini-cli')
    expect(getAgentInstallUrl('copilot')).toBe('https://github.com/github/gh-copilot')
    expect(getAgentInstallUrl('aider')).toBe('https://aider.chat')
    expect(getAgentInstallUrl('junie')).toBe('https://www.jetbrains.com/help/junie/get-started-with-junie.html')
  })

  it('returns URL for multi-word commands like "gh copilot"', () => {
    expect(getAgentInstallUrl('gh copilot')).toBe('https://github.com/github/gh-copilot')
  })

  it('strips flags from commands', () => {
    expect(getAgentInstallUrl('claude --dangerously-skip-permissions')).toBe(
      'https://docs.anthropic.com/en/docs/claude-code/overview',
    )
    expect(getAgentInstallUrl('gh copilot --some-flag')).toBe('https://github.com/github/gh-copilot')
  })

  it('returns null for unknown commands', () => {
    expect(getAgentInstallUrl('unknown-agent')).toBeNull()
    expect(getAgentInstallUrl('my-custom-tool --flag')).toBeNull()
  })

  it('handles whitespace', () => {
    expect(getAgentInstallUrl('  claude  ')).toBe('https://docs.anthropic.com/en/docs/claude-code/overview')
  })
})
