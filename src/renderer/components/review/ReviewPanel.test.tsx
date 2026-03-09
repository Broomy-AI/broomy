// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import type { Session } from '../../store/sessions'

// Mock the hooks to control state
const mockReviewDataState = {
  reviewMarkdown: null as string | null,
  fetching: false,
  waitingForAgent: false,
  fetchingStatus: null as string | null,
  error: null as string | null,
  mergeBase: 'abc123',
  broomyDir: '/test/.broomy',
  outputDir: '/test/.broomy/output',
  reviewFilePath: '/test/.broomy/output/review.md',
  promptFilePath: '/test/.broomy/output/review-prompt.md',
  setReviewMarkdown: vi.fn(),
  setFetching: vi.fn(),
  setWaitingForAgent: vi.fn(),
  setFetchingStatus: vi.fn(),
  setError: vi.fn(),
  setMergeBase: vi.fn(),
}

const mockActions = {
  handleOpenPrUrl: vi.fn(),
}

vi.mock('./useReviewData', () => ({
  useReviewData: vi.fn().mockImplementation(() => mockReviewDataState),
}))

vi.mock('./useReviewActions', () => ({
  useReviewActions: vi.fn().mockImplementation(() => mockActions),
}))

vi.mock('../../hooks/useCommandsConfig', () => ({
  useCommandsConfig: vi.fn().mockImplementation(() => ({
    config: null,
    loading: false,
    exists: false,
  })),
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
  mockReviewDataState.reviewMarkdown = null
  mockReviewDataState.waitingForAgent = false
  mockReviewDataState.error = null
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

  it('shows waiting state when waitingForAgent is true', () => {
    mockReviewDataState.waitingForAgent = true
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    expect(screen.getByText(/Review instructions have been sent/)).toBeTruthy()
  })

  it('shows error message when error is set', () => {
    mockReviewDataState.error = 'Something went wrong'
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    expect(screen.getByText('Something went wrong')).toBeTruthy()
  })

  it('calls handleOpenPrUrl when PR number link is clicked', () => {
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    fireEvent.click(screen.getByText('#42'))
    expect(mockActions.handleOpenPrUrl).toHaveBeenCalled()
  })

  it('renders markdown review content with collapsible sections', () => {
    mockReviewDataState.reviewMarkdown = '## Overview\nThis is the overview.\n\n## Issues\n- [ ] Security check\n- [x] Style check'
    render(<ReviewPanel session={makeSession()} onSelectFile={vi.fn()} />)
    expect(screen.getByText('Overview')).toBeTruthy()
    expect(screen.getByText('Issues')).toBeTruthy()
  })
})
