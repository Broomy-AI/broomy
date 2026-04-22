// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../../../test/react-setup'

// Mock child components
vi.mock('./SCViewToggle', () => ({
  SCViewToggle: ({ scView, setScView }: { scView: string; setScView: (v: string) => void }) => (
    <div data-testid="view-toggle">
      {scView}
      <button data-testid="set-commits" onClick={() => setScView('commits')}>Commits</button>
      <button data-testid="set-branch" onClick={() => setScView('branch')}>Branch</button>
      <button data-testid="set-working" onClick={() => setScView('working')}>Working</button>
    </div>
  ),
}))
vi.mock('./SCPrBanner', () => ({
  SCPrBanner: () => <div data-testid="pr-banner">PRBanner</div>,
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
  setIsSyncing: vi.fn(),
  setGitOpError: vi.fn(),
  setIsCommitting: vi.fn(),
  setExpandedCommits: vi.fn(),
  setCommitFilesByHash: vi.fn(),
  setLoadingCommitFiles: vi.fn(),
  gitOpError: null,
  hasWriteAccess: false,
  currentRepo: undefined,
  resetPr: vi.fn(),
  checksStatus: 'none' as const,
  gitStatus: [],
}

const mockActions = {
  handleSync: vi.fn(),
  handleCreatePr: vi.fn(),
  handlePushNewBranch: vi.fn(),
  handleRevertFile: vi.fn(),
  handleStage: vi.fn(),
  handleStageAll: vi.fn(),
  handleUnstage: vi.fn(),
  handleCommitWithAI: vi.fn(),
  handleToggleCommit: vi.fn(),
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
    expect(screen.getByTestId('view-toggle').textContent).toContain('working')
  })

  it('shows commits view when toggled', () => {
    render(
      <SourceControl directory="/repos/project" gitStatus={[]} />
    )
    fireEvent.click(screen.getByTestId('set-commits'))
    expect(screen.getByTestId('commits-view')).toBeTruthy()
  })

  it('shows branch view when toggled', () => {
    render(
      <SourceControl directory="/repos/project" gitStatus={[]} />
    )
    fireEvent.click(screen.getByTestId('set-branch'))
    expect(screen.getByTestId('branch-view')).toBeTruthy()
  })
})
