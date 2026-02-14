// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import type { Session } from '../../store/sessions'

// Mock the hooks to control state
const mockReviewDataState = {
  reviewData: null as unknown,
  comments: [] as unknown[],
  comparison: null,
  waitingForAgent: false,
  pushing: false,
  pushResult: null as string | null,
  error: null as string | null,
  showGitignoreModal: false,
  unpushedCount: 0,
  mergeBase: 'abc123',
  broomyDir: '/test/.broomy',
  reviewFilePath: '/test/.broomy/review.json',
  commentsFilePath: '/test/.broomy/comments.json',
  historyFilePath: '/test/.broomy/review-history.json',
  promptFilePath: '/test/.broomy/review-prompt.md',
  pendingGenerate: false,
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
}

const mockActions = {
  handleGenerateReview: vi.fn(),
  handlePushComments: vi.fn(),
  handleDeleteComment: vi.fn(),
  handleOpenPrUrl: vi.fn(),
  handleClickLocation: vi.fn(),
  handleGitignoreAdd: vi.fn(),
  handleGitignoreContinue: vi.fn(),
  handleGitignoreCancel: vi.fn(),
}

vi.mock('./useReviewData', () => ({
  useReviewData: vi.fn().mockImplementation(() => mockReviewDataState),
}))

vi.mock('./useReviewActions', () => ({
  useReviewActions: vi.fn().mockImplementation(() => mockActions),
}))

import ReviewPanel from './index'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'test',
    directory: '/test',
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
    prTitle: 'Test PR',
    prNumber: 42,
    prUrl: 'https://github.com/pr/42',
    prBaseBranch: 'main',
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  // Reset state
  mockReviewDataState.reviewData = null
  mockReviewDataState.comments = []
  mockReviewDataState.waitingForAgent = false
  mockReviewDataState.error = null
  mockReviewDataState.pushResult = null
  mockReviewDataState.showGitignoreModal = false
  mockReviewDataState.unpushedCount = 0
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ReviewPanel', () => {
  it('renders header with PR title', () => {
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    expect(screen.getByText('Test PR')).toBeTruthy()
  })

  it('shows PR number link', () => {
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    expect(screen.getByText('#42')).toBeTruthy()
  })

  it('shows Generate Review button', () => {
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    expect(screen.getByText('Generate Review')).toBeTruthy()
  })

  it('calls handleGenerateReview when Generate Review is clicked', () => {
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    fireEvent.click(screen.getByText('Generate Review'))
    expect(mockActions.handleGenerateReview).toHaveBeenCalled()
  })

  it('shows Regenerate Review when reviewData exists', () => {
    mockReviewDataState.reviewData = {
      version: 1,
      generatedAt: '2024-01-01',
      overview: { purpose: 'test', approach: 'testing' },
      changePatterns: [],
      potentialIssues: [],
      designDecisions: [],
    }
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    expect(screen.getByText('Regenerate Review')).toBeTruthy()
  })

  it('shows waiting state when waitingForAgent is true', () => {
    mockReviewDataState.waitingForAgent = true
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    expect(screen.getByText('Waiting for agent...')).toBeTruthy()
  })

  it('shows prompt instructions when waiting and no review data', () => {
    mockReviewDataState.waitingForAgent = true
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    expect(screen.getByText(/Review instructions have been pasted/)).toBeTruthy()
  })

  it('shows error message when error is set', () => {
    mockReviewDataState.error = 'Something went wrong'
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    expect(screen.getByText('Something went wrong')).toBeTruthy()
  })

  it('shows push result message', () => {
    mockReviewDataState.pushResult = 'Pushed 3 comments'
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    expect(screen.getByText('Pushed 3 comments')).toBeTruthy()
  })

  it('shows initial guidance when no review data and not waiting', () => {
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    expect(screen.getByText(/Click "Generate Review"/)).toBeTruthy()
  })

  it('calls handleOpenPrUrl when PR number link is clicked', () => {
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    fireEvent.click(screen.getByText('#42'))
    expect(mockActions.handleOpenPrUrl).toHaveBeenCalled()
  })

  it('disables Generate Review when no agentPtyId', () => {
    const session = makeSession({ agentPtyId: undefined })
    render(<ReviewPanel session={session} onSelectFile={vi.fn()} />)
    const btn = screen.getByText('Generate Review')
    expect(btn.hasAttribute('disabled')).toBe(true)
  })
})
