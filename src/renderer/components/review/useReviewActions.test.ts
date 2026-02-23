// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { useReviewActions } from './useReviewActions'
import type { Session } from '../../store/sessions'
import type { ReviewDataState } from './useReviewData'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'test',
    directory: '/test/repo',
    branch: 'feature/review',
    status: 'idle',
    agentId: 'agent-1',
    agentPtyId: 'pty-1',
    panelVisibility: {},
    showExplorer: true,
    showFileViewer: false,
    showDiff: false,
    selectedFilePath: null,
    planFilePath: null,
    fileViewerPosition: 'top',
    layoutSizes: {
      explorerWidth: 256,
      fileViewerSize: 300,
      userTerminalHeight: 192,
      diffPanelWidth: 320,
      tutorialPanelWidth: 320,
    },
    explorerFilter: 'files',
    lastMessage: null,
    lastMessageTime: null,
    isUnread: false,
    workingStartTime: null,
    recentFiles: [],
    terminalTabs: { tabs: [{ id: 'tab-1', name: 'Terminal' }], activeTabId: 'tab-1' },
    branchStatus: 'in-progress',
    isArchived: false,
    prNumber: 42,
    prUrl: 'https://github.com/pr/42',
    prBaseBranch: 'main',
    ...overrides,
  }
}

function makeState(overrides: Partial<ReviewDataState> = {}): ReviewDataState {
  return {
    reviewData: null,
    comments: [],
    comparison: null,
    fetching: false,
    waitingForAgent: false,
    fetchingStatus: null,
    pushing: false,
    pushResult: null,
    error: null,
    showGitignoreModal: false,
    pendingGenerate: false,
    mergeBase: 'abc123',
    unpushedCount: 0,
    broomyDir: '/test/repo/.broomy',
    reviewFilePath: '/test/repo/.broomy/review.json',
    commentsFilePath: '/test/repo/.broomy/comments.json',
    historyFilePath: '/test/repo/.broomy/review-history.json',
    promptFilePath: '/test/repo/.broomy/review-prompt.md',
    prDescription: null,
    prGitHubComments: [],
    prCommentsLoading: false,
    prCommentsHasMore: false,
    loadOlderComments: vi.fn(),
    setReviewData: vi.fn(),
    setComments: vi.fn(),
    setComparison: vi.fn(),
    setFetching: vi.fn(),
    setWaitingForAgent: vi.fn(),
    setFetchingStatus: vi.fn(),
    setPushing: vi.fn(),
    setPushResult: vi.fn(),
    setError: vi.fn(),
    setShowGitignoreModal: vi.fn(),
    setPendingGenerate: vi.fn(),
    setMergeBase: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useReviewActions', () => {
  it('handleOpenPrUrl opens the PR URL', () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)

    const session = makeSession()
    const onSelectFile = vi.fn()
    const state = makeState()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, onSelectFile, state)
    )

    act(() => {
      result.current.handleOpenPrUrl()
    })

    expect(openSpy).toHaveBeenCalledWith('https://github.com/pr/42', '_blank')
    vi.unstubAllGlobals()
  })

  it('handleClickLocation calls onSelectFile with full path', () => {
    const session = makeSession()
    const onSelectFile = vi.fn()
    const state = makeState()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, onSelectFile, state)
    )

    act(() => {
      result.current.handleClickLocation({ file: 'src/app.ts', startLine: 42 })
    })

    expect(onSelectFile).toHaveBeenCalledWith(
      '/test/repo/src/app.ts',
      true,
      42,
      'abc123'
    )
  })

  it('handleClickLocation uses absolute path if file starts with /', () => {
    const session = makeSession()
    const onSelectFile = vi.fn()
    const state = makeState()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, onSelectFile, state)
    )

    act(() => {
      result.current.handleClickLocation({ file: '/absolute/path.ts', startLine: 10 })
    })

    expect(onSelectFile).toHaveBeenCalledWith(
      '/absolute/path.ts',
      true,
      10,
      'abc123'
    )
  })

  it('handleGitignoreCancel closes modal and resets pending', () => {
    const state = makeState()
    const { result } = renderHook(() =>
      useReviewActions(makeSession(), undefined, vi.fn(), state)
    )

    act(() => {
      result.current.handleGitignoreCancel()
    })

    expect(state.setShowGitignoreModal).toHaveBeenCalledWith(false)
    expect(state.setPendingGenerate).toHaveBeenCalledWith(false)
  })

  it('handleDeleteComment removes comment and writes file', async () => {
    const state = makeState({
      comments: [
        { id: 'c-1', file: '/test/src/app.ts', line: 5, body: 'Comment 1', createdAt: '2024-01-01' },
        { id: 'c-2', file: '/test/src/app.ts', line: 10, body: 'Comment 2', createdAt: '2024-01-01' },
      ],
    })

    const { result } = renderHook(() =>
      useReviewActions(makeSession(), undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleDeleteComment('c-1')
    })

    expect(state.setComments).toHaveBeenCalledWith([
      { id: 'c-2', file: '/test/src/app.ts', line: 10, body: 'Comment 2', createdAt: '2024-01-01' },
    ])
    expect(window.fs.writeFile).toHaveBeenCalled()
  })

  it('handleGenerateReview sets error when no agentPtyId', async () => {
    const state = makeState()
    const session = makeSession({ agentPtyId: undefined })

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(state.setError).toHaveBeenCalledWith('No agent terminal found. Wait for the agent to start.')
  })

  it('handleGenerateReview shows gitignore modal when not in gitignore', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue('node_modules\n')

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(state.setPendingGenerate).toHaveBeenCalledWith(true)
    expect(state.setShowGitignoreModal).toHaveBeenCalledWith(true)
  })

  it('handlePushComments reports all pushed when no unpushed comments', async () => {
    const state = makeState({
      comments: [
        { id: 'c-1', file: '/test/src/app.ts', line: 5, body: 'Comment', createdAt: '2024-01-01', pushed: true },
      ],
    })

    const { result } = renderHook(() =>
      useReviewActions(makeSession(), undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handlePushComments()
    })

    expect(state.setPushResult).toHaveBeenCalledWith('All comments already pushed')
  })

  it('handlePushComments does nothing when no comments', async () => {
    const state = makeState({ comments: [] })

    const { result } = renderHook(() =>
      useReviewActions(makeSession({ prNumber: 42 }), undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handlePushComments()
    })

    expect(window.gh.submitDraftReview).not.toHaveBeenCalled()
  })

  it('handlePushComments does nothing when no prNumber', async () => {
    const state = makeState({
      comments: [
        { id: 'c-1', file: '/test/src/app.ts', line: 5, body: 'Comment', createdAt: '2024-01-01' },
      ],
    })

    const { result } = renderHook(() =>
      useReviewActions(makeSession({ prNumber: undefined }), undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handlePushComments()
    })

    expect(window.gh.submitDraftReview).not.toHaveBeenCalled()
  })

  it('handlePushComments submits draft review and marks pushed', async () => {
    vi.mocked(window.gh.submitDraftReview).mockResolvedValue({ success: true })
    const state = makeState({
      comments: [
        { id: 'c-1', file: '/test/repo/src/app.ts', line: 5, body: 'Comment 1', createdAt: '2024-01-01' },
        { id: 'c-2', file: '/test/repo/src/utils.ts', line: 10, body: 'Comment 2', createdAt: '2024-01-01', pushed: true },
      ],
    })

    const { result } = renderHook(() =>
      useReviewActions(makeSession(), undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handlePushComments()
    })

    expect(window.gh.submitDraftReview).toHaveBeenCalledWith(
      '/test/repo',
      42,
      [{ path: 'src/app.ts', line: 5, body: 'Comment 1' }]
    )
    expect(state.setComments).toHaveBeenCalled()
    expect(state.setPushResult).toHaveBeenCalledWith('Pushed 1 comment as draft review')
  })

  it('handlePushComments handles failed result', async () => {
    vi.mocked(window.gh.submitDraftReview).mockResolvedValue({ success: false, error: 'forbidden' })
    const state = makeState({
      comments: [
        { id: 'c-1', file: '/test/repo/src/app.ts', line: 5, body: 'Comment', createdAt: '2024-01-01' },
      ],
    })

    const { result } = renderHook(() =>
      useReviewActions(makeSession(), undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handlePushComments()
    })

    expect(state.setPushResult).toHaveBeenCalledWith('Failed: forbidden')
  })

  it('handlePushComments handles thrown error', async () => {
    vi.mocked(window.gh.submitDraftReview).mockRejectedValue(new Error('network error'))
    const state = makeState({
      comments: [
        { id: 'c-1', file: '/test/repo/src/app.ts', line: 5, body: 'Comment', createdAt: '2024-01-01' },
      ],
    })

    const { result } = renderHook(() =>
      useReviewActions(makeSession(), undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handlePushComments()
    })

    expect(state.setPushResult).toHaveBeenCalledWith('Error: network error')
  })

  it('handleGenerateReview proceeds when .broomy is in gitignore', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue('node_modules\n.broomy/\n')

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(state.setWaitingForAgent).toHaveBeenCalledWith(true)
    expect(window.pty.write).toHaveBeenCalled()
  })

  it('handleGenerateReview fetches base branch before generating', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('.gitignore')) return '.broomy/\n'
      return ''
    })

    const state = makeState()
    const session = makeSession({ prBaseBranch: 'develop' })

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(window.git.fetchBranch).toHaveBeenCalledWith('/test/repo', 'develop')
  })

  it('handleGenerateReview pulls PR branch when prNumber is set', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('.gitignore')) return '.broomy/\n'
      return ''
    })
    vi.mocked(window.git.getBranch).mockResolvedValue('feature/review')

    const state = makeState()
    const session = makeSession({ prNumber: 42 })

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(window.git.pullPrBranch).toHaveBeenCalledWith('/test/repo', 'feature/review', 42)
  })

  it('handleGenerateReview handles generation error', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('.gitignore')) return '.broomy/\n'
      return ''
    })
    vi.mocked(window.fs.mkdir).mockRejectedValue(new Error('mkdir failed'))

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(state.setError).toHaveBeenCalledWith('mkdir failed')
    expect(state.setWaitingForAgent).toHaveBeenCalledWith(false)
  })

  it('handleGitignoreAdd adds to gitignore and proceeds', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue('')

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGitignoreAdd()
    })

    expect(window.fs.appendFile).toHaveBeenCalled()
    expect(state.setWaitingForAgent).toHaveBeenCalledWith(true)
  })

  it('handleGitignoreContinue proceeds without adding to gitignore', async () => {
    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGitignoreContinue()
    })

    expect(state.setShowGitignoreModal).toHaveBeenCalledWith(false)
    expect(state.setWaitingForAgent).toHaveBeenCalledWith(true)
  })

  it('handleClickLocation uses fallback diffRef when mergeBase is empty', () => {
    const onSelectFile = vi.fn()
    const state = makeState({ mergeBase: '' })
    const session = makeSession({ prBaseBranch: 'develop' })

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, onSelectFile, state)
    )

    act(() => {
      result.current.handleClickLocation({ file: 'src/app.ts', startLine: 10 })
    })

    expect(onSelectFile).toHaveBeenCalledWith(
      '/test/repo/src/app.ts',
      true,
      10,
      'origin/develop'
    )
  })

  it('handleOpenPrUrl does nothing when no prUrl', () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)

    const session = makeSession({ prUrl: undefined })
    const state = makeState()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    act(() => {
      result.current.handleOpenPrUrl()
    })

    expect(openSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('handleGenerateReview loads previous review history for re-review', async () => {
    const history = {
      reviews: [
        { generatedAt: '2024-01-01', headCommit: 'prev-commit', requestedChanges: [{ id: 'rc-1' }] },
      ],
    }

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('.gitignore')) return true
      if (path.includes('review-history.json')) return true
      return true  // mkdir needs to succeed
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('.gitignore')) return '.broomy/\n'
      if (path.includes('review-history.json')) return JSON.stringify(history)
      return ''
    })
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })
    vi.mocked(window.gh.prComments).mockResolvedValue([
      { id: 1, body: 'fix this', path: 'src/app.ts', line: 5, author: 'reviewer', side: 'RIGHT' as const, createdAt: '2024-01-01', url: 'https://github.com/pr/42/comments/1' },
    ])
    vi.mocked(window.git.getBranch).mockResolvedValue('feature/review')

    const state = makeState()
    const session = makeSession({ prNumber: 42 })

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGenerateReview()
    })

    expect(window.gh.prComments).toHaveBeenCalledWith('/test/repo', 42)
    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/test/repo/.broomy/review-prompt.md',
      expect.any(String)
    )
  })

  it('addToGitignore creates new .gitignore when none exists', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('.gitignore')) return false
      return false
    })

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleGitignoreAdd()
    })

    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/test/repo/.gitignore',
      '# Broomy review data\n.broomy/\n'
    )
  })

  it('handlePushComments plural message for multiple comments', async () => {
    vi.mocked(window.gh.submitDraftReview).mockResolvedValue({ success: true })
    const state = makeState({
      comments: [
        { id: 'c-1', file: '/test/repo/src/app.ts', line: 5, body: 'Comment 1', createdAt: '2024-01-01' },
        { id: 'c-2', file: '/test/repo/src/utils.ts', line: 10, body: 'Comment 2', createdAt: '2024-01-01' },
      ],
    })

    const { result } = renderHook(() =>
      useReviewActions(makeSession(), undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handlePushComments()
    })

    expect(state.setPushResult).toHaveBeenCalledWith('Pushed 2 comments as draft review')
  })
})
