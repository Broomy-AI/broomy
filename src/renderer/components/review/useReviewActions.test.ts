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
    isRestored: false,
    prNumber: 42,
    prUrl: 'https://github.com/pr/42',
    prBaseBranch: 'main',
    ...overrides,
  }
}

function makeState(overrides: Partial<ReviewDataState> = {}): ReviewDataState {
  return {
    reviewMarkdown: null,
    fetching: false,
    waitingForAgent: false,
    fetchingStatus: null,
    error: null,
    mergeBase: 'abc123',
    broomyDir: '/test/repo/.broomy',
    outputDir: '/test/repo/.broomy/output',
    reviewFilePath: '/test/repo/.broomy/output/review.md',
    promptFilePath: '/test/repo/.broomy/output/review-prompt.md',
    setReviewMarkdown: vi.fn(),
    setFetching: vi.fn(),
    setWaitingForAgent: vi.fn(),
    setFetchingStatus: vi.fn(),
    setError: vi.fn(),
    setMergeBase: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useReviewActions', () => {
  it('handleOpenPrUrl opens the PR URL', () => {
    const session = makeSession()
    const onSelectFile = vi.fn()
    const state = makeState()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, onSelectFile, state)
    )

    act(() => {
      result.current.handleOpenPrUrl()
    })

    expect(onSelectFile).toHaveBeenCalledWith('https://github.com/pr/42', false)
  })

  it('handleOpenPrUrl does nothing when no prUrl', () => {
    const onSelectFile = vi.fn()
    const session = makeSession({ prUrl: undefined })
    const state = makeState()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, onSelectFile, state)
    )

    act(() => {
      result.current.handleOpenPrUrl()
    })

    expect(onSelectFile).not.toHaveBeenCalled()
  })
})
