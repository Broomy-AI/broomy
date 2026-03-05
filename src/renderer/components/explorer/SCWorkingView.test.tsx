// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { SCWorkingView } from './SCWorkingView'
import type { ConditionState, TemplateVars } from '../../utils/commandsConfig'

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
  isMerging: false,
  hasConflicts: false,
  isCommitting: false,
  onCommit: vi.fn(),
  onCommitMerge: vi.fn(),
  onStage: vi.fn(),
  onStageAll: vi.fn(),
  onUnstage: vi.fn(),
  onFileSelect: vi.fn(),
  actions: null,
  conditionState: {} as ConditionState,
  templateVars: { main: 'main', branch: 'feature/test', directory: '/repos/project' } as TemplateVars,
}

describe('SCWorkingView', () => {
  describe('Status Info', () => {
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

    it('shows branch status card when branch is pushed', () => {
      render(<SCWorkingView {...defaultProps} branchStatus="pushed" />)
      expect(screen.getByText('PUSHED')).toBeTruthy()
      expect(screen.getByText('Changes pushed to remote.')).toBeTruthy()
    })

    it('shows No remote tracking branch when no tracking', () => {
      const syncStatus = { current: 'feature/test', tracking: null, ahead: 0, behind: 0, files: [] }
      render(<SCWorkingView {...defaultProps} syncStatus={syncStatus} />)
      expect(screen.getByText('No remote tracking branch')).toBeTruthy()
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

    it('shows Commit button', () => {
      render(<SCWorkingView {...changesProps} />)
      expect(screen.getByText('Commit')).toBeTruthy()
    })

    it('opens commit message dialog when Commit button is clicked', () => {
      render(<SCWorkingView {...changesProps} />)
      fireEvent.click(screen.getByText('Commit'))
      expect(screen.getByText('Commit Message')).toBeTruthy()
      expect(screen.getByPlaceholderText('Enter commit message...')).toBeTruthy()
    })

    it('shows Committing... on Commit button when isCommitting', () => {
      render(<SCWorkingView {...changesProps} isCommitting={true} />)
      expect(screen.getByText('Committing...')).toBeTruthy()
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

    it('shows Commit button when not merging', () => {
      render(<SCWorkingView {...changesProps} isMerging={false} />)
      expect(screen.getByText('Commit')).toBeTruthy()
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

    it('shows Commit Merge button when merging without conflicts', () => {
      render(<SCWorkingView {...changesProps} isMerging={true} hasConflicts={false} />)
      expect(screen.getByText('Commit Merge')).toBeTruthy()
      const btn = screen.getByText('Commit Merge')
      expect(btn.hasAttribute('disabled')).toBe(false)
    })
  })
})
