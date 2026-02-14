// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '../../../test/react-setup'

// Mock child components
vi.mock('./SCViewToggle', () => ({
  SCViewToggle: ({ scView }: { scView: string }) => <div data-testid="view-toggle">{scView}</div>,
}))
vi.mock('./SCPrBanner', () => ({
  SCPrBanner: () => <div data-testid="pr-banner">PRBanner</div>,
}))
vi.mock('./SCCommentsView', () => ({
  SCCommentsView: () => <div data-testid="comments-view">CommentsView</div>,
}))
vi.mock('./SCCommitsView', () => ({
  SCCommitsView: () => <div data-testid="commits-view">CommitsView</div>,
}))
vi.mock('./SCBranchView', () => ({
  SCBranchView: () => <div data-testid="branch-view">BranchView</div>,
}))
vi.mock('./SCWorkingView', () => ({
  SCWorkingView: () => <div data-testid="working-view">WorkingView</div>,
}))

// Mock the data and actions hooks
const mockData = {
  prStatus: null,
  isPrLoading: false,
  branchBaseName: 'main',
  branchChanges: [],
  isBranchLoading: false,
  branchMergeBase: '',
  branchCommits: [],
  isCommitsLoading: false,
  expandedCommits: new Set<string>(),
  commitFilesByHash: {},
  loadingCommitFiles: new Set<string>(),
  prComments: [],
  isCommentsLoading: false,
  replyText: {},
  setReplyText: vi.fn(),
  isSubmittingReply: null,
  stagedFiles: [],
  unstagedFiles: [],
  commitMessage: '',
  setCommitMessage: vi.fn(),
  isCommitting: false,
  commitError: null,
  commitErrorExpanded: false,
  setCommitErrorExpanded: vi.fn(),
  setCommitError: vi.fn(),
  isSyncing: false,
  isSyncingWithMain: false,
  setIsSyncing: vi.fn(),
  setIsSyncingWithMain: vi.fn(),
  setGitOpError: vi.fn(),
  setIsPushingToMain: vi.fn(),
  setIsCommitting: vi.fn(),
  setExpandedCommits: vi.fn(),
  setCommitFilesByHash: vi.fn(),
  setLoadingCommitFiles: vi.fn(),
  setPrComments: vi.fn(),
  setIsSubmittingReply: vi.fn(),
  gitOpError: null,
  hasWriteAccess: false,
  isPushingToMain: false,
  currentRepo: undefined,
  hasChangesSincePush: true,
  resetPr: vi.fn(),
  currentHeadCommit: null,
  gitStatus: [],
}

const mockActions = {
  handleSync: vi.fn(),
  handleSyncWithMain: vi.fn(),
  handlePushToMain: vi.fn(),
  handleCreatePr: vi.fn(),
  handlePushNewBranch: vi.fn(),
  handleRevertFile: vi.fn(),
  handleStage: vi.fn(),
  handleStageAll: vi.fn(),
  handleUnstage: vi.fn(),
  handleCommit: vi.fn(),
  handleToggleCommit: vi.fn(),
  handleReplyToComment: vi.fn(),
}

vi.mock('./useSourceControlData', () => ({
  useSourceControlData: () => mockData,
}))

vi.mock('./useSourceControlActions', () => ({
  useSourceControlActions: () => mockActions,
}))

import { SourceControl } from './SourceControl'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SourceControl', () => {
  it('returns null when no directory', () => {
    const { container } = render(
      <SourceControl gitStatus={[]} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders view toggle and PR banner', () => {
    render(
      <SourceControl directory="/repos/project" gitStatus={[]} />
    )
    expect(screen.getByTestId('view-toggle')).toBeTruthy()
    expect(screen.getByTestId('pr-banner')).toBeTruthy()
  })

  it('shows working view by default', () => {
    render(
      <SourceControl directory="/repos/project" gitStatus={[]} />
    )
    expect(screen.getByTestId('working-view')).toBeTruthy()
  })

  it('shows the default working scView in the toggle', () => {
    render(
      <SourceControl directory="/repos/project" gitStatus={[]} />
    )
    expect(screen.getByTestId('view-toggle').textContent).toBe('working')
  })
})
