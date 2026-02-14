// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import '../../../test/react-setup'
import { useSourceControlActions } from './useSourceControlActions'
import type { SourceControlData } from './useSourceControlData'

beforeEach(() => {
  vi.clearAllMocks()
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
    isSyncingWithMain: false,
    setIsSyncingWithMain: vi.fn(),
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
    isPushingToMain: false,
    setIsPushingToMain: vi.fn(),
    currentHeadCommit: null,
    prComments: [],
    setPrComments: vi.fn(),
    isCommentsLoading: false,
    replyText: {},
    setReplyText: vi.fn(),
    isSubmittingReply: null,
    setIsSubmittingReply: vi.fn(),
    hasChangesSincePush: true,
    resetPr: vi.fn(),
    currentRepo: undefined,
    gitStatus: [],
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

  describe('handleCommit', () => {
    it('commits when there are staged files', async () => {
      vi.mocked(window.git.commit).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData({
        stagedFiles: [{ path: 'src/index.ts', status: 'modified', staged: true }],
        commitMessage: 'fix: stuff',
      })

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handleCommit()
      })

      expect(window.git.commit).toHaveBeenCalledWith('/repos/project', 'fix: stuff')
      expect(data.setCommitMessage).toHaveBeenCalledWith('')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })

    it('does nothing with empty commit message', async () => {
      const data = makeData({ commitMessage: '' })
      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleCommit()
      })

      expect(window.git.commit).not.toHaveBeenCalled()
    })

    it('shows error on commit failure', async () => {
      vi.mocked(window.git.commit).mockResolvedValue({ success: false, error: 'hook failed' })
      const data = makeData({
        stagedFiles: [{ path: 'src/index.ts', status: 'modified', staged: true }],
        commitMessage: 'fix: stuff',
      })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleCommit()
      })

      expect(data.setCommitError).toHaveBeenCalledWith('hook failed')
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

  describe('handlePushNewBranch', () => {
    it('calls git.pushNewBranch', async () => {
      vi.mocked(window.git.pushNewBranch).mockResolvedValue({ success: true })
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
        await result.current.handlePushNewBranch('feature/test')
      })

      expect(window.git.pushNewBranch).toHaveBeenCalledWith('/repos/project', 'feature/test')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })
  })

  describe('handleCreatePr', () => {
    it('opens PR create URL', async () => {
      vi.mocked(window.gh.getPrCreateUrl).mockResolvedValue('https://github.com/test/test/compare')
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleCreatePr()
      })

      expect(window.gh.getPrCreateUrl).toHaveBeenCalledWith('/repos/project')
      expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/test/test/compare')
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

  describe('handleReplyToComment', () => {
    it('posts a reply and refreshes comments', async () => {
      vi.mocked(window.gh.replyToComment).mockResolvedValue({ success: true })
      vi.mocked(window.gh.prComments).mockResolvedValue([])
      const data = makeData({
        prStatus: { number: 42, title: 'Test', state: 'OPEN', url: 'https://example.com' },
        replyText: { 1: 'My reply' },
      })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleReplyToComment(1)
      })

      expect(window.gh.replyToComment).toHaveBeenCalledWith('/repos/project', 42, 1, 'My reply')
      expect(data.setReplyText).toHaveBeenCalled()
    })

    it('shows error when reply fails with error result', async () => {
      vi.mocked(window.gh.replyToComment).mockResolvedValue({ success: false, error: 'forbidden' })
      const data = makeData({
        prStatus: { number: 42, title: 'Test', state: 'OPEN', url: 'https://example.com' },
        replyText: { 1: 'My reply' },
      })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleReplyToComment(1)
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({ operation: 'Reply', message: 'forbidden' })
    })

    it('shows error when reply throws', async () => {
      vi.mocked(window.gh.replyToComment).mockRejectedValue(new Error('network error'))
      const data = makeData({
        prStatus: { number: 42, title: 'Test', state: 'OPEN', url: 'https://example.com' },
        replyText: { 1: 'My reply' },
      })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleReplyToComment(1)
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({ operation: 'Reply', message: 'Error: network error' })
    })

    it('does nothing without PR status', async () => {
      const data = makeData({ prStatus: null, replyText: { 1: 'My reply' } })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleReplyToComment(1)
      })

      expect(window.gh.replyToComment).not.toHaveBeenCalled()
    })
  })
})
