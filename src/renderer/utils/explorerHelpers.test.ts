import { describe, it, expect } from 'vitest'
import {
  statusLabel,
  getStatusColor,
  statusBadgeLetter,
  statusBadgeColor,
  truncateError,
  shouldShowPushToMain,
  splitStagedFiles,
  isPrOpen,
  prStateBadgeClass,
} from './explorerHelpers'

describe('statusLabel', () => {
  it('returns "Modified" for modified', () => {
    expect(statusLabel('modified')).toBe('Modified')
  })

  it('returns "Added" for added', () => {
    expect(statusLabel('added')).toBe('Added')
  })

  it('returns "Deleted" for deleted', () => {
    expect(statusLabel('deleted')).toBe('Deleted')
  })

  it('returns "Untracked" for untracked', () => {
    expect(statusLabel('untracked')).toBe('Untracked')
  })

  it('returns "Renamed" for renamed', () => {
    expect(statusLabel('renamed')).toBe('Renamed')
  })

  it('returns the raw status for unknown values', () => {
    expect(statusLabel('unknown')).toBe('unknown')
    expect(statusLabel('copied')).toBe('copied')
  })
})

describe('getStatusColor', () => {
  it('returns yellow for modified', () => {
    expect(getStatusColor('modified')).toBe('text-yellow-400')
  })

  it('returns green for added', () => {
    expect(getStatusColor('added')).toBe('text-green-400')
  })

  it('returns red for deleted', () => {
    expect(getStatusColor('deleted')).toBe('text-red-400')
  })

  it('returns gray for untracked', () => {
    expect(getStatusColor('untracked')).toBe('text-gray-400')
  })

  it('returns blue for renamed', () => {
    expect(getStatusColor('renamed')).toBe('text-blue-400')
  })

  it('returns default for undefined', () => {
    expect(getStatusColor(undefined)).toBe('text-text-primary')
  })

  it('returns default for unknown status', () => {
    expect(getStatusColor('unknown')).toBe('text-text-primary')
  })
})

describe('statusBadgeLetter', () => {
  it('returns uppercased first letter', () => {
    expect(statusBadgeLetter('modified')).toBe('M')
    expect(statusBadgeLetter('added')).toBe('A')
    expect(statusBadgeLetter('deleted')).toBe('D')
    expect(statusBadgeLetter('untracked')).toBe('U')
    expect(statusBadgeLetter('renamed')).toBe('R')
  })

  it('handles already uppercased input', () => {
    expect(statusBadgeLetter('Modified')).toBe('M')
  })
})

describe('statusBadgeColor', () => {
  it('returns yellow for modified', () => {
    expect(statusBadgeColor('modified')).toBe('text-yellow-400')
  })

  it('returns green for added', () => {
    expect(statusBadgeColor('added')).toBe('text-green-400')
  })

  it('returns red for deleted', () => {
    expect(statusBadgeColor('deleted')).toBe('text-red-400')
  })

  it('returns gray for untracked', () => {
    expect(statusBadgeColor('untracked')).toBe('text-gray-400')
  })

  it('returns blue for renamed', () => {
    expect(statusBadgeColor('renamed')).toBe('text-blue-400')
  })

  it('returns default for unknown status', () => {
    expect(statusBadgeColor('unknown')).toBe('text-text-secondary')
  })
})

describe('truncateError', () => {
  it('returns short errors as-is', () => {
    expect(truncateError('Short error')).toBe('Short error')
  })

  it('truncates long errors at default 80 chars', () => {
    const longError = 'A'.repeat(100)
    const result = truncateError(longError)
    expect(result).toBe('A'.repeat(80) + '...')
    expect(result.length).toBe(83)
  })

  it('does not truncate errors at exactly 80 chars', () => {
    const exact = 'A'.repeat(80)
    expect(truncateError(exact)).toBe(exact)
  })

  it('supports custom max length', () => {
    expect(truncateError('Hello World', 5)).toBe('Hello...')
  })

  it('handles empty string', () => {
    expect(truncateError('')).toBe('')
  })
})

describe('shouldShowPushToMain', () => {
  it('returns true when both hasWriteAccess and allowPushToMain are true', () => {
    expect(shouldShowPushToMain(true, true)).toBe(true)
  })

  it('returns false when hasWriteAccess is false', () => {
    expect(shouldShowPushToMain(false, true)).toBe(false)
  })

  it('returns false when allowPushToMain is false', () => {
    expect(shouldShowPushToMain(true, false)).toBe(false)
  })

  it('returns false when allowPushToMain is undefined', () => {
    expect(shouldShowPushToMain(true, undefined)).toBe(false)
  })

  it('returns false when both are false', () => {
    expect(shouldShowPushToMain(false, false)).toBe(false)
  })
})

describe('splitStagedFiles', () => {
  it('splits files into staged and unstaged', () => {
    const files = [
      { path: 'a.ts', staged: true },
      { path: 'b.ts', staged: false },
      { path: 'c.ts', staged: true },
      { path: 'd.ts', staged: false },
    ]
    const result = splitStagedFiles(files)
    expect(result.staged).toHaveLength(2)
    expect(result.unstaged).toHaveLength(2)
    expect(result.staged.map(f => f.path)).toEqual(['a.ts', 'c.ts'])
    expect(result.unstaged.map(f => f.path)).toEqual(['b.ts', 'd.ts'])
  })

  it('returns empty arrays for empty input', () => {
    const result = splitStagedFiles([])
    expect(result.staged).toEqual([])
    expect(result.unstaged).toEqual([])
  })

  it('handles all staged', () => {
    const files = [
      { path: 'a.ts', staged: true },
      { path: 'b.ts', staged: true },
    ]
    const result = splitStagedFiles(files)
    expect(result.staged).toHaveLength(2)
    expect(result.unstaged).toHaveLength(0)
  })

  it('handles all unstaged', () => {
    const files = [
      { path: 'a.ts', staged: false },
      { path: 'b.ts', staged: false },
    ]
    const result = splitStagedFiles(files)
    expect(result.staged).toHaveLength(0)
    expect(result.unstaged).toHaveLength(2)
  })

  it('preserves extra properties on file objects', () => {
    const files = [
      { path: 'a.ts', staged: true, status: 'modified' },
    ]
    const result = splitStagedFiles(files)
    expect(result.staged[0]).toEqual({ path: 'a.ts', staged: true, status: 'modified' })
  })
})

describe('isPrOpen', () => {
  it('returns true for OPEN', () => {
    expect(isPrOpen('OPEN')).toBe(true)
  })

  it('returns false for MERGED', () => {
    expect(isPrOpen('MERGED')).toBe(false)
  })

  it('returns false for CLOSED', () => {
    expect(isPrOpen('CLOSED')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isPrOpen(undefined)).toBe(false)
  })
})

describe('prStateBadgeClass', () => {
  it('returns green classes for OPEN', () => {
    expect(prStateBadgeClass('OPEN')).toBe('bg-green-500/20 text-green-400')
  })

  it('returns purple classes for MERGED', () => {
    expect(prStateBadgeClass('MERGED')).toBe('bg-purple-500/20 text-purple-400')
  })

  it('returns red classes for CLOSED', () => {
    expect(prStateBadgeClass('CLOSED')).toBe('bg-red-500/20 text-red-400')
  })

  it('returns red classes for unknown states', () => {
    expect(prStateBadgeClass('UNKNOWN')).toBe('bg-red-500/20 text-red-400')
  })
})
