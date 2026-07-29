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
    vi.mocked(window.git.defaultBranch).mockResolvedValue('main')
    vi.mocked(window.git.fetchBranch).mockResolvedValue({ success: true })
    vi.mocked(window.git.worktreeAdd).mockResolvedValue({ success: true })
    vi.mocked(window.git.worktreeAddNewBranch).mockResolvedValue({ success: true })
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
      expect(window.git.worktreeAddNewBranch).toHaveBeenCalledWith('/repos/proj/main', '/repos/proj/feature/test', 'feature/test', 'origin/main')
      expect(window.git.pushNewBranch).toHaveBeenCalledWith('/repos/proj/feature/test', 'feature/test')
    })

    it('bases the branch on origin/<default> for repos whose default is not "main"', async () => {
      vi.mocked(window.git.defaultBranch).mockResolvedValue('master')
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'master' },
          branchName: 'feat',
          agentId: null,
        })
      })

      await vi.waitFor(() => {
        expect(deps.finalizeSession).toHaveBeenCalledWith('init-session-1')
      })

      expect(window.git.fetchBranch).toHaveBeenCalledWith('/repos/proj/main', 'master')
      expect(window.git.worktreeAddNewBranch).toHaveBeenCalledWith('/repos/proj/main', '/repos/proj/feat', 'feat', 'origin/master')
    })

    it('fails the session rather than branching from stale code when the fetch fails', async () => {
      vi.mocked(window.git.fetchBranch).mockResolvedValue({ success: false, error: 'network down' })
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
        expect(deps.failSession).toHaveBeenCalledWith('init-session-1', expect.stringContaining('network down'))
      })
      expect(window.git.worktreeAdd).not.toHaveBeenCalled()
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
      vi.mocked(window.git.worktreeAddNewBranch).mockResolvedValue({ success: false, error: 'invalid ref' })
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

    it('surfaces a BRANCH_EXISTS creation collision cleanly, and never pushes or cleans up', async () => {
      vi.mocked(window.git.worktreeAddNewBranch).mockResolvedValue({
        success: false,
        error: 'BRANCH_EXISTS:A local branch "feat" already exists. Open that session instead, or pick a different name.',
      })
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
        expect(deps.failSession).toHaveBeenCalledWith(
          'init-session-1',
          'A local branch "feat" already exists. Open that session instead, or pick a different name.',
        )
      })
      // A creation collision must never push or remove a pre-existing branch/worktree.
      expect(window.git.pushNewBranch).not.toHaveBeenCalled()
      expect(window.git.worktreeRemove).not.toHaveBeenCalled()
      expect(window.git.deleteBranch).not.toHaveBeenCalled()
    })

    it('surfaces a WORKTREE_PATH_EXISTS collision with its own message', async () => {
      vi.mocked(window.git.worktreeAddNewBranch).mockResolvedValue({
        success: false,
        error: 'WORKTREE_PATH_EXISTS:A folder already exists at "/repos/proj/feat". Remove or rename it, then try again.',
      })
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
        expect(deps.failSession).toHaveBeenCalledWith(
          'init-session-1',
          'A folder already exists at "/repos/proj/feat". Remove or rename it, then try again.',
        )
      })
      expect(window.git.pushNewBranch).not.toHaveBeenCalled()
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
        expect(window.shell.exec).toHaveBeenCalledWith('npm install', '/repos/proj/feat', expect.objectContaining({ BROOMY_BRANCH: expect.any(String) }))
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

    it('nests the worktree under issue/ for an issue-derived branch name', async () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useBackgroundInit(deps))

      act(() => {
        result.current.handleStartBranchSession({
          repo: { id: 'r1', rootDir: '/repos/proj', defaultBranch: 'main' },
          branchName: 'issue/42-fix-login-bug',
          agentId: null,
          issue: { number: 42, title: 'Fix login bug', url: 'https://github.com/org/repo/issues/42' },
        })
      })

      await vi.waitFor(() => {
        expect(window.git.worktreeAddNewBranch).toHaveBeenCalledWith(
          '/repos/proj/main',
          '/repos/proj/issue/42-fix-login-bug',
          'issue/42-fix-login-bug',
          'origin/main',
        )
      })
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
        expect(window.shell.exec).toHaveBeenCalledWith('pnpm install', '/repos/proj/existing', expect.objectContaining({ BROOMY_BRANCH: expect.any(String) }))
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

    it('does not force-remove the worktree/branch on abort (session-delete honours the keep choice)', async () => {
      // Hold worktree creation open so we can abort while it is in flight.
      let resolveCreate: () => void
      vi.mocked(window.git.worktreeAddNewBranch).mockReturnValue(new Promise<{ success: boolean }>(resolve => {
        resolveCreate = () => resolve({ success: true })
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

      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
      act(() => { result.current.abortInit('init-session-1') })
      await act(async () => {
        resolveCreate!()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Abort must not force cleanup — that is the caller's session-delete's job (which respects the
      // "Delete worktree and folder" choice) — and it never pushes/finalizes/fails.
      expect(window.git.worktreeRemove).not.toHaveBeenCalled()
      expect(window.git.deleteBranch).not.toHaveBeenCalled()
      expect(window.git.pushNewBranch).not.toHaveBeenCalled()
      expect(deps.finalizeSession).not.toHaveBeenCalled()
      expect(deps.failSession).not.toHaveBeenCalled()
    })
  })
})
