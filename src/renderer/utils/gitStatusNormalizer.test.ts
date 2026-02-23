import { describe, it, expect } from 'vitest'
import { normalizeGitStatus } from './gitStatusNormalizer'

describe('normalizeGitStatus', () => {
  describe('new object format', () => {
    it('passes through complete new format', () => {
      const input = {
        files: [
          { path: 'foo.ts', status: 'modified' as const, staged: true, indexStatus: 'M', workingDirStatus: ' ' },
        ],
        ahead: 2,
        behind: 1,
        tracking: 'origin/main',
        current: 'feature',
      }
      const result = normalizeGitStatus(input)
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe('foo.ts')
      expect(result.files[0].staged).toBe(true)
      expect(result.ahead).toBe(2)
      expect(result.behind).toBe(1)
      expect(result.tracking).toBe('origin/main')
      expect(result.current).toBe('feature')
    })

    it('fills in missing fields with defaults', () => {
      const input = {
        files: [
          { path: 'bar.ts', status: 'added' as const },
        ],
      }
      const result = normalizeGitStatus(input)
      expect(result.files[0].staged).toBe(false)
      expect(result.files[0].indexStatus).toBe(' ')
      expect(result.files[0].workingDirStatus).toBe(' ')
      expect(result.ahead).toBe(0)
      expect(result.behind).toBe(0)
      expect(result.tracking).toBeNull()
      expect(result.current).toBeNull()
    })

    it('preserves isMerging and hasConflicts fields', () => {
      const input = {
        files: [],
        ahead: 0,
        behind: 0,
        tracking: null,
        current: 'feature',
        isMerging: true,
        hasConflicts: true,
      }
      const result = normalizeGitStatus(input)
      expect(result.isMerging).toBe(true)
      expect(result.hasConflicts).toBe(true)
    })

    it('defaults isMerging and hasConflicts to false when missing', () => {
      const input = { files: [], ahead: 0, behind: 0, tracking: null, current: 'main' }
      const result = normalizeGitStatus(input)
      expect(result.isMerging).toBe(false)
      expect(result.hasConflicts).toBe(false)
    })

    it('handles empty files array', () => {
      const input = { files: [], ahead: 0, behind: 0, tracking: null, current: 'main' }
      const result = normalizeGitStatus(input)
      expect(result.files).toHaveLength(0)
      expect(result.current).toBe('main')
    })

    it('handles null files in new format', () => {
      const input = { files: null, ahead: 3, behind: 0, tracking: 'origin/main', current: 'dev' }
      const result = normalizeGitStatus(input)
      expect(result.files).toHaveLength(0)
      expect(result.ahead).toBe(3)
    })
  })

  describe('old array format', () => {
    it('converts flat array to new format', () => {
      const input = [
        { path: 'a.ts', status: 'modified' as const },
        { path: 'b.ts', status: 'untracked' as const, staged: true, indexStatus: 'A', workingDirStatus: '?' },
      ]
      const result = normalizeGitStatus(input)
      expect(result.files).toHaveLength(2)
      expect(result.files[0].path).toBe('a.ts')
      expect(result.files[0].staged).toBe(false)
      expect(result.files[0].indexStatus).toBe(' ')
      expect(result.files[1].staged).toBe(true)
      expect(result.files[1].indexStatus).toBe('A')
      expect(result.ahead).toBe(0)
      expect(result.behind).toBe(0)
      expect(result.tracking).toBeNull()
      expect(result.current).toBeNull()
    })

    it('defaults isMerging and hasConflicts to false', () => {
      const result = normalizeGitStatus([{ path: 'a.ts', status: 'modified' as const }])
      expect(result.isMerging).toBe(false)
      expect(result.hasConflicts).toBe(false)
    })

    it('handles empty array', () => {
      const result = normalizeGitStatus([])
      expect(result.files).toHaveLength(0)
      expect(result.ahead).toBe(0)
    })
  })

  describe('invalid input', () => {
    it('returns empty result for null', () => {
      const result = normalizeGitStatus(null)
      expect(result.files).toHaveLength(0)
      expect(result.ahead).toBe(0)
      expect(result.behind).toBe(0)
      expect(result.tracking).toBeNull()
      expect(result.current).toBeNull()
    })

    it('returns empty result for undefined', () => {
      const result = normalizeGitStatus(undefined)
      expect(result.files).toHaveLength(0)
    })

    it('returns empty result for string', () => {
      const result = normalizeGitStatus('not-valid')
      expect(result.files).toHaveLength(0)
    })

    it('returns empty result for number', () => {
      const result = normalizeGitStatus(42)
      expect(result.files).toHaveLength(0)
    })
  })
})
