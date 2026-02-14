// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppCallbacks } from './useAppCallbacks'
import { useErrorStore } from '../store/errors'

// Build a default deps object with fresh mocks for every test
function makeDeps(overrides: Partial<Parameters<typeof useAppCallbacks>[0]> = {}) {
  return {
    sessions: [],
    activeSessionId: null,
    agents: [],
    repos: [],
    addSession: vi.fn().mockResolvedValue(undefined),
    removeSession: vi.fn(),
    setActiveSession: vi.fn(),
    togglePanel: vi.fn(),
    updateLayoutSize: vi.fn(),
    setFileViewerPosition: vi.fn(),
    updatePrState: vi.fn(),
    setShowNewSessionDialog: vi.fn(),
    ...overrides,
  }
}

describe('useAppCallbacks', () => {
  beforeEach(() => {
    useErrorStore.setState({ errors: [], hasUnread: false, detailError: null })
    vi.clearAllMocks()
  })

  // --- handleNewSession ---
  it('handleNewSession calls setShowNewSessionDialog(true)', () => {
    const deps = makeDeps()
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleNewSession())
    expect(deps.setShowNewSessionDialog).toHaveBeenCalledWith(true)
  })

  // --- handleCancelNewSession ---
  it('handleCancelNewSession calls setShowNewSessionDialog(false)', () => {
    const deps = makeDeps()
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleCancelNewSession())
    expect(deps.setShowNewSessionDialog).toHaveBeenCalledWith(false)
  })

  // --- handleNewSessionComplete ---
  it('handleNewSessionComplete calls addSession then hides dialog', async () => {
    const deps = makeDeps()
    const { result } = renderHook(() => useAppCallbacks(deps))
    await act(() => result.current.handleNewSessionComplete('/dir', 'agent-1'))
    expect(deps.addSession).toHaveBeenCalledWith('/dir', 'agent-1', undefined)
    expect(deps.setShowNewSessionDialog).toHaveBeenCalledWith(false)
  })

  it('handleNewSessionComplete passes extra options through', async () => {
    const deps = makeDeps()
    const extra = { repoId: 'r1', issueNumber: 42, issueTitle: 'Fix bug' }
    const { result } = renderHook(() => useAppCallbacks(deps))
    await act(() => result.current.handleNewSessionComplete('/dir', null, extra))
    expect(deps.addSession).toHaveBeenCalledWith('/dir', null, extra)
  })

  it('handleNewSessionComplete records error and still hides dialog when addSession rejects', async () => {
    const deps = makeDeps({ addSession: vi.fn().mockRejectedValue(new Error('boom')) })
    const { result } = renderHook(() => useAppCallbacks(deps))
    await act(() => result.current.handleNewSessionComplete('/dir', 'a1'))
    expect(deps.setShowNewSessionDialog).toHaveBeenCalledWith(false)
    expect(useErrorStore.getState().errors).toHaveLength(1)
    expect(useErrorStore.getState().errors[0].message).toContain('boom')
  })

  it('handleNewSessionComplete handles non-Error rejections', async () => {
    const deps = makeDeps({ addSession: vi.fn().mockRejectedValue('string-error') })
    const { result } = renderHook(() => useAppCallbacks(deps))
    await act(() => result.current.handleNewSessionComplete('/dir', null))
    expect(useErrorStore.getState().errors[0].message).toContain('string-error')
  })

  // --- refreshPrStatus ---
  it('refreshPrStatus calls gh.prStatus for each session and updates state', async () => {
    const sessions = [
      { id: 's1', directory: '/d1' },
      { id: 's2', directory: '/d2' },
    ] as Parameters<typeof useAppCallbacks>[0]['sessions']
    const deps = makeDeps({ sessions })
    vi.mocked(window.gh.prStatus)
      .mockResolvedValueOnce({ state: 'open', number: 10, url: 'http://pr/10' } as never)
      .mockResolvedValueOnce(null)
    const { result } = renderHook(() => useAppCallbacks(deps))
    await act(() => result.current.refreshPrStatus())
    expect(deps.updatePrState).toHaveBeenCalledWith('s1', 'open', 10, 'http://pr/10')
    expect(deps.updatePrState).toHaveBeenCalledWith('s2', null)
  })

  it('refreshPrStatus ignores errors from individual sessions', async () => {
    const sessions = [{ id: 's1', directory: '/d1' }] as Parameters<typeof useAppCallbacks>[0]['sessions']
    const deps = makeDeps({ sessions })
    vi.mocked(window.gh.prStatus).mockRejectedValue(new Error('net'))
    const { result } = renderHook(() => useAppCallbacks(deps))
    // Should not throw
    await act(() => result.current.refreshPrStatus())
    expect(deps.updatePrState).not.toHaveBeenCalled()
  })

  // --- getAgentCommand / getAgentEnv ---
  it('getAgentCommand returns command for matching agent', () => {
    const agents = [{ id: 'a1', name: 'Agent', command: 'claude' }] as Parameters<typeof useAppCallbacks>[0]['agents']
    const deps = makeDeps({ agents })
    const { result } = renderHook(() => useAppCallbacks(deps))
    const cmd = result.current.getAgentCommand({ agentId: 'a1' } as never)
    expect(cmd).toBe('claude')
  })

  it('getAgentCommand returns undefined when session has no agentId', () => {
    const deps = makeDeps()
    const { result } = renderHook(() => useAppCallbacks(deps))
    expect(result.current.getAgentCommand({ agentId: null } as never)).toBeUndefined()
  })

  it('getAgentCommand returns undefined when agent not found', () => {
    const deps = makeDeps({ agents: [] })
    const { result } = renderHook(() => useAppCallbacks(deps))
    expect(result.current.getAgentCommand({ agentId: 'missing' } as never)).toBeUndefined()
  })

  it('getAgentEnv returns env for matching agent', () => {
    const env = { KEY: 'val' }
    const agents = [{ id: 'a1', name: 'Agent', command: 'claude', env }] as Parameters<typeof useAppCallbacks>[0]['agents']
    const deps = makeDeps({ agents })
    const { result } = renderHook(() => useAppCallbacks(deps))
    expect(result.current.getAgentEnv({ agentId: 'a1' } as never)).toEqual(env)
  })

  it('getAgentEnv returns undefined when session has no agentId', () => {
    const deps = makeDeps()
    const { result } = renderHook(() => useAppCallbacks(deps))
    expect(result.current.getAgentEnv({ agentId: null } as never)).toBeUndefined()
  })

  // --- handleLayoutSizeChange ---
  it('handleLayoutSizeChange calls updateLayoutSize with activeSessionId', () => {
    const deps = makeDeps({ activeSessionId: 'sess-1' })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleLayoutSizeChange('explorerWidth', 300))
    expect(deps.updateLayoutSize).toHaveBeenCalledWith('sess-1', 'explorerWidth', 300)
  })

  it('handleLayoutSizeChange is a no-op when no activeSessionId', () => {
    const deps = makeDeps({ activeSessionId: null })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleLayoutSizeChange('explorerWidth', 300))
    expect(deps.updateLayoutSize).not.toHaveBeenCalled()
  })

  // --- handleFileViewerPositionChange ---
  it('handleFileViewerPositionChange calls setFileViewerPosition', () => {
    const deps = makeDeps({ activeSessionId: 'sess-1' })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleFileViewerPositionChange('left'))
    expect(deps.setFileViewerPosition).toHaveBeenCalledWith('sess-1', 'left')
  })

  it('handleFileViewerPositionChange is a no-op when no activeSessionId', () => {
    const deps = makeDeps({ activeSessionId: null })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleFileViewerPositionChange('top'))
    expect(deps.setFileViewerPosition).not.toHaveBeenCalled()
  })

  // --- handleSelectSession ---
  it('handleSelectSession calls setActiveSession', () => {
    const deps = makeDeps()
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleSelectSession('sess-2'))
    expect(deps.setActiveSession).toHaveBeenCalledWith('sess-2')
  })

  // --- handleTogglePanel ---
  it('handleTogglePanel calls togglePanel with activeSessionId', () => {
    const deps = makeDeps({ activeSessionId: 'sess-1' })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleTogglePanel('explorer'))
    expect(deps.togglePanel).toHaveBeenCalledWith('sess-1', 'explorer')
  })

  it('handleTogglePanel is a no-op when no activeSessionId', () => {
    const deps = makeDeps({ activeSessionId: null })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleTogglePanel('explorer'))
    expect(deps.togglePanel).not.toHaveBeenCalled()
  })

  // --- handleToggleFileViewer ---
  it('handleToggleFileViewer toggles the fileViewer panel', () => {
    const deps = makeDeps({ activeSessionId: 'sess-1' })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleToggleFileViewer())
    expect(deps.togglePanel).toHaveBeenCalledWith('sess-1', 'fileViewer')
  })

  it('handleToggleFileViewer is a no-op when no activeSessionId', () => {
    const deps = makeDeps({ activeSessionId: null })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleToggleFileViewer())
    expect(deps.togglePanel).not.toHaveBeenCalled()
  })

  // --- handleDeleteSession ---
  it('handleDeleteSession removes session without worktree cleanup when deleteWorktree is false', () => {
    const sessions = [{ id: 's1', directory: '/d1', repoId: 'r1', branch: 'feat' }] as Parameters<typeof useAppCallbacks>[0]['sessions']
    const deps = makeDeps({ sessions })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleDeleteSession('s1', false))
    expect(deps.removeSession).toHaveBeenCalledWith('s1')
    expect(window.git.worktreeRemove).not.toHaveBeenCalled()
  })

  it('handleDeleteSession removes session and cleans up worktree when deleteWorktree is true', async () => {
    const sessions = [{ id: 's1', directory: '/work/feat', repoId: 'r1', branch: 'feat' }] as Parameters<typeof useAppCallbacks>[0]['sessions']
    const repos = [{ id: 'r1', rootDir: '/work', defaultBranch: 'main' }]
    vi.mocked(window.git.worktreeRemove).mockResolvedValue({ success: true })
    vi.mocked(window.git.deleteBranch).mockResolvedValue({ success: true })
    const deps = makeDeps({ sessions, repos })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleDeleteSession('s1', true))
    expect(deps.removeSession).toHaveBeenCalledWith('s1')
    // Let async background work settle
    await vi.waitFor(() => {
      expect(window.git.worktreeRemove).toHaveBeenCalledWith('/work/main', '/work/feat')
      expect(window.git.deleteBranch).toHaveBeenCalledWith('/work/main', 'feat')
    })
  })

  it('handleDeleteSession adds error when worktreeRemove fails', async () => {
    const sessions = [{ id: 's1', directory: '/w/feat', repoId: 'r1', branch: 'feat' }] as Parameters<typeof useAppCallbacks>[0]['sessions']
    const repos = [{ id: 'r1', rootDir: '/w', defaultBranch: 'main' }]
    vi.mocked(window.git.worktreeRemove).mockResolvedValue({ success: false, error: 'in use' })
    vi.mocked(window.git.deleteBranch).mockResolvedValue({ success: true })
    const deps = makeDeps({ sessions, repos })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleDeleteSession('s1', true))
    await vi.waitFor(() => {
      expect(useErrorStore.getState().errors.some(e => e.message.includes('in use'))).toBe(true)
    })
  })

  it('handleDeleteSession adds error when worktreeRemove throws', async () => {
    const sessions = [{ id: 's1', directory: '/w/feat', repoId: 'r1', branch: 'feat' }] as Parameters<typeof useAppCallbacks>[0]['sessions']
    const repos = [{ id: 'r1', rootDir: '/w', defaultBranch: 'main' }]
    vi.mocked(window.git.worktreeRemove).mockRejectedValue(new Error('crash'))
    vi.mocked(window.git.deleteBranch).mockResolvedValue({ success: true })
    const deps = makeDeps({ sessions, repos })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleDeleteSession('s1', true))
    await vi.waitFor(() => {
      expect(useErrorStore.getState().errors.some(e => e.message.includes('crash'))).toBe(true)
    })
  })

  it('handleDeleteSession adds error when deleteBranch fails', async () => {
    const sessions = [{ id: 's1', directory: '/w/feat', repoId: 'r1', branch: 'feat' }] as Parameters<typeof useAppCallbacks>[0]['sessions']
    const repos = [{ id: 'r1', rootDir: '/w', defaultBranch: 'main' }]
    vi.mocked(window.git.worktreeRemove).mockResolvedValue({ success: true })
    vi.mocked(window.git.deleteBranch).mockResolvedValue({ success: false, error: 'not merged' })
    const deps = makeDeps({ sessions, repos })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleDeleteSession('s1', true))
    await vi.waitFor(() => {
      expect(useErrorStore.getState().errors.some(e => e.message.includes('not merged'))).toBe(true)
    })
  })

  it('handleDeleteSession adds error when deleteBranch throws', async () => {
    const sessions = [{ id: 's1', directory: '/w/feat', repoId: 'r1', branch: 'feat' }] as Parameters<typeof useAppCallbacks>[0]['sessions']
    const repos = [{ id: 'r1', rootDir: '/w', defaultBranch: 'main' }]
    vi.mocked(window.git.worktreeRemove).mockResolvedValue({ success: true })
    vi.mocked(window.git.deleteBranch).mockRejectedValue(new Error('branch error'))
    const deps = makeDeps({ sessions, repos })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleDeleteSession('s1', true))
    await vi.waitFor(() => {
      expect(useErrorStore.getState().errors.some(e => e.message.includes('branch error'))).toBe(true)
    })
  })

  it('handleDeleteSession skips worktree cleanup when session has no repoId', () => {
    const sessions = [{ id: 's1', directory: '/d1', branch: 'feat' }] as Parameters<typeof useAppCallbacks>[0]['sessions']
    const deps = makeDeps({ sessions })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleDeleteSession('s1', true))
    expect(deps.removeSession).toHaveBeenCalledWith('s1')
    expect(window.git.worktreeRemove).not.toHaveBeenCalled()
  })

  it('handleDeleteSession skips worktree cleanup when repo not found', () => {
    const sessions = [{ id: 's1', directory: '/d1', repoId: 'r-missing', branch: 'feat' }] as Parameters<typeof useAppCallbacks>[0]['sessions']
    const deps = makeDeps({ sessions, repos: [] })
    const { result } = renderHook(() => useAppCallbacks(deps))
    act(() => result.current.handleDeleteSession('s1', true))
    expect(deps.removeSession).toHaveBeenCalledWith('s1')
    expect(window.git.worktreeRemove).not.toHaveBeenCalled()
  })
})
