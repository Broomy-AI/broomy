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
    showAgentTerminal: true,
    showUserTerminal: true,
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
      reviewPanelWidth: 320,
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
    waitingForAgent: false,
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
    setReviewData: vi.fn(),
    setComments: vi.fn(),
    setComparison: vi.fn(),
    setWaitingForAgent: vi.fn(),
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
})
