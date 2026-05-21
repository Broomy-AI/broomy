import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../shared/utils/focusHelpers', () => ({
  sendAgentPrompt: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../store/sessions', () => ({
  useSessionStore: {
    getState: () => ({ setSessionStage: vi.fn(), activeSessionId: 'sess', sessions: [] }),
  },
}))

vi.mock('../../store/agentChat', () => ({ useAgentChatStore: { getState: () => ({}) } }))
vi.mock('../../store/agents', () => ({ useAgentStore: { getState: () => ({ agents: [] }) } }))
vi.mock('../../store/repos', () => ({ useRepoStore: { getState: () => ({ repos: [] }) } }))

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as any).window = {
    fs: { mkdir: vi.fn(), writeFile: vi.fn() },
    shell: { exec: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 }) },
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
})
