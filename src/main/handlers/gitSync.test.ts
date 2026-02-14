import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGitInstance = {
  raw: vi.fn(),
  fetch: vi.fn(),
  merge: vi.fn(),
}

vi.mock('simple-git', () => ({
  default: vi.fn(() => mockGitInstance),
}))

vi.mock('./types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./types')>()
  return {
    ...actual,
    expandHomePath: (p: string) => p,
  }
})

import { register } from './gitSync'
import type { HandlerContext } from './types'

function createMockCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    isE2ETest: false,
    isScreenshotMode: false,
    isDev: false,
    isWindows: false,
    ptyProcesses: new Map(),
    ptyOwnerWindows: new Map(),
    fileWatchers: new Map(),
    watcherOwnerWindows: new Map(),
    profileWindows: new Map(),
    mainWindow: null,
    E2E_MOCK_SHELL: undefined,
    FAKE_CLAUDE_SCRIPT: undefined,
    ...overrides,
  }
}

function setupHandlers(ctx?: HandlerContext) {
  const handlers: Record<string, Function> = {}
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers[channel] = handler
    }),
  }
  register(mockIpcMain as never, ctx ?? createMockCtx())
  return handlers
}

describe('gitSync handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('registration', () => {
    it('registers all expected channels', () => {
      const handlers = setupHandlers()
      expect(handlers['git:pullOriginMain']).toBeDefined()
      expect(handlers['git:isBehindMain']).toBeDefined()
      expect(handlers['git:getConfig']).toBeDefined()
      expect(handlers['git:setConfig']).toBeDefined()
      expect(handlers['git:branchChanges']).toBeDefined()
      expect(handlers['git:branchCommits']).toBeDefined()
      expect(handlers['git:commitFiles']).toBeDefined()
    })
  })

  describe('git:pullOriginMain', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:pullOriginMain'](null, '/repo')).toEqual({ success: true })
    })

    it('fetches and merges default branch', async () => {
      mockGitInstance.raw.mockResolvedValue('refs/remotes/origin/main\n')
      mockGitInstance.fetch.mockResolvedValue(undefined)
      mockGitInstance.merge.mockResolvedValue(undefined)

      const handlers = setupHandlers()
      const result = await handlers['git:pullOriginMain'](null, '/repo')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.fetch).toHaveBeenCalledWith('origin', 'main')
      expect(mockGitInstance.merge).toHaveBeenCalledWith(['origin/main'])
    })

    it('reports merge conflicts', async () => {
      mockGitInstance.raw.mockResolvedValue('refs/remotes/origin/main\n')
      mockGitInstance.fetch.mockResolvedValue(undefined)
      mockGitInstance.merge.mockRejectedValue(new Error('CONFLICTS detected'))

      const handlers = setupHandlers()
      const result = await handlers['git:pullOriginMain'](null, '/repo')
      expect(result.success).toBe(false)
      expect(result.hasConflicts).toBe(true)
    })

    it('reports non-conflict merge errors', async () => {
      mockGitInstance.raw.mockResolvedValue('refs/remotes/origin/main\n')
      mockGitInstance.fetch.mockResolvedValue(undefined)
      mockGitInstance.merge.mockRejectedValue(new Error('generic merge error'))

      const handlers = setupHandlers()
      const result = await handlers['git:pullOriginMain'](null, '/repo')
      expect(result.success).toBe(false)
      expect(result.hasConflicts).toBe(false)
    })

    it('falls back to master when main does not exist', async () => {
      mockGitInstance.raw
        .mockRejectedValueOnce(new Error('no symbolic ref'))
        .mockRejectedValueOnce(new Error('no main'))
      mockGitInstance.fetch.mockResolvedValue(undefined)
      mockGitInstance.merge.mockResolvedValue(undefined)

      const handlers = setupHandlers()
      const result = await handlers['git:pullOriginMain'](null, '/repo')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.fetch).toHaveBeenCalledWith('origin', 'master')
    })

    it('returns error when fetch fails', async () => {
      mockGitInstance.raw.mockResolvedValue('refs/remotes/origin/main\n')
      mockGitInstance.fetch.mockRejectedValue(new Error('network error'))

      const handlers = setupHandlers()
      const result = await handlers['git:pullOriginMain'](null, '/repo')
      expect(result).toEqual({ success: false, hasConflicts: false, error: expect.stringContaining('network error') })
    })
  })

  describe('git:isBehindMain', () => {
    it('returns zero behind in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:isBehindMain'](null, '/repo')
      expect(result).toEqual({ behind: 0, defaultBranch: 'main' })
    })

    it('returns behind count', async () => {
      mockGitInstance.raw.mockResolvedValueOnce('refs/remotes/origin/main\n')
      mockGitInstance.fetch.mockResolvedValue(undefined)
      mockGitInstance.raw.mockResolvedValueOnce('5\n')

      const handlers = setupHandlers()
      const result = await handlers['git:isBehindMain'](null, '/repo')
      expect(result.behind).toBe(5)
      expect(result.defaultBranch).toBe('main')
    })

    it('returns zero on error', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('fail'))

      const handlers = setupHandlers()
      const result = await handlers['git:isBehindMain'](null, '/repo')
      expect(result).toEqual({ behind: 0, defaultBranch: 'main' })
    })
  })

  describe('git:getConfig', () => {
    it('returns null in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:getConfig'](null, '/repo', 'user.name')).toBeNull()
    })

    it('returns config value', async () => {
      mockGitInstance.raw.mockResolvedValue('John Doe\n')
      const handlers = setupHandlers()
      expect(await handlers['git:getConfig'](null, '/repo', 'user.name')).toBe('John Doe')
    })

    it('returns null for empty value', async () => {
      mockGitInstance.raw.mockResolvedValue('  \n')
      const handlers = setupHandlers()
      expect(await handlers['git:getConfig'](null, '/repo', 'user.name')).toBe(null)
    })

    it('returns null on error', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:getConfig'](null, '/repo', 'key')).toBeNull()
    })
  })

  describe('git:setConfig', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:setConfig'](null, '/repo', 'user.name', 'John')).toEqual({ success: true })
    })

    it('sets config value', async () => {
      mockGitInstance.raw.mockResolvedValue('')
      const handlers = setupHandlers()
      const result = await handlers['git:setConfig'](null, '/repo', 'user.name', 'John')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.raw).toHaveBeenCalledWith(['config', 'user.name', 'John'])
    })

    it('returns error on failure', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('config error'))
      const handlers = setupHandlers()
      const result = await handlers['git:setConfig'](null, '/repo', 'key', 'val')
      expect(result).toEqual({ success: false, error: expect.stringContaining('config error') })
    })
  })

  describe('git:branchChanges', () => {
    it('returns mock changes in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:branchChanges'](null, '/repo')
      expect(result.files).toHaveLength(2)
      expect(result.baseBranch).toBe('main')
    })

    it('returns screenshot mode changes', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, isScreenshotMode: true }))
      const result = await handlers['git:branchChanges'](null, '/repo')
      expect(result.files.length).toBeGreaterThan(2)
    })

    it('parses diff output in normal mode', async () => {
      mockGitInstance.raw
        .mockResolvedValueOnce('refs/remotes/origin/main\n') // symbolic-ref
        .mockResolvedValueOnce('M\tfile1.ts\nA\tfile2.ts\nD\tfile3.ts\nR100\told.ts\tnew.ts\n') // diff --name-status
        .mockResolvedValueOnce('abc123\n') // merge-base

      const handlers = setupHandlers()
      const result = await handlers['git:branchChanges'](null, '/repo')
      expect(result.files).toHaveLength(4)
      expect(result.files[0]).toEqual({ path: 'file1.ts', status: 'modified' })
      expect(result.files[1]).toEqual({ path: 'file2.ts', status: 'added' })
      expect(result.files[2]).toEqual({ path: 'file3.ts', status: 'deleted' })
      expect(result.files[3]).toEqual({ path: 'new.ts', status: 'renamed' })
    })

    it('uses provided baseBranch', async () => {
      mockGitInstance.raw
        .mockResolvedValueOnce('M\tfile.ts\n') // diff
        .mockResolvedValueOnce('abc\n') // merge-base

      const handlers = setupHandlers()
      const result = await handlers['git:branchChanges'](null, '/repo', 'develop')
      expect(result.baseBranch).toBe('develop')
    })

    it('returns empty on error', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      const result = await handlers['git:branchChanges'](null, '/repo')
      expect(result.files).toEqual([])
    })

    it('detects default branch by falling back through options', async () => {
      mockGitInstance.raw
        .mockRejectedValueOnce(new Error('no symbolic ref'))
        .mockRejectedValueOnce(new Error('no main'))
        .mockRejectedValueOnce(new Error('no master'))
        // Now it should use 'main' as fallback
        .mockResolvedValueOnce('M\tfile.ts\n') // diff
        .mockResolvedValueOnce('abc\n') // merge-base

      const handlers = setupHandlers()
      const result = await handlers['git:branchChanges'](null, '/repo')
      expect(result.baseBranch).toBe('main')
    })
  })

  describe('git:branchCommits', () => {
    it('returns mock commits in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:branchCommits'](null, '/repo')
      expect(result.commits).toHaveLength(2)
      expect(result.baseBranch).toBe('main')
    })

    it('returns screenshot mode commits', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, isScreenshotMode: true }))
      const result = await handlers['git:branchCommits'](null, '/repo')
      expect(result.commits).toHaveLength(4)
    })

    it('parses log output in normal mode', async () => {
      const SEP = '<<SEP>>'
      mockGitInstance.raw
        .mockResolvedValueOnce('refs/remotes/origin/main\n') // symbolic-ref
        .mockResolvedValueOnce(`hash1${SEP}short1${SEP}msg1${SEP}Author1${SEP}2025-01-01T00:00:00Z\nhash2${SEP}short2${SEP}msg2${SEP}Author2${SEP}2025-01-02T00:00:00Z\n`)

      const handlers = setupHandlers()
      const result = await handlers['git:branchCommits'](null, '/repo')
      expect(result.commits).toHaveLength(2)
      expect(result.commits[0].hash).toBe('hash1')
      expect(result.commits[0].message).toBe('msg1')
      expect(result.commits[1].author).toBe('Author2')
    })

    it('uses provided baseBranch', async () => {
      mockGitInstance.raw.mockResolvedValue('')
      const handlers = setupHandlers()
      const result = await handlers['git:branchCommits'](null, '/repo', 'develop')
      expect(result.baseBranch).toBe('develop')
    })

    it('returns empty commits on error', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      const result = await handlers['git:branchCommits'](null, '/repo')
      expect(result.commits).toEqual([])
    })
  })

  describe('git:commitFiles', () => {
    it('returns mock files in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:commitFiles'](null, '/repo', 'abc123')
      expect(result).toHaveLength(2)
      expect(result[0].path).toBe('src/index.ts')
    })

    it('parses diff-tree output in normal mode', async () => {
      mockGitInstance.raw.mockResolvedValue('M\tfile1.ts\nA\tfile2.ts\nD\tfile3.ts\nC100\tsrc.ts\tdest.ts\n')

      const handlers = setupHandlers()
      const result = await handlers['git:commitFiles'](null, '/repo', 'abc123')
      expect(result).toHaveLength(4)
      expect(result[0]).toEqual({ path: 'file1.ts', status: 'modified' })
      expect(result[1]).toEqual({ path: 'file2.ts', status: 'added' })
      expect(result[2]).toEqual({ path: 'file3.ts', status: 'deleted' })
      expect(result[3]).toEqual({ path: 'dest.ts', status: 'added' }) // C = copy/added
    })

    it('returns empty array on error', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:commitFiles'](null, '/repo', 'abc')).toEqual([])
    })
  })
})
