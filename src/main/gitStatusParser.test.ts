import { describe, it, expect } from 'vitest'
import { statusFromChar, parseGitStatusFile, buildPrCreateUrl } from './gitStatusParser'

describe('statusFromChar', () => {
  it('maps M to modified', () => {
    expect(statusFromChar('M')).toBe('modified')
  })

  it('maps A to added', () => {
    expect(statusFromChar('A')).toBe('added')
  })

  it('maps D to deleted', () => {
    expect(statusFromChar('D')).toBe('deleted')
  })

  it('maps R to renamed', () => {
    expect(statusFromChar('R')).toBe('renamed')
  })

  it('maps ? to untracked', () => {
    expect(statusFromChar('?')).toBe('untracked')
  })

  it('defaults to modified for unknown chars', () => {
    expect(statusFromChar('X')).toBe('modified')
    expect(statusFromChar(' ')).toBe('modified')
    expect(statusFromChar('C')).toBe('modified')
  })
})

describe('parseGitStatusFile', () => {
  it('creates a staged entry for a file with index changes only', () => {
    const entries = parseGitStatusFile({ path: 'file.ts', index: 'M', working_dir: ' ' })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      path: 'file.ts',
      status: 'modified',
      staged: true,
      indexStatus: 'M',
      workingDirStatus: ' ',
    })
  })

  it('creates an unstaged entry for a file with working dir changes only', () => {
    const entries = parseGitStatusFile({ path: 'file.ts', index: ' ', working_dir: 'M' })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      path: 'file.ts',
      status: 'modified',
      staged: false,
      indexStatus: ' ',
      workingDirStatus: 'M',
    })
  })

  it('creates both staged and unstaged entries when file has both index and working dir changes', () => {
    const entries = parseGitStatusFile({ path: 'file.ts', index: 'M', working_dir: 'M' })
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({
      path: 'file.ts',
      status: 'modified',
      staged: true,
      indexStatus: 'M',
      workingDirStatus: 'M',
    })
    expect(entries[1]).toEqual({
      path: 'file.ts',
      status: 'modified',
      staged: false,
      indexStatus: 'M',
      workingDirStatus: 'M',
    })
  })

  it('handles added (staged) and modified (unstaged) combination', () => {
    const entries = parseGitStatusFile({ path: 'new.ts', index: 'A', working_dir: 'M' })
    expect(entries).toHaveLength(2)
    expect(entries[0].status).toBe('added')
    expect(entries[0].staged).toBe(true)
    expect(entries[1].status).toBe('modified')
    expect(entries[1].staged).toBe(false)
  })

  it('handles untracked files (? in working dir)', () => {
    const entries = parseGitStatusFile({ path: 'newfile.ts', index: '?', working_dir: '?' })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      path: 'newfile.ts',
      status: 'untracked',
      staged: false,
      indexStatus: '?',
      workingDirStatus: '?',
    })
  })

  it('handles deleted in index', () => {
    const entries = parseGitStatusFile({ path: 'removed.ts', index: 'D', working_dir: ' ' })
    expect(entries).toHaveLength(1)
    expect(entries[0].status).toBe('deleted')
    expect(entries[0].staged).toBe(true)
  })

  it('handles deleted in working dir', () => {
    const entries = parseGitStatusFile({ path: 'removed.ts', index: ' ', working_dir: 'D' })
    expect(entries).toHaveLength(1)
    expect(entries[0].status).toBe('deleted')
    expect(entries[0].staged).toBe(false)
  })

  it('handles renamed in index', () => {
    const entries = parseGitStatusFile({ path: 'renamed.ts', index: 'R', working_dir: ' ' })
    expect(entries).toHaveLength(1)
    expect(entries[0].status).toBe('renamed')
    expect(entries[0].staged).toBe(true)
  })

  it('handles empty index and working_dir strings by defaulting to space', () => {
    const entries = parseGitStatusFile({ path: 'weird.ts', index: '', working_dir: '' })
    expect(entries).toHaveLength(1)
    // Both empty -> defaults to space -> no index or working dir change -> fallback entry
    expect(entries[0].staged).toBe(false)
    expect(entries[0].status).toBe('modified')
  })

  it('handles staged added with working dir deleted', () => {
    const entries = parseGitStatusFile({ path: 'file.ts', index: 'A', working_dir: 'D' })
    expect(entries).toHaveLength(2)
    expect(entries[0].status).toBe('added')
    expect(entries[0].staged).toBe(true)
    expect(entries[1].status).toBe('deleted')
    expect(entries[1].staged).toBe(false)
  })
})

describe('buildPrCreateUrl', () => {
  it('builds a basic PR URL', () => {
    const url = buildPrCreateUrl('user/repo', 'main', 'feature-branch')
    expect(url).toBe('https://github.com/user/repo/compare/main...feature-branch?expand=1')
  })

  it('encodes branch names with slashes', () => {
    const url = buildPrCreateUrl('user/repo', 'main', 'feature/my-branch')
    expect(url).toBe('https://github.com/user/repo/compare/main...feature%2Fmy-branch?expand=1')
  })

  it('encodes special characters in branch names', () => {
    const url = buildPrCreateUrl('user/repo', 'main', 'fix/issue #123')
    expect(url).toContain('fix%2Fissue%20%23123')
  })

  it('encodes the default branch name too', () => {
    const url = buildPrCreateUrl('user/repo', 'release/1.0', 'hotfix/critical')
    expect(url).toContain('release%2F1.0...hotfix%2Fcritical')
  })

  it('handles simple branch names without encoding', () => {
    const url = buildPrCreateUrl('org/project', 'main', 'fix-typo')
    expect(url).toBe('https://github.com/org/project/compare/main...fix-typo?expand=1')
  })

  it('preserves the repo slug as-is', () => {
    const url = buildPrCreateUrl('my-org/my-repo', 'main', 'branch')
    expect(url).toContain('my-org/my-repo')
  })
})
