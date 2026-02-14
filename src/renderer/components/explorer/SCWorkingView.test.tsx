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
  syncStatus: { current: 'feature/test', tracking: 'origin/feature/test', ahead: 0, behind: 0 },
  branchStatus: 'in-progress' as const,
  branchBaseName: 'main',
  stagedFiles: [],
  unstagedFiles: [],
  commitMessage: '',
  setCommitMessage: vi.fn(),
  isCommitting: false,
  commitError: null as string | null,
  commitErrorExpanded: false,
  setCommitErrorExpanded: vi.fn(),
  setCommitError: vi.fn(),
  isSyncing: false,
  onCommit: vi.fn(),
  onSync: vi.fn(),
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
}

describe('SCWorkingView', () => {
  describe('Sync View (no changes)', () => {
    it('shows Up to date when no remote changes', () => {
      render(<SCWorkingView {...defaultProps} />)
      expect(screen.getByText('Up to date')).toBeTruthy()
    })

    it('shows commits to push when ahead', () => {
      const syncStatus = { current: 'feature/test', tracking: 'origin/feature/test', ahead: 3, behind: 0 }
      render(<SCWorkingView {...defaultProps} syncStatus={syncStatus} />)
      expect(screen.getByText(/3 commits to push/)).toBeTruthy()
    })

    it('shows commits to pull when behind', () => {
      const syncStatus = { current: 'feature/test', tracking: 'origin/feature/test', ahead: 0, behind: 2 }
      render(<SCWorkingView {...defaultProps} syncStatus={syncStatus} />)
      expect(screen.getByText(/2 commits to pull/)).toBeTruthy()
    })

    it('shows singular commit text', () => {
      const syncStatus = { current: 'feature/test', tracking: 'origin/feature/test', ahead: 1, behind: 0 }
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
      const syncStatus = { current: 'feature/test', tracking: null, ahead: 0, behind: 0 }
      render(<SCWorkingView {...defaultProps} syncStatus={syncStatus} />)
      expect(screen.getByText('Push Branch to Remote')).toBeTruthy()
    })

    it('calls onPushNewBranch when push button is clicked', () => {
      const onPushNewBranch = vi.fn()
      const syncStatus = { current: 'feature/test', tracking: null, ahead: 0, behind: 0 }
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
        { path: 'src/index.ts', status: 'modified', staged: false },
        { path: 'src/app.ts', status: 'added', staged: true },
      ],
      stagedFiles: [{ path: 'src/app.ts', status: 'added', staged: true }],
      unstagedFiles: [{ path: 'src/index.ts', status: 'modified', staged: false }],
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
  })
})
