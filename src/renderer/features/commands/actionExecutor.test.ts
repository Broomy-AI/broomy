import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../shared/utils/focusHelpers', () => ({
  sendAgentPrompt: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../store/sessions', () => ({
  useSessionStore: {
    getState: () => ({ setSessionStage: vi.fn(), activeSessionId: 'sess', sessions: [] }),
  },
}))

vi.mock('../../store/agentChat', () => ({ useAgentChatStore: { getState: () => ({ addMessage: vi.fn(), setState: vi.fn() }) } }))
vi.mock('../../store/agents', () => ({ useAgentStore: { getState: () => ({ agents: [] }) } }))
vi.mock('../../store/repos', () => ({ useRepoStore: { getState: () => ({ repos: [] }) } }))
vi.mock('../../../shared/featureFlags', () => ({ ENABLE_AGENT_SDK: false }))

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as any).window = {
    fs: { mkdir: vi.fn().mockResolvedValue(undefined), writeFile: vi.fn().mockResolvedValue(undefined) },
    shell: { exec: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 }) },
    agentSdk: { send: vi.fn().mockResolvedValue(undefined) },
  }
})

describe('executeAction', () => {
  it('runs shell action when template starts with !', async () => {
    const { executeAction } = await import('./actionExecutor')
    const result = await executeAction(
      { id: 'a', label: 'Push', template: '!git push' },
      {
        directory: '/repo',
        agentPtyId: 'pty-1',
        templateVars: { main: 'main', branch: 'b', directory: '/repo', issueNumber: '' },
        argValues: {},
      },
    )
    expect(result.success).toBe(true)
    expect((window.shell.exec as any)).toHaveBeenCalledWith('git push', '/repo')
  })

  it('substitutes context vars in shell template', async () => {
    const { executeAction } = await import('./actionExecutor')
    await executeAction(
      { id: 'a', label: 'X', template: '!echo {branch}' },
      { directory: '/r', templateVars: { main: 'main', branch: 'feat', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    expect((window.shell.exec as any)).toHaveBeenCalledWith('echo feat', '/r')
  })

  it('sends agent prompt when template lacks ! prefix', async () => {
    const { executeAction } = await import('./actionExecutor')
    const { sendAgentPrompt } = await import('../../shared/utils/focusHelpers')
    await executeAction(
      { id: 'a', label: 'Plan', template: '/plan {topic}' },
      {
        directory: '/r',
        agentPtyId: 'pty-1',
        templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' },
        argValues: { topic: { value: 'auth' } },
      },
    )
    expect(sendAgentPrompt).toHaveBeenCalledWith('pty-1', '/plan auth')
  })

  it('strips disabled optional flag-groups', async () => {
    const { executeAction } = await import('./actionExecutor')
    const { sendAgentPrompt } = await import('../../shared/utils/focusHelpers')
    await executeAction(
      { id: 'a', label: 'Plan', template: '/plan {topic} --depth {depth}' },
      {
        directory: '/r',
        agentPtyId: 'pty-1',
        templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' },
        argValues: { topic: { value: 'auth' }, depth: { value: '', enabled: false } },
      },
    )
    expect(sendAgentPrompt).toHaveBeenCalledWith('pty-1', '/plan auth')
  })

  it('calls setSessionStage after successful shell exec', async () => {
    const setStage = vi.fn()
    const useSessionStore = (await import('../../store/sessions')).useSessionStore
    ;(useSessionStore.getState as any) = () => ({ setSessionStage: setStage, activeSessionId: 'sess', sessions: [] })

    const { executeAction } = await import('./actionExecutor')
    await executeAction(
      { id: 'a', label: 'Push', template: '!git push', setStage: 'pushed' },
      { directory: '/r', templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    expect(setStage).toHaveBeenCalledWith('sess', 'pushed')
  })

  it('setStage: null writes the default stage', async () => {
    const setStage = vi.fn()
    const useSessionStore = (await import('../../store/sessions')).useSessionStore
    ;(useSessionStore.getState as any) = () => ({ setSessionStage: setStage, activeSessionId: 'sess', sessions: [] })

    const { executeAction } = await import('./actionExecutor')
    await executeAction(
      { id: 'a', label: 'Finish', template: '/finish', setStage: null },
      { directory: '/r', agentPtyId: 'pty-1', templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    expect(setStage).toHaveBeenCalledWith('sess', 'planning')
  })

  it('shell exec returning success: false returns failure with stderr', async () => {
    ;(window.shell.exec as any).mockResolvedValue({ success: false, stdout: '', stderr: 'push failed', exitCode: 1 })
    const { executeAction } = await import('./actionExecutor')
    const result = await executeAction(
      { id: 'a', label: 'Push', template: '!git push' },
      { directory: '/r', templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('push failed')
  })

  it('shell exec failure with CONFLICT in output is treated as success', async () => {
    ;(window.shell.exec as any).mockResolvedValue({ success: false, stdout: 'CONFLICT (content): Merge conflict in foo.ts', stderr: '', exitCode: 1 })
    const onGitStatusRefresh = vi.fn()
    const { executeAction } = await import('./actionExecutor')
    const result = await executeAction(
      { id: 'a', label: 'Merge', template: '!git merge main' },
      { directory: '/r', templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {}, onGitStatusRefresh },
    )
    expect(result.success).toBe(true)
    expect(onGitStatusRefresh).toHaveBeenCalled()
  })

  it('shell exec failure with "Merge conflict" in stderr is treated as success', async () => {
    ;(window.shell.exec as any).mockResolvedValue({ success: false, stdout: '', stderr: 'Merge conflict in bar.ts', exitCode: 1 })
    const { executeAction } = await import('./actionExecutor')
    const result = await executeAction(
      { id: 'a', label: 'Merge', template: '!git merge main' },
      { directory: '/r', templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    expect(result.success).toBe(true)
  })

  it('shell exec success fires onGitStatusRefresh', async () => {
    const onGitStatusRefresh = vi.fn()
    const { executeAction } = await import('./actionExecutor')
    await executeAction(
      { id: 'a', label: 'Push', template: '!git push' },
      { directory: '/r', templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {}, onGitStatusRefresh },
    )
    expect(onGitStatusRefresh).toHaveBeenCalled()
  })

  it('shell exec throwing returns failure with error message', async () => {
    ;(window.shell.exec as any).mockRejectedValue(new Error('network error'))
    const { executeAction } = await import('./actionExecutor')
    const result = await executeAction(
      { id: 'a', label: 'Push', template: '!git push' },
      { directory: '/r', templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('network error')
  })

  it('fails with a clear message when the session has no agent terminal', async () => {
    const { executeAction } = await import('./actionExecutor')
    const result = await executeAction(
      { id: 'a', label: 'Plan', template: '/plan' },
      { directory: '/r', agentPtyId: undefined, templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    expect(result).toEqual({
      success: false,
      error: 'No agent terminal available — resume the session if it is paused.',
    })
  })

  it('agent path: no agentPtyId and not in API mode returns error', async () => {
    const { executeAction } = await import('./actionExecutor')
    const result = await executeAction(
      { id: 'a', label: 'Plan', template: '/plan' },
      { directory: '/r', templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('No agent terminal available — resume the session if it is paused.')
  })

  it('agent path: fs.mkdir throwing returns failure', async () => {
    ;(window.fs.mkdir as any).mockRejectedValue(new Error('disk full'))
    const { executeAction } = await import('./actionExecutor')
    const result = await executeAction(
      { id: 'a', label: 'Plan', template: '/plan' },
      { directory: '/r', agentPtyId: 'pty-1', templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('disk full')
  })

  it('applySetStage: no-op when setStage is undefined', async () => {
    const setStage = vi.fn()
    const useSessionStore = (await import('../../store/sessions')).useSessionStore
    ;(useSessionStore.getState as any) = () => ({ setSessionStage: setStage, activeSessionId: 'sess', sessions: [] })

    const { executeAction } = await import('./actionExecutor')
    await executeAction(
      { id: 'a', label: 'Push', template: '!git push' },
      { directory: '/r', templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    // setStage should NOT have been called because action.setStage is undefined
    expect(setStage).not.toHaveBeenCalled()
  })

  it('applySetStage: no-op when there is no activeSessionId', async () => {
    const setStage = vi.fn()
    const useSessionStore = (await import('../../store/sessions')).useSessionStore
    ;(useSessionStore.getState as any) = () => ({ setSessionStage: setStage, activeSessionId: null, sessions: [] })

    const { executeAction } = await import('./actionExecutor')
    await executeAction(
      { id: 'a', label: 'Push', template: '!git push', setStage: 'done' },
      { directory: '/r', templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    expect(setStage).not.toHaveBeenCalled()
  })
})

describe('executeAction (API mode)', () => {
  beforeEach(async () => {
    vi.resetModules()
    // Re-mock with ENABLE_AGENT_SDK = true
    vi.doMock('../../../shared/featureFlags', () => ({ ENABLE_AGENT_SDK: true }))
    vi.doMock('../../shared/utils/focusHelpers', () => ({ sendAgentPrompt: vi.fn().mockResolvedValue(undefined) }))

    const addMessage = vi.fn()
    const setState = vi.fn()
    vi.doMock('../../store/agentChat', () => ({ useAgentChatStore: { getState: () => ({ addMessage, setState }) } }))

    vi.doMock('../../store/agents', () => ({
      useAgentStore: {
        getState: () => ({
          agents: [{ id: 'agent-api', connectionMode: 'api', env: undefined }],
        }),
      },
    }))

    vi.doMock('../../store/sessions', () => ({
      useSessionStore: {
        getState: () => ({
          activeSessionId: 'sess-api',
          setSessionStage: vi.fn(),
          sessions: [{ id: 'sess-api', repoId: 'repo-1', sdkSessionId: undefined }],
          updateAgentMonitor: vi.fn(),
        }),
      },
    }))

    vi.doMock('../../store/repos', () => ({
      useRepoStore: {
        getState: () => ({
          repos: [{ id: 'repo-1', rootDir: '/r', skipApproval: false }],
        }),
      },
    }))

    ;(globalThis as any).window = {
      fs: { mkdir: vi.fn().mockResolvedValue(undefined), writeFile: vi.fn().mockResolvedValue(undefined) },
      shell: { exec: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 }) },
      agentSdk: { send: vi.fn().mockResolvedValue(undefined) },
    }
  })

  it('sends via agentSdk.send when agent connectionMode is api', async () => {
    const { executeAction } = await import('./actionExecutor')
    const result = await executeAction(
      { id: 'a', label: 'Plan', template: '/plan' },
      {
        directory: '/r',
        agentId: 'agent-api',
        templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' },
        argValues: {},
      },
    )
    expect(result.success).toBe(true)
    expect((window.agentSdk.send as any)).toHaveBeenCalledWith(
      'sess-api',
      '/plan',
      expect.objectContaining({ cwd: '/r' }),
    )
  })

  it('fails instead of dispatching when the active API-mode session is paused', async () => {
    vi.doMock('../../store/sessions', () => ({
      useSessionStore: {
        getState: () => ({
          activeSessionId: 'sess-api',
          setSessionStage: vi.fn(),
          sessions: [{ id: 'sess-api', repoId: 'repo-1', sdkSessionId: undefined, isPaused: true }],
          updateAgentMonitor: vi.fn(),
        }),
      },
    }))

    const { executeAction } = await import('./actionExecutor')
    const result = await executeAction(
      { id: 'a', label: 'Plan', template: '/plan' },
      {
        directory: '/r',
        agentId: 'agent-api',
        templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' },
        argValues: {},
      },
    )
    expect(result).toEqual({
      success: false,
      error: 'No agent terminal available — resume the session if it is paused.',
    })
    expect(window.agentSdk.send).not.toHaveBeenCalled()
  })
})
