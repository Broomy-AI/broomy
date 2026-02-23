// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { SCWorkingView } from './SCWorkingView'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

const defaultProps = {
  directory: '/repos/project',
  gitStatus: [],
  syncStatus: { current: 'feature/test', tracking: 'origin/feature/test', ahead: 0, behind: 0, files: [] },
  branchStatus: 'in-progress' as const,
  branchBaseName: 'main',
  stagedFiles: [],
  unstagedFiles: [],
  commitMessage: '',
  setCommitMessage: vi.fn(),
  isCommitting: false,
  isMerging: false,
  hasConflicts: false,
  commitError: null as string | null,
  commitErrorExpanded: false,
  setCommitErrorExpanded: vi.fn(),
  setCommitError: vi.fn(),
  isSyncing: false,
  onCommit: vi.fn(),
  onCommitMerge: vi.fn(),
  onResolveConflicts: vi.fn(),
  askedAgentToResolve: false,
  onSync: vi.fn(),
  onSyncWithMain: vi.fn(),
  onPushNewBranch: vi.fn(),
  onStage: vi.fn(),
  onStageAll: vi.fn(),
  onUnstage: vi.fn(),
  onFileSelect: vi.fn(),
  onOpenReview: vi.fn(),
  prStatus: null as { number: number; state: string } | null,
  hasWriteAccess: false,
  isPushingToMain: false,
  allowPushToMain: true,
  onCreatePr: vi.fn(),
  onPushToMain: vi.fn(),
  behindMainCount: 0,
  isFetchingBehindMain: false,
  isSyncingWithMain: false,
}

describe('SCWorkingView', () => {
  describe('Sync View (no changes)', () => {
    it('shows Up to date when no remote changes', () => {
      render(<SCWorkingView {...defaultProps} />)
      expect(screen.getByText('Up to date')).toBeTruthy()
    })

    it('shows commits to push when ahead', () => {
      const syncStatus = { current: 'feature/test', tracking: 'origin/feature/test', ahead: 3, behind: 0, files: [] }
      render(<SCWorkingView {...defaultProps} syncStatus={syncStatus} />)
      expect(screen.getByText(/3 commits to push/)).toBeTruthy()
    })

    it('shows commits to pull when behind', () => {
      const syncStatus = { current: 'feature/test', tracking: 'origin/feature/test', ahead: 0, behind: 2, files: [] }
      render(<SCWorkingView {...defaultProps} syncStatus={syncStatus} />)
      expect(screen.getByText(/2 commits to pull/)).toBeTruthy()
    })

    it('shows singular commit text', () => {
      const syncStatus = { current: 'feature/test', tracking: 'origin/feature/test', ahead: 1, behind: 0, files: [] }
      render(<SCWorkingView {...defaultProps} syncStatus={syncStatus} />)
      expect(screen.getByText(/1 commit to push/)).toBeTruthy()
    })

    it('shows Sync Changes button when tracking', () => {
      render(<SCWorkingView {...defaultProps} />)
      expect(screen.getByText('Sync Changes')).toBeTruthy()
    })

    it('shows Syncing... when syncing', () => {
      render(<SCWorkingView {...defaultProps} isSyncing={true} />)
      expect(screen.getByText('Syncing...')).toBeTruthy()
    })

    it('shows Push Branch to Remote when no tracking', () => {
      const syncStatus = { current: 'feature/test', tracking: null, ahead: 0, behind: 0, files: [] }
      render(<SCWorkingView {...defaultProps} syncStatus={syncStatus} />)
      expect(screen.getByText('Push Branch to Remote')).toBeTruthy()
    })

    it('calls onPushNewBranch when push button is clicked', () => {
      const onPushNewBranch = vi.fn()
      const syncStatus = { current: 'feature/test', tracking: null, ahead: 0, behind: 0, files: [] }
      render(<SCWorkingView {...defaultProps} syncStatus={syncStatus} onPushNewBranch={onPushNewBranch} />)
      fireEvent.click(screen.getByText('Push Branch to Remote'))
      expect(onPushNewBranch).toHaveBeenCalledWith('feature/test')
    })

    it('shows branch status card when branch is pushed', () => {
      render(<SCWorkingView {...defaultProps} branchStatus="pushed" />)
      expect(screen.getByText('PUSHED')).toBeTruthy()
      expect(screen.getByText('Changes pushed to remote.')).toBeTruthy()
    })

    it('shows Create PR button when pushed and no PR', () => {
      render(<SCWorkingView {...defaultProps} branchStatus="pushed" />)
      expect(screen.getByText('Create PR')).toBeTruthy()
    })

    it('shows Push to main button when pushed, write access, and allowPushToMain', () => {
      render(
        <SCWorkingView
          {...defaultProps}
          branchStatus="pushed"
          hasWriteAccess={true}
          allowPushToMain={true}
        />
      )
      expect(screen.getByText('Push to main')).toBeTruthy()
    })

    it('does not show Push to main when no write access', () => {
      render(
        <SCWorkingView
          {...defaultProps}
          branchStatus="pushed"
          hasWriteAccess={false}
          allowPushToMain={true}
        />
      )
      expect(screen.queryByText('Push to main')).toBeNull()
    })

    it('shows Get AI Review button when pushed or open', () => {
      render(<SCWorkingView {...defaultProps} branchStatus="pushed" />)
      expect(screen.getByText('Get AI Review')).toBeTruthy()
    })
  })

  describe('Commit View (has changes)', () => {
    const changesProps = {
      ...defaultProps,
      gitStatus: [
        { path: 'src/index.ts', status: 'modified' as const, staged: false, indexStatus: ' ', workingDirStatus: 'M' },
        { path: 'src/app.ts', status: 'added' as const, staged: true, indexStatus: 'A', workingDirStatus: ' ' },
      ],
      stagedFiles: [{ path: 'src/app.ts', status: 'added' as const, staged: true, indexStatus: 'A', workingDirStatus: ' ' }],
      unstagedFiles: [{ path: 'src/index.ts', status: 'modified' as const, staged: false, indexStatus: ' ', workingDirStatus: 'M' }],
    }

    it('shows commit input and button', () => {
      render(<SCWorkingView {...changesProps} />)
      expect(screen.getByPlaceholderText('Commit message')).toBeTruthy()
      expect(screen.getByText('Commit')).toBeTruthy()
    })

    it('shows staged and unstaged file sections', () => {
      render(<SCWorkingView {...changesProps} />)
      expect(screen.getByText('Staged Changes (1)')).toBeTruthy()
      expect(screen.getByText('Changes (1)')).toBeTruthy()
    })

    it('renders staged and unstaged file paths', () => {
      render(<SCWorkingView {...changesProps} />)
      expect(screen.getByText('src/app.ts')).toBeTruthy()
      expect(screen.getByText('src/index.ts')).toBeTruthy()
    })

    it('calls setCommitMessage on input change', () => {
      const setCommitMessage = vi.fn()
      render(<SCWorkingView {...changesProps} setCommitMessage={setCommitMessage} />)
      fireEvent.change(screen.getByPlaceholderText('Commit message'), { target: { value: 'test' } })
      expect(setCommitMessage).toHaveBeenCalledWith('test')
    })

    it('calls onCommit on Enter key', () => {
      const onCommit = vi.fn()
      render(<SCWorkingView {...changesProps} commitMessage="test" onCommit={onCommit} />)
      fireEvent.keyDown(screen.getByPlaceholderText('Commit message'), { key: 'Enter' })
      expect(onCommit).toHaveBeenCalled()
    })

    it('calls onCommit when commit button is clicked', () => {
      const onCommit = vi.fn()
      render(<SCWorkingView {...changesProps} commitMessage="test" onCommit={onCommit} />)
      fireEvent.click(screen.getByText('Commit'))
      expect(onCommit).toHaveBeenCalled()
    })

    it('disables commit button when no message', () => {
      render(<SCWorkingView {...changesProps} commitMessage="" />)
      const commitBtn = screen.getByText('Commit')
      expect(commitBtn.hasAttribute('disabled')).toBe(true)
    })

    it('shows Committing... when committing', () => {
      render(<SCWorkingView {...changesProps} isCommitting={true} />)
      expect(screen.getByText('Committing...')).toBeTruthy()
    })

    it('shows commit error', () => {
      render(<SCWorkingView {...changesProps} commitError="pre-commit hook failed" />)
      expect(screen.getByText(/pre-commit hook failed/)).toBeTruthy()
    })

    it('calls onFileSelect when clicking a staged file', () => {
      const onFileSelect = vi.fn()
      render(<SCWorkingView {...changesProps} onFileSelect={onFileSelect} />)
      fireEvent.click(screen.getByText('src/app.ts'))
      expect(onFileSelect).toHaveBeenCalledWith({
        filePath: '/repos/project/src/app.ts',
        openInDiffMode: true,
      })
    })

    it('shows No staged changes when none are staged', () => {
      render(<SCWorkingView {...changesProps} stagedFiles={[]} />)
      expect(screen.getByText('No staged changes')).toBeTruthy()
    })

    it('shows No changes when none are unstaged', () => {
      render(<SCWorkingView {...changesProps} unstagedFiles={[]} />)
      expect(screen.getByText('No changes')).toBeTruthy()
    })

    it('calls onUnstage when unstage button is clicked on staged file', () => {
      const onUnstage = vi.fn()
      render(<SCWorkingView {...changesProps} onUnstage={onUnstage} />)
      const unstageBtn = screen.getByTitle('Unstage')
      fireEvent.click(unstageBtn)
      expect(onUnstage).toHaveBeenCalledWith('src/app.ts')
    })

    it('calls onStage when stage button is clicked on unstaged file', () => {
      const onStage = vi.fn()
      render(<SCWorkingView {...changesProps} onStage={onStage} />)
      const stageBtn = screen.getByTitle('Stage')
      fireEvent.click(stageBtn)
      expect(onStage).toHaveBeenCalledWith('src/index.ts')
    })

    it('calls onFileSelect when clicking an unstaged file', () => {
      const onFileSelect = vi.fn()
      render(<SCWorkingView {...changesProps} onFileSelect={onFileSelect} />)
      fireEvent.click(screen.getByText('src/index.ts'))
      expect(onFileSelect).toHaveBeenCalledWith({
        filePath: '/repos/project/src/index.ts',
        openInDiffMode: true,
      })
    })

    it('shows context menu on Changes header', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue('stage-all')
      const onStageAll = vi.fn()
      render(<SCWorkingView {...changesProps} onStageAll={onStageAll} />)
      const changesHeader = screen.getByText('Changes (1)')
      await fireEvent.contextMenu(changesHeader)
      // menu.popup should have been called
      expect(window.menu.popup).toHaveBeenCalled()
    })

    it('shows Commit Merge button when isMerging is true', () => {
      render(<SCWorkingView {...changesProps} isMerging={true} />)
      expect(screen.getByText('Commit Merge')).toBeTruthy()
      expect(screen.queryByPlaceholderText('Commit message')).toBeNull()
    })

    it('calls onCommitMerge when Commit Merge is clicked', () => {
      const onCommitMerge = vi.fn()
      render(<SCWorkingView {...changesProps} isMerging={true} onCommitMerge={onCommitMerge} />)
      fireEvent.click(screen.getByText('Commit Merge'))
      expect(onCommitMerge).toHaveBeenCalled()
    })

    it('shows Committing... on merge commit button when committing', () => {
      render(<SCWorkingView {...changesProps} isMerging={true} isCommitting={true} />)
      expect(screen.getByText('Committing...')).toBeTruthy()
    })

    it('shows normal commit input when not merging', () => {
      render(<SCWorkingView {...changesProps} isMerging={false} />)
      expect(screen.getByPlaceholderText('Commit message')).toBeTruthy()
      expect(screen.queryByText('Commit Merge')).toBeNull()
    })

    it('shows merge in progress banner when merging with conflicts', () => {
      render(<SCWorkingView {...changesProps} isMerging={true} hasConflicts={true} />)
      expect(screen.getByText('Merge in progress')).toBeTruthy()
    })

    it('shows merge conflicts resolved banner when merging without conflicts', () => {
      render(<SCWorkingView {...changesProps} isMerging={true} hasConflicts={false} />)
      expect(screen.getByText('Merge conflicts resolved')).toBeTruthy()
    })

    it('shows enabled Resolve Conflicts button when merging with conflicts', () => {
      render(<SCWorkingView {...changesProps} isMerging={true} hasConflicts={true} />)
      const btn = screen.getByText('Resolve Conflicts')
      expect(btn).toBeTruthy()
      expect(btn.hasAttribute('disabled')).toBe(false)
    })

    it('calls onResolveConflicts when Resolve Conflicts is clicked', () => {
      const onResolveConflicts = vi.fn()
      render(<SCWorkingView {...changesProps} isMerging={true} hasConflicts={true} onResolveConflicts={onResolveConflicts} />)
      fireEvent.click(screen.getByText('Resolve Conflicts'))
      expect(onResolveConflicts).toHaveBeenCalled()
    })

    it('disables Resolve Conflicts after agent has been asked', () => {
      render(<SCWorkingView {...changesProps} isMerging={true} hasConflicts={true} askedAgentToResolve={true} />)
      const btn = screen.getByText('Resolving Conflicts...')
      expect(btn).toBeTruthy()
      expect(btn.hasAttribute('disabled')).toBe(true)
    })

    it('shows Commit Merge button when merging without conflicts', () => {
      render(<SCWorkingView {...changesProps} isMerging={true} hasConflicts={false} />)
      expect(screen.getByText('Commit Merge')).toBeTruthy()
      const btn = screen.getByText('Commit Merge')
      expect(btn.hasAttribute('disabled')).toBe(false)
    })
  })

  describe('Behind main indicator', () => {
    it('shows behind main banner when pushed and behind', () => {
      render(
        <SCWorkingView
          {...defaultProps}
          branchStatus="pushed"
          behindMainCount={3}
        />
      )
      expect(screen.getByText(/main has 3 new commits/)).toBeTruthy()
      expect(screen.getByText('Get latest from main')).toBeTruthy()
    })

    it('shows singular commit text when behind by 1', () => {
      render(
        <SCWorkingView
          {...defaultProps}
          branchStatus="pushed"
          behindMainCount={1}
        />
      )
      expect(screen.getByText(/main has 1 new commit$/)).toBeTruthy()
    })

    it('does not show behind main when count is 0', () => {
      render(
        <SCWorkingView
          {...defaultProps}
          branchStatus="pushed"
          behindMainCount={0}
        />
      )
      expect(screen.queryByText(/new commit/)).toBeNull()
    })

    it('does not show behind main when fetching', () => {
      render(
        <SCWorkingView
          {...defaultProps}
          branchStatus="pushed"
          behindMainCount={3}
          isFetchingBehindMain={true}
        />
      )
      expect(screen.queryByText(/new commit/)).toBeNull()
    })

    it('does not show behind main for in-progress branch', () => {
      render(
        <SCWorkingView
          {...defaultProps}
          branchStatus="in-progress"
          behindMainCount={3}
        />
      )
      expect(screen.queryByText(/new commit/)).toBeNull()
    })

    it('shows behind main banner for empty branch status', () => {
      render(
        <SCWorkingView
          {...defaultProps}
          branchStatus="empty"
          behindMainCount={2}
        />
      )
      expect(screen.getByText(/main has 2 new commits/)).toBeTruthy()
    })

    it('shows behind main banner for open branch status', () => {
      render(
        <SCWorkingView
          {...defaultProps}
          branchStatus="open"
          behindMainCount={2}
        />
      )
      expect(screen.getByText(/main has 2 new commits/)).toBeTruthy()
    })

    it('calls onSyncWithMain when Get latest button is clicked', () => {
      const onSyncWithMain = vi.fn()
      render(
        <SCWorkingView
          {...defaultProps}
          branchStatus="pushed"
          behindMainCount={3}
          onSyncWithMain={onSyncWithMain}
        />
      )
      fireEvent.click(screen.getByText('Get latest from main'))
      expect(onSyncWithMain).toHaveBeenCalled()
    })

    it('shows Syncing... when syncing with main', () => {
      render(
        <SCWorkingView
          {...defaultProps}
          branchStatus="pushed"
          behindMainCount={3}
          isSyncingWithMain={true}
        />
      )
      expect(screen.getByText('Syncing...')).toBeTruthy()
    })
  })
})
