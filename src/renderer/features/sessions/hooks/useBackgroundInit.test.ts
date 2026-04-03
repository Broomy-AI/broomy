// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBackgroundInit } from './useBackgroundInit'

function makeDeps(overrides: Partial<Parameters<typeof useBackgroundInit>[0]> = {}) {
  return {
    addInitializingSession: vi.fn().mockReturnValue('init-session-1'),
    finalizeSession: vi.fn(),
    failSession: vi.fn(),
    setShowNewSessionDialog: vi.fn(),
    ...overrides,
  }
}

describe('useBackgroundInit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.git.pull).mockResolvedValue({ success: true })
    vi.mocked(window.git.worktreeAdd).mockResolvedValue({ success: true })
    vi.mocked(window.git.pushNewBranch).mockResolvedValue({ success: true })
    vi.mocked(window.git.worktreeRemove).mockResolvedValue({ success: true })
    vi.mocked(window.git.deleteBranch).mockResolvedValue({ success: true })
    vi.mocked(window.repos.getInitScript).mockResolvedValue('')
  })

  describe('handleStartBranchSession', () => {
    it('creates initializing session and closes dialog immediately', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main', name: 'proj' },
          branchName: 'feature/test',
          agentId: 'claude',
        })
      })

      expect(deps.addInitializingSession).toHaveBeenCalledWith({
        directory: '/repos/proj/feature/test',
        branch: 'feature/test',
        agentId: 'claude',
        extra: { repoId: 'r1', name: 'proj', issueNumber: undefined, issueTitle: undefined, issueUrl: undefined },
      })
      expect(deps.setShowNewSessionDialog).toHaveBeenCalledWith(false)
    })

    it('runs git operations and finalizes on success', async () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main' },
          branchName: 'feature/test',
          agentId: null,
        })
      })

      await vi.waitFor(() => {
        expect(deps.finalizeSession).toHaveBeenCalledWith('init-session-1')
      })

      expect(window.git.pull).toHaveBeenCalledWith('/repos/proj/main')
      expect(window.git.worktreeAdd).toHaveBeenCalledWith('/repos/proj/main', '/repos/proj/feature/test', 'feature/test', 'main')
      expect(window.git.pushNewBranch).toHaveBeenCalledWith('/repos/proj/feature/test', 'feature/test')
    })

    it('calls failSession when pull fails', async () => {
      vi.mocked(window.git.pull).mockRejectedValue(new Error('network error'))
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main' },
          branchName: 'feat',
          agentId: null,
        })
      })

      await vi.waitFor(() => {
        expect(deps.failSession).toHaveBeenCalledWith('init-session-1', 'network error')
      })
    })

    it('calls failSession when worktree creation fails', async () => {
      vi.mocked(window.git.worktreeAdd).mockResolvedValue({ success: false, error: 'invalid ref' })
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main' },
          branchName: 'feat',
          agentId: null,
        })
      })

      await vi.waitFor(() => {
        expect(deps.failSession).toHaveBeenCalledWith('init-session-1', 'invalid ref')
      })
    })

    it('tolerates "already exists" worktree error', async () => {
      vi.mocked(window.git.worktreeAdd).mockResolvedValue({ success: false, error: "'feat' already exists" })
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main' },
          branchName: 'feat',
          agentId: null,
        })
      })

      await vi.waitFor(() => {
        expect(deps.finalizeSession).toHaveBeenCalledWith('init-session-1')
      })
    })

    it('cleans up and fails when push fails', async () => {
      vi.mocked(window.git.pushNewBranch).mockResolvedValue({ success: false, error: 'Permission denied' })
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main' },
          branchName: 'feat',
          agentId: null,
        })
      })

      await vi.waitFor(() => {
        expect(window.git.worktreeRemove).toHaveBeenCalledWith('/repos/proj/main', '/repos/proj/feat')
        expect(window.git.deleteBranch).toHaveBeenCalledWith('/repos/proj/main', 'feat')
        expect(deps.failSession).toHaveBeenCalledWith('init-session-1', 'Permission denied')
      })
    })

    it('runs init script when present', async () => {
      vi.mocked(window.repos.getInitScript).mockResolvedValue('npm install')
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main' },
          branchName: 'feat',
          agentId: null,
        })
      })

      await vi.waitFor(() => {
        expect(window.shell.exec).toHaveBeenCalledWith('npm install', '/repos/proj/feat')
        expect(deps.finalizeSession).toHaveBeenCalled()
      })
    })

    it('passes issue info in extra', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main' },
          branchName: 'fix/bug',
          agentId: null,
          issue: { number: 42, title: 'Fix bug', url: 'https://github.com/org/repo/issues/42' },
        })
      })

      expect(deps.addInitializingSession).toHaveBeenCalledWith(expect.objectContaining({
        extra: expect.objectContaining({ issueNumber: 42, issueTitle: 'Fix bug', issueUrl: 'https://github.com/org/repo/issues/42' }),
      }))
    })
  })

  describe('handleStartExistingBranchSession', () => {
    it('creates initializing session and closes dialog', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartExistingBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main', name: 'proj' },
          branchName: 'existing-branch',
          agentId: 'claude',
        })
      })

      expect(deps.addInitializingSession).toHaveBeenCalledWith({
        directory: '/repos/proj/existing-branch',
        branch: 'existing-branch',
        agentId: 'claude',
        extra: { repoId: 'r1', name: 'proj' },
      })
      expect(deps.setShowNewSessionDialog).toHaveBeenCalledWith(false)
    })

    it('creates worktree with origin prefix and finalizes', async () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartExistingBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main' },
          branchName: 'existing',
          agentId: null,
        })
      })

      await vi.waitFor(() => {
        expect(window.git.worktreeAdd).toHaveBeenCalledWith(
          '/repos/proj/main', '/repos/proj/existing', 'existing', 'origin/existing'
        )
        expect(deps.finalizeSession).toHaveBeenCalledWith('init-session-1')
      })
    })

    it('calls failSession when worktree creation fails', async () => {
      vi.mocked(window.git.worktreeAdd).mockResolvedValue({ success: false, error: 'branch not found' })
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartExistingBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main' },
          branchName: 'missing',
          agentId: null,
        })
      })

      await vi.waitFor(() => {
        expect(deps.failSession).toHaveBeenCalledWith('init-session-1', 'branch not found')
      })
    })

    it('runs init script when present', async () => {
      vi.mocked(window.repos.getInitScript).mockResolvedValue('pnpm install')
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartExistingBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main' },
          branchName: 'existing',
          agentId: null,
        })
      })

      await vi.waitFor(() => {
        expect(window.shell.exec).toHaveBeenCalledWith('pnpm install', '/repos/proj/existing')
        expect(deps.finalizeSession).toHaveBeenCalled()
      })
    })
  })

  describe('abortInit', () => {
    it('prevents finalization after abort', async () => {
      // Make pull take long so we can abort before it completes
      let resolvePull: () => void
      vi.mocked(window.git.pull).mockReturnValue(new Promise<{ success: boolean }>(resolve => {
        resolvePull = () => resolve({ success: true })
      }))

      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main' },
          branchName: 'feat',
          agentId: null,
        })
      })

      // Abort before pull resolves
      act(() => {
        result.current.abortInit('init-session-1')
      })

      // Now resolve pull
      await act(async () => {
        resolvePull!()
        // Let microtasks flush
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Should not have called finalizeSession or failSession
      expect(deps.finalizeSession).not.toHaveBeenCalled()
      expect(deps.failSession).not.toHaveBeenCalled()
    })
  })
})
