// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../../test/react-setup'

vi.mock('./focusHelpers', () => ({
  sendAgentPrompt: vi.fn().mockResolvedValue(undefined),
  focusAgentTerminal: vi.fn(),
}))

vi.mock('../store/agents', () => ({
  useAgentStore: {
    getState: () => ({
      agents: [
        { id: 'agent-1', name: 'Claude', command: 'claude' },
        { id: 'agent-2', name: 'Aider', command: 'aider --model gpt-4' },
      ],
    }),
  },
}))

import { executeAction } from './actionExecutor'
import type { ActionExecutionContext } from './actionExecutor'
import type { ActionDefinition } from './commandsConfig'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeCtx(overrides: Partial<ActionExecutionContext> = {}): ActionExecutionContext {
  return {
    directory: '/repo',
    agentPtyId: 'pty-1',
    agentId: 'agent-1',
    templateVars: { main: 'main', branch: 'feature/test', directory: '/repo' },
    ...overrides,
  }
}

describe('executeAction - shell', () => {
  it('executes a shell command', async () => {
    vi.mocked(window.shell.exec).mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 })
    const onRefresh = vi.fn()

    const action: ActionDefinition = {
      id: 'sync', label: 'Sync', type: 'shell',
      command: 'git pull && git push', showWhen: [],
    }

    const result = await executeAction(action, makeCtx({ onGitStatusRefresh: onRefresh }))

    expect(result.success).toBe(true)
    expect(window.shell.exec).toHaveBeenCalledWith('git pull && git push', '/repo')
    expect(onRefresh).toHaveBeenCalled()
  })

  it('returns error when command fails', async () => {
    vi.mocked(window.shell.exec).mockResolvedValue({ success: false, stdout: '', stderr: 'fatal error', exitCode: 1 })

    const action: ActionDefinition = {
      id: 'sync', label: 'Sync', type: 'shell',
      command: 'git push', showWhen: [],
    }

    const result = await executeAction(action, makeCtx())
    expect(result.success).toBe(false)
    expect(result.error).toBe('fatal error')
  })

  it('returns error when no command specified', async () => {
    const action: ActionDefinition = {
      id: 'test', label: 'Test', type: 'shell', showWhen: [],
    }

    const result = await executeAction(action, makeCtx())
    expect(result.success).toBe(false)
    expect(result.error).toBe('No command specified')
  })

  it('handles thrown errors', async () => {
    vi.mocked(window.shell.exec).mockRejectedValue(new Error('network error'))

    const action: ActionDefinition = {
      id: 'sync', label: 'Sync', type: 'shell',
      command: 'git push', showWhen: [],
    }

    const result = await executeAction(action, makeCtx())
    expect(result.success).toBe(false)
    expect(result.error).toBe('network error')
  })

  it('resolves template vars in command', async () => {
    vi.mocked(window.shell.exec).mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 })

    const action: ActionDefinition = {
      id: 'push', label: 'Push', type: 'shell',
      command: 'git push origin HEAD:{main}', showWhen: [],
    }

    await executeAction(action, makeCtx())
    expect(window.shell.exec).toHaveBeenCalledWith('git push origin HEAD:main', '/repo')
  })
})

describe('executeAction - agent', () => {
  it('sends prompt to agent terminal', async () => {
    const { sendAgentPrompt } = await import('./focusHelpers')

    const action: ActionDefinition = {
      id: 'commit', label: 'Commit', type: 'agent',
      prompt: 'Make a commit', showWhen: [],
    }

    const result = await executeAction(action, makeCtx())
    expect(result.success).toBe(true)
    expect(sendAgentPrompt).toHaveBeenCalledWith('pty-1', 'Make a commit')
  })

  it('returns error when no agent terminal', async () => {
    const action: ActionDefinition = {
      id: 'commit', label: 'Commit', type: 'agent',
      prompt: 'Make a commit', showWhen: [],
    }

    const result = await executeAction(action, makeCtx({ agentPtyId: undefined }))
    expect(result.success).toBe(false)
    expect(result.error).toBe('No agent terminal available')
  })

  it('writes context.json with template vars before agent action', async () => {
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })

    const action: ActionDefinition = {
      id: 'push', label: 'Push', type: 'agent',
      prompt: 'Push it', showWhen: [],
    }

    await executeAction(action, makeCtx())

    expect(window.fs.mkdir).toHaveBeenCalledWith('/repo/.broomy')
    expect(window.fs.mkdir).toHaveBeenCalledWith('/repo/.broomy/output')
    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/repo/.broomy/output/context.json',
      expect.stringContaining('"main"')
    )
  })

  it('uses agent-specific prompt override', async () => {
    const { sendAgentPrompt } = await import('./focusHelpers')

    const action: ActionDefinition = {
      id: 'commit', label: 'Commit', type: 'agent',
      prompt: 'default prompt', showWhen: [],
      agents: { claude: { prompt: 'claude-specific prompt' } },
    }

    await executeAction(action, makeCtx({ agentId: 'agent-1' }))
    expect(sendAgentPrompt).toHaveBeenCalledWith('pty-1', 'claude-specific prompt')
  })

  it('falls back to default prompt when agent type has no override', async () => {
    const { sendAgentPrompt } = await import('./focusHelpers')

    const action: ActionDefinition = {
      id: 'commit', label: 'Commit', type: 'agent',
      prompt: 'default prompt', showWhen: [],
      agents: { aider: { prompt: 'aider-specific' } },
    }

    // agent-1 is claude, override is for aider only
    await executeAction(action, makeCtx({ agentId: 'agent-1' }))
    expect(sendAgentPrompt).toHaveBeenCalledWith('pty-1', 'default prompt')
  })

  it('falls back to label when no prompt is set', async () => {
    const { sendAgentPrompt } = await import('./focusHelpers')

    const action: ActionDefinition = {
      id: 'commit', label: 'Commit', type: 'agent', showWhen: [],
    }

    await executeAction(action, makeCtx())
    expect(sendAgentPrompt).toHaveBeenCalledWith('pty-1', 'Run the "Commit" action')
  })

  it('uses aider override when current agent is aider', async () => {
    const { sendAgentPrompt } = await import('./focusHelpers')

    const action: ActionDefinition = {
      id: 'commit', label: 'Commit', type: 'agent',
      prompt: 'default prompt', showWhen: [],
      agents: {
        claude: { prompt: 'claude prompt' },
        aider: { prompt: 'aider prompt' },
      },
    }

    // agent-2 is aider
    await executeAction(action, makeCtx({ agentId: 'agent-2' }))
    expect(sendAgentPrompt).toHaveBeenCalledWith('pty-1', 'aider prompt')
  })

  it('falls back to base prompt when override prompt is empty', async () => {
    const { sendAgentPrompt } = await import('./focusHelpers')

    const action: ActionDefinition = {
      id: 'commit', label: 'Commit', type: 'agent',
      prompt: 'base prompt', showWhen: [],
      agents: { claude: { prompt: '' } },
    }

    await executeAction(action, makeCtx({ agentId: 'agent-1' }))
    expect(sendAgentPrompt).toHaveBeenCalledWith('pty-1', 'base prompt')
  })

  it('resolves template vars in agent override prompt', async () => {
    const { sendAgentPrompt } = await import('./focusHelpers')

    const action: ActionDefinition = {
      id: 'pr', label: 'Create PR', type: 'agent',
      prompt: 'default', showWhen: [],
      agents: { claude: { prompt: 'Create PR against {main} on {branch}' } },
    }

    await executeAction(action, makeCtx({ agentId: 'agent-1' }))
    expect(sendAgentPrompt).toHaveBeenCalledWith('pty-1', 'Create PR against main on feature/test')
  })

  it('uses base prompt when agentId is null', async () => {
    const { sendAgentPrompt } = await import('./focusHelpers')

    const action: ActionDefinition = {
      id: 'commit', label: 'Commit', type: 'agent',
      prompt: 'base prompt', showWhen: [],
      agents: { claude: { prompt: 'claude prompt' } },
    }

    await executeAction(action, makeCtx({ agentId: null }))
    expect(sendAgentPrompt).toHaveBeenCalledWith('pty-1', 'base prompt')
  })

  it('handles errors during execution', async () => {
    vi.mocked(window.fs.mkdir).mockRejectedValue(new Error('mkdir failed'))

    const action: ActionDefinition = {
      id: 'push', label: 'Push', type: 'agent',
      prompt: 'Push', showWhen: [],
    }

    const result = await executeAction(action, makeCtx())
    expect(result.success).toBe(false)
    expect(result.error).toBe('mkdir failed')
  })
})
