// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import '../../../../../test/react-setup'
import { useSourceControlActions } from './useSourceControlActions'
import type { SourceControlData } from './useSourceControlData'
import { useSessionStore } from '../../../../store/sessions'

vi.mock('../../../../features/git/gitOperationProgress', () => ({
  withGitProgress: vi.fn((_sessionId: string | null, fn: () => Promise<unknown>) => fn()),
}))

beforeEach(() => {
  vi.clearAllMocks()
  useSessionStore.setState({ activeSessionId: 'test-session-1' })
})

function makeData(overrides: Partial<SourceControlData> = {}): SourceControlData {
  return {
    stagedFiles: [],
    unstagedFiles: [],
    commitMessage: '',
    setCommitMessage: vi.fn(),
    isCommitting: false,
    setIsCommitting: vi.fn(),
    commitError: null,
    setCommitError: vi.fn(),
    commitErrorExpanded: false,
    setCommitErrorExpanded: vi.fn(),
    isSyncing: false,
    setIsSyncing: vi.fn(),
    gitOpError: null,
    setGitOpError: vi.fn(),
    branchChanges: [],
    branchBaseName: 'main',
    branchMergeBase: '',
    isBranchLoading: false,
    branchCommits: [],
    isCommitsLoading: false,
    expandedCommits: new Set<string>(),
    setExpandedCommits: vi.fn(),
    commitFilesByHash: {},
    setCommitFilesByHash: vi.fn(),
    loadingCommitFiles: new Set<string>(),
    setLoadingCommitFiles: vi.fn(),
    prStatus: null,
    isPrLoading: false,
    hasWriteAccess: false,
    checksStatus: 'none' as const,
    hasPrLoadedOnce: true,
    resetPr: vi.fn(),
    refreshPr: vi.fn(),
    currentRepo: undefined,
    gitStatus: [],
    isInitialLoading: false,
    behindMainCount: 0,
    isFetchingBehindMain: false,
    agentMergeMessage: null,
    setAgentMergeMessage: vi.fn(),
    askedAgentToResolve: false,
    setAskedAgentToResolve: vi.fn(),
    ...overrides,
  }
}

describe('useSourceControlActions', () => {
  describe('handleStage', () => {
    it('calls git.stage with the file path', async () => {
      vi.mocked(window.git.stage).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handleStage('src/index.ts')
      })

      expect(window.git.stage).toHaveBeenCalledWith('/repos/project', 'src/index.ts')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })

    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handleStage('src/index.ts')
      })

      expect(window.git.stage).not.toHaveBeenCalled()
    })
  })

  describe('handleStageAll', () => {
    it('calls git.stageAll', async () => {
      vi.mocked(window.git.stageAll).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handleStageAll()
      })

      expect(window.git.stageAll).toHaveBeenCalledWith('/repos/project')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })
  })

  describe('handleUnstage', () => {
    it('calls git.unstage with the file path', async () => {
      vi.mocked(window.git.unstage).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handleUnstage('src/index.ts')
      })

      expect(window.git.unstage).toHaveBeenCalledWith('/repos/project', 'src/index.ts')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })
  })

  describe('handleSync', () => {
    it('calls pull then push', async () => {
      vi.mocked(window.git.pull).mockResolvedValue({ success: true })
      vi.mocked(window.git.push).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handleSync()
      })

      expect(window.git.pull).toHaveBeenCalledWith('/repos/project')
      expect(window.git.push).toHaveBeenCalledWith('/repos/project')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })

    it('shows error when pull fails', async () => {
      vi.mocked(window.git.pull).mockResolvedValue({ success: false, error: 'pull error' })
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleSync()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({ operation: 'Pull', message: 'pull error' })
      expect(window.git.push).not.toHaveBeenCalled()
    })

    it('shows error when push fails', async () => {
      vi.mocked(window.git.pull).mockResolvedValue({ success: true })
      vi.mocked(window.git.push).mockResolvedValue({ success: false, error: 'push error' })
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleSync()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({ operation: 'Push', message: 'push error' })
    })
  })

  describe('handleToggleCommit', () => {
    it('expands a commit and loads files', async () => {
      vi.mocked(window.git.commitFiles).mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ])
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleToggleCommit('abc123')
      })

      expect(window.git.commitFiles).toHaveBeenCalledWith('/repos/project', 'abc123')
      expect(data.setExpandedCommits).toHaveBeenCalled()
    })

    it('collapses an already expanded commit', async () => {
      const data = makeData({ expandedCommits: new Set(['abc123']) })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleToggleCommit('abc123')
      })

      expect(window.git.commitFiles).not.toHaveBeenCalled()
      // Should still call setExpandedCommits to remove it
      expect(data.setExpandedCommits).toHaveBeenCalled()
    })
  })

  describe('handleToggleCommit - loading cleanup', () => {
    it('clears loadingCommitFiles after loading', async () => {
      vi.mocked(window.git.commitFiles).mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ])
      const setLoadingCommitFiles = vi.fn()
      const data = makeData({ setLoadingCommitFiles })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleToggleCommit('abc123')
      })

      // Should have been called twice: once to add, once to remove
      expect(setLoadingCommitFiles).toHaveBeenCalledTimes(2)
      // Second call should remove the hash
      const removeFn = setLoadingCommitFiles.mock.calls[1][0]
      const result2 = removeFn(new Set(['abc123']))
      expect(result2.has('abc123')).toBe(false)
    })

    it('handles commit files loading error', async () => {
      vi.mocked(window.git.commitFiles).mockRejectedValue(new Error('failed'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleToggleCommit('abc123')
      })

      // Should set empty array on error
      expect(data.setCommitFilesByHash).toHaveBeenCalled()
      // Should still clear loading state
      expect(data.setLoadingCommitFiles).toHaveBeenCalledTimes(2)
    })
  })

  describe('handleCommitMerge', () => {
    it('stages all files then commits merge successfully', async () => {
      vi.mocked(window.git.commitMerge).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handleCommitMerge()
      })

      expect(window.git.stageAll).toHaveBeenCalledWith('/repos/project')
      expect(window.git.commitMerge).toHaveBeenCalledWith('/repos/project')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })

    it('shows error on merge commit failure', async () => {
      vi.mocked(window.git.commitMerge).mockResolvedValue({ success: false, error: 'merge failed' })
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleCommitMerge()
      })

      expect(window.git.stageAll).toHaveBeenCalledWith('/repos/project')
      expect(data.setCommitError).toHaveBeenCalledWith('merge failed')
      expect(data.setGitOpError).toHaveBeenCalledWith({ operation: 'Merge commit', message: 'merge failed' })
    })

    it('handles merge commit exception', async () => {
      vi.mocked(window.git.commitMerge).mockRejectedValue(new Error('network'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleCommitMerge()
      })

      expect(data.setCommitError).toHaveBeenCalledWith('Error: network')
    })

    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handleCommitMerge()
      })

      expect(window.git.stageAll).not.toHaveBeenCalled()
      expect(window.git.commitMerge).not.toHaveBeenCalled()
    })

    it('clears agent merge message on commit', async () => {
      vi.mocked(window.git.commitMerge).mockResolvedValue({ success: true })
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleCommitMerge()
      })

      expect(data.setAgentMergeMessage).toHaveBeenCalledWith(null)
    })
  })

  describe('handleSync - edge cases', () => {
    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handleSync()
      })

      expect(window.git.pull).not.toHaveBeenCalled()
    })

    it('handles sync exception', async () => {
      vi.mocked(window.git.pull).mockRejectedValue(new Error('network'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleSync()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Sync',
        message: 'Error: network',
      })
    })
  })

  describe('handleStage - error handling', () => {
    it('handles stage error', async () => {
      vi.mocked(window.git.stage).mockRejectedValue(new Error('stage error'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleStage('src/index.ts')
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Stage',
        message: 'Error: stage error',
      })
    })
  })

  describe('handleStageAll - edge cases', () => {
    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handleStageAll()
      })

      expect(window.git.stageAll).not.toHaveBeenCalled()
    })

    it('handles stageAll error', async () => {
      vi.mocked(window.git.stageAll).mockRejectedValue(new Error('stage error'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleStageAll()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Stage',
        message: 'Error: stage error',
      })
    })
  })

  describe('handleUnstage - edge cases', () => {
    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handleUnstage('src/index.ts')
      })

      expect(window.git.unstage).not.toHaveBeenCalled()
    })

    it('handles unstage error', async () => {
      vi.mocked(window.git.unstage).mockRejectedValue(new Error('unstage error'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleUnstage('src/index.ts')
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Unstage',
        message: 'Error: unstage error',
      })
    })
  })

  describe('withGitProgress integration', () => {
    it('wraps handleSync with progress tracking', async () => {
      const { withGitProgress } = await import('../../../../features/git/gitOperationProgress')
      vi.mocked(window.git.pull).mockResolvedValue({ success: true })
      vi.mocked(window.git.push).mockResolvedValue({ success: true })
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleSync()
      })

      expect(withGitProgress).toHaveBeenCalledWith('test-session-1', expect.any(Function))
    })

    it('wraps handleCommitMerge with progress tracking', async () => {
      const { withGitProgress } = await import('../../../../features/git/gitOperationProgress')
      vi.mocked(window.git.commitMerge).mockResolvedValue({ success: true })
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', onGitStatusRefresh: vi.fn(), data })
      )

      await act(async () => {
        await result.current.handleCommitMerge()
      })

      expect(withGitProgress).toHaveBeenCalledWith('test-session-1', expect.any(Function))
    })

  })
})
