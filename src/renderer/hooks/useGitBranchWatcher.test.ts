// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGitBranchWatcher } from './useGitBranchWatcher'
import type { Session } from '../store/sessions'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    name: 'Test',
    agentId: 'agent-1',
    directory: '/test/repo',
    branch: 'main',
    isArchived: false,
    panelVisibility: {},
    layoutSizes: { explorerWidth: 250, fileViewerSize: 300, userTerminalHeight: 200, diffPanelWidth: 400, tutorialPanelWidth: 300 },
    ...overrides,
  } as Session
}

describe('useGitBranchWatcher', () => {
  let onChangeCallback: ((event: { eventType: string; filename: string | null }) => void) | null = null
  const mockRemoveListener = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    onChangeCallback = null

    vi.mocked(window.fs.onChange).mockImplementation((_id, cb) => {
      onChangeCallback = cb
      return mockRemoveListener
    })
    vi.mocked(window.fs.watch).mockResolvedValue({ success: true })
    vi.mocked(window.fs.unwatch).mockResolvedValue({ success: true })
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockRejectedValue(new Error('is a directory'))
    vi.mocked(window.git.getBranch).mockResolvedValue('main')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing when no active session', () => {
    renderHook(() =>
      useGitBranchWatcher({
        sessions: [],
        activeSessionId: null,
        updateSessionBranch: vi.fn(),
      }),
    )

    expect(window.fs.onChange).not.toHaveBeenCalled()
    expect(window.git.getBranch).not.toHaveBeenCalled()
  })

  it('does nothing when active session is archived', () => {
    const session = makeSession({ isArchived: true })
    renderHook(() =>
      useGitBranchWatcher({
        sessions: [session],
        activeSessionId: 'sess-1',
        updateSessionBranch: vi.fn(),
      }),
    )

    expect(window.git.getBranch).not.toHaveBeenCalled()
  })

  it('does an initial branch check on mount', async () => {
    vi.mocked(window.git.getBranch).mockResolvedValue('feature-branch')
    const updateSessionBranch = vi.fn()
    const session = makeSession()

    renderHook(() =>
      useGitBranchWatcher({
        sessions: [session],
        activeSessionId: 'sess-1',
        updateSessionBranch,
      }),
    )

    await vi.advanceTimersByTimeAsync(0)

    expect(window.git.getBranch).toHaveBeenCalledWith('/test/repo')
    expect(updateSessionBranch).toHaveBeenCalledWith('sess-1', 'feature-branch')
  })

  it('does not update branch if it has not changed', async () => {
    vi.mocked(window.git.getBranch).mockResolvedValue('main')
    const updateSessionBranch = vi.fn()
    const session = makeSession({ branch: 'main' })

    renderHook(() =>
      useGitBranchWatcher({
        sessions: [session],
        activeSessionId: 'sess-1',
        updateSessionBranch,
      }),
    )

    await vi.advanceTimersByTimeAsync(0)

    expect(updateSessionBranch).not.toHaveBeenCalled()
  })

  it('sets up a watcher on the HEAD file', async () => {
    const session = makeSession()

    renderHook(() =>
      useGitBranchWatcher({
        sessions: [session],
        activeSessionId: 'sess-1',
        updateSessionBranch: vi.fn(),
      }),
    )

    await vi.advanceTimersByTimeAsync(0)

    expect(window.fs.watch).toHaveBeenCalledWith('git-head-sess-1', '/test/repo/.git/HEAD')
    expect(window.fs.onChange).toHaveBeenCalledWith('git-head-sess-1', expect.any(Function))
  })

  it('responds to HEAD file changes', async () => {
    vi.mocked(window.git.getBranch).mockResolvedValue('main')
    const updateSessionBranch = vi.fn()
    const session = makeSession({ branch: 'main' })

    renderHook(() =>
      useGitBranchWatcher({
        sessions: [session],
        activeSessionId: 'sess-1',
        updateSessionBranch,
      }),
    )

    await vi.advanceTimersByTimeAsync(0)

    // Simulate HEAD change
    vi.mocked(window.git.getBranch).mockResolvedValue('develop')
    onChangeCallback?.({ eventType: 'change', filename: 'HEAD' })

    await vi.advanceTimersByTimeAsync(300)

    expect(updateSessionBranch).toHaveBeenCalledWith('sess-1', 'develop')
  })

  it('debounces rapid HEAD changes', async () => {
    vi.mocked(window.git.getBranch).mockResolvedValue('main')
    const updateSessionBranch = vi.fn()
    const session = makeSession({ branch: 'main' })

    renderHook(() =>
      useGitBranchWatcher({
        sessions: [session],
        activeSessionId: 'sess-1',
        updateSessionBranch,
      }),
    )

    await vi.advanceTimersByTimeAsync(0)

    vi.mocked(window.git.getBranch).mockResolvedValue('final-branch')

    // Rapid fire changes
    onChangeCallback?.({ eventType: 'change', filename: null })
    await vi.advanceTimersByTimeAsync(100)
    onChangeCallback?.({ eventType: 'change', filename: null })
    await vi.advanceTimersByTimeAsync(100)
    onChangeCallback?.({ eventType: 'change', filename: null })

    // Only after 300ms from last change
    await vi.advanceTimersByTimeAsync(300)

    expect(window.git.getBranch).toHaveBeenCalledTimes(2) // initial + one debounced
  })

  it('cleans up watcher on unmount', async () => {
    const session = makeSession()

    const { unmount } = renderHook(() =>
      useGitBranchWatcher({
        sessions: [session],
        activeSessionId: 'sess-1',
        updateSessionBranch: vi.fn(),
      }),
    )

    await vi.advanceTimersByTimeAsync(0)

    unmount()

    expect(mockRemoveListener).toHaveBeenCalled()
    expect(window.fs.unwatch).toHaveBeenCalledWith('git-head-sess-1')
  })

  it('handles worktree .git file', async () => {
    vi.mocked(window.fs.readFile).mockResolvedValue('gitdir: /real/git/dir/worktrees/my-worktree')
    vi.mocked(window.fs.exists).mockImplementation(async (path) => {
      if (path === '/real/git/dir/worktrees/my-worktree/HEAD') return true
      return true
    })

    const session = makeSession()

    renderHook(() =>
      useGitBranchWatcher({
        sessions: [session],
        activeSessionId: 'sess-1',
        updateSessionBranch: vi.fn(),
      }),
    )

    await vi.advanceTimersByTimeAsync(0)

    expect(window.fs.watch).toHaveBeenCalledWith('git-head-sess-1', '/real/git/dir/worktrees/my-worktree/HEAD')
  })

  it('skips when .git does not exist', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    const session = makeSession()

    renderHook(() =>
      useGitBranchWatcher({
        sessions: [session],
        activeSessionId: 'sess-1',
        updateSessionBranch: vi.fn(),
      }),
    )

    await vi.advanceTimersByTimeAsync(0)

    expect(window.fs.watch).not.toHaveBeenCalled()
  })

  it('handles worktree gitdir that does not exist', async () => {
    vi.mocked(window.fs.readFile).mockResolvedValue('gitdir: /nonexistent/path')
    vi.mocked(window.fs.exists).mockImplementation(async (path) => {
      if (path === '/nonexistent/path/HEAD') return false
      return true // .git file exists
    })

    const session = makeSession()

    renderHook(() =>
      useGitBranchWatcher({
        sessions: [session],
        activeSessionId: 'sess-1',
        updateSessionBranch: vi.fn(),
      }),
    )

    await vi.advanceTimersByTimeAsync(0)

    expect(window.fs.watch).not.toHaveBeenCalled()
  })

  it('handles getBranch errors gracefully during initial check', async () => {
    vi.mocked(window.git.getBranch).mockRejectedValue(new Error('dir deleted'))
    const updateSessionBranch = vi.fn()
    const session = makeSession()

    renderHook(() =>
      useGitBranchWatcher({
        sessions: [session],
        activeSessionId: 'sess-1',
        updateSessionBranch,
      }),
    )

    await vi.advanceTimersByTimeAsync(0)

    expect(updateSessionBranch).not.toHaveBeenCalled()
  })

  it('handles watch failure by cleaning up listener', async () => {
    vi.mocked(window.fs.watch).mockResolvedValue({ success: false })
    const session = makeSession()

    renderHook(() =>
      useGitBranchWatcher({
        sessions: [session],
        activeSessionId: 'sess-1',
        updateSessionBranch: vi.fn(),
      }),
    )

    await vi.advanceTimersByTimeAsync(0)

    expect(mockRemoveListener).toHaveBeenCalled()
  })

  it('handles getBranch errors during watcher callback', async () => {
    vi.mocked(window.git.getBranch).mockResolvedValue('main')
    const updateSessionBranch = vi.fn()
    const session = makeSession({ branch: 'main' })

    renderHook(() =>
      useGitBranchWatcher({
        sessions: [session],
        activeSessionId: 'sess-1',
        updateSessionBranch,
      }),
    )

    await vi.advanceTimersByTimeAsync(0)

    vi.mocked(window.git.getBranch).mockRejectedValue(new Error('repo gone'))
    onChangeCallback?.({ eventType: 'change', filename: null })

    await vi.advanceTimersByTimeAsync(300)

    expect(updateSessionBranch).not.toHaveBeenCalled()
  })
})
