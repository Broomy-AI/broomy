// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { SCCommitsView } from './SCCommitsView'
import type { GitCommitInfo } from '../../../preload/index'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

function makeCommit(overrides: Partial<GitCommitInfo> = {}): GitCommitInfo {
  return {
    hash: 'abc123def456',
    shortHash: 'abc123d',
    message: 'Fix bug in auth',
    author: 'test-user',
    date: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

const defaultProps = {
  directory: '/repos/project',
  branchCommits: [] as GitCommitInfo[],
  isCommitsLoading: false,
  branchBaseName: 'main',
  expandedCommits: new Set<string>(),
  commitFilesByHash: {} as Record<string, { path: string; status: string }[] | undefined>,
  loadingCommitFiles: new Set<string>(),
  onToggleCommit: vi.fn(),
  onFileSelect: vi.fn(),
}

describe('SCCommitsView', () => {
  it('shows loading state', () => {
    render(<SCCommitsView {...defaultProps} isCommitsLoading={true} />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('shows empty state with base branch name', () => {
    render(<SCCommitsView {...defaultProps} />)
    expect(screen.getByText('No commits ahead of main')).toBeTruthy()
  })

  it('renders commits with short hash and message', () => {
    const branchCommits = [
      makeCommit({ hash: 'hash1', shortHash: 'hash1', message: 'First commit' }),
      makeCommit({ hash: 'hash2', shortHash: 'hash2', message: 'Second commit' }),
    ]
    render(<SCCommitsView {...defaultProps} branchCommits={branchCommits} />)
    expect(screen.getByText('Commits (2)')).toBeTruthy()
    expect(screen.getByText('hash1')).toBeTruthy()
    expect(screen.getByText('First commit')).toBeTruthy()
    expect(screen.getByText('hash2')).toBeTruthy()
    expect(screen.getByText('Second commit')).toBeTruthy()
  })

  it('calls onToggleCommit when clicking a commit', () => {
    const onToggleCommit = vi.fn()
    const branchCommits = [makeCommit({ hash: 'hash1' })]
    render(<SCCommitsView {...defaultProps} branchCommits={branchCommits} onToggleCommit={onToggleCommit} />)
    fireEvent.click(screen.getByText('Fix bug in auth'))
    expect(onToggleCommit).toHaveBeenCalledWith('hash1')
  })

  it('shows expanded commit files', () => {
    const branchCommits = [makeCommit({ hash: 'hash1', shortHash: 'hash1', message: 'Fix' })]
    const expandedCommits = new Set(['hash1'])
    const commitFilesByHash = {
      hash1: [
        { path: 'src/auth.ts', status: 'modified' },
        { path: 'src/new.ts', status: 'added' },
      ],
    }
    render(
      <SCCommitsView
        {...defaultProps}
        branchCommits={branchCommits}
        expandedCommits={expandedCommits}
        commitFilesByHash={commitFilesByHash}
      />
    )
    expect(screen.getByText('src/auth.ts')).toBeTruthy()
    expect(screen.getByText('src/new.ts')).toBeTruthy()
  })

  it('shows Loading files... when commit files are loading', () => {
    const branchCommits = [makeCommit({ hash: 'hash1' })]
    const expandedCommits = new Set(['hash1'])
    const loadingCommitFiles = new Set(['hash1'])
    render(
      <SCCommitsView
        {...defaultProps}
        branchCommits={branchCommits}
        expandedCommits={expandedCommits}
        loadingCommitFiles={loadingCommitFiles}
      />
    )
    expect(screen.getByText('Loading files...')).toBeTruthy()
  })

  it('shows No files changed when commit has empty files array', () => {
    const branchCommits = [makeCommit({ hash: 'hash1' })]
    const expandedCommits = new Set(['hash1'])
    const commitFilesByHash = { hash1: [] }
    render(
      <SCCommitsView
        {...defaultProps}
        branchCommits={branchCommits}
        expandedCommits={expandedCommits}
        commitFilesByHash={commitFilesByHash}
      />
    )
    expect(screen.getByText('No files changed')).toBeTruthy()
  })

  it('calls onFileSelect with diff mode when clicking a commit file', () => {
    const onFileSelect = vi.fn()
    const branchCommits = [makeCommit({ hash: 'hash1', shortHash: 'hash1', message: 'Fix' })]
    const expandedCommits = new Set(['hash1'])
    const commitFilesByHash = {
      hash1: [{ path: 'src/auth.ts', status: 'modified' }],
    }
    render(
      <SCCommitsView
        {...defaultProps}
        branchCommits={branchCommits}
        expandedCommits={expandedCommits}
        commitFilesByHash={commitFilesByHash}
        onFileSelect={onFileSelect}
      />
    )
    fireEvent.click(screen.getByText('src/auth.ts'))
    expect(onFileSelect).toHaveBeenCalledWith({
      filePath: '/repos/project/src/auth.ts',
      openInDiffMode: true,
      diffBaseRef: 'hash1~1',
      diffCurrentRef: 'hash1',
      diffLabel: 'hash1: Fix',
    })
  })
})
