// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { SCBranchView } from './SCBranchView'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

const defaultProps = {
  directory: '/repos/project',
  branchChanges: [] as { path: string; status: string }[],
  isBranchLoading: false,
  branchBaseName: 'main',
  branchMergeBase: 'abc1234',
  onFileSelect: vi.fn(),
}

describe('SCBranchView', () => {
  it('shows loading state', () => {
    render(<SCBranchView {...defaultProps} isBranchLoading={true} />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('shows empty state with base branch name', () => {
    render(<SCBranchView {...defaultProps} />)
    expect(screen.getByText('No changes vs main')).toBeTruthy()
  })

  it('shows empty state with custom base branch', () => {
    render(<SCBranchView {...defaultProps} branchBaseName="develop" />)
    expect(screen.getByText('No changes vs develop')).toBeTruthy()
  })

  it('renders branch changes with file paths', () => {
    const branchChanges = [
      { path: 'src/index.ts', status: 'modified' },
      { path: 'src/new.ts', status: 'added' },
    ]
    render(<SCBranchView {...defaultProps} branchChanges={branchChanges} />)
    expect(screen.getByText('Changes vs main (2)')).toBeTruthy()
    expect(screen.getByText('src/index.ts')).toBeTruthy()
    expect(screen.getByText('src/new.ts')).toBeTruthy()
  })

  it('shows status badges for changes', () => {
    const branchChanges = [{ path: 'src/index.ts', status: 'modified' }]
    render(<SCBranchView {...defaultProps} branchChanges={branchChanges} />)
    expect(screen.getByText('M')).toBeTruthy()
  })

  it('calls onFileSelect with diff mode when clicking a file', () => {
    const onFileSelect = vi.fn()
    const branchChanges = [{ path: 'src/index.ts', status: 'modified' }]
    render(<SCBranchView {...defaultProps} branchChanges={branchChanges} onFileSelect={onFileSelect} />)
    fireEvent.click(screen.getByText('src/index.ts'))
    expect(onFileSelect).toHaveBeenCalledWith({
      filePath: '/repos/project/src/index.ts',
      openInDiffMode: true,
      diffBaseRef: 'abc1234',
      diffLabel: 'Branch vs main',
    })
  })

  it('uses fallback diff ref when merge base is empty', () => {
    const onFileSelect = vi.fn()
    const branchChanges = [{ path: 'src/index.ts', status: 'modified' }]
    render(
      <SCBranchView
        {...defaultProps}
        branchChanges={branchChanges}
        branchMergeBase=""
        onFileSelect={onFileSelect}
      />
    )
    fireEvent.click(screen.getByText('src/index.ts'))
    expect(onFileSelect).toHaveBeenCalledWith(
      expect.objectContaining({ diffBaseRef: 'origin/main' })
    )
  })

  it('shows title with status label on hover', () => {
    const branchChanges = [{ path: 'src/index.ts', status: 'modified' }]
    render(<SCBranchView {...defaultProps} branchChanges={branchChanges} />)
    const item = screen.getByTitle('src/index.ts \u2014 Modified')
    expect(item).toBeTruthy()
  })
})
