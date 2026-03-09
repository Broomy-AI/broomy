import { describe, it, expect, vi, beforeEach } from 'vitest'
import { allowConsoleError } from '../../test/console-guard'

const mockGitInstance: Record<string, ReturnType<typeof vi.fn>> = {
  status: vi.fn(),
  checkIsRepo: vi.fn(),
  add: vi.fn(),
  reset: vi.fn(),
  checkout: vi.fn(),
  commit: vi.fn(),
  push: vi.fn(),
  pull: vi.fn(),
  diff: vi.fn(),
  raw: vi.fn(),
  env: vi.fn().mockImplementation(() => mockGitInstance),
}

vi.mock('simple-git', () => ({
  default: vi.fn(() => mockGitInstance),
}))

const mockReadFile = vi.fn()
vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}))

vi.mock('../gitStatusParser', () => ({
  statusFromChar: vi.fn((c: string) => {
    switch (c) {
      case 'M': return 'modified'
      case 'A': return 'added'
      case 'D': return 'deleted'
      case 'R': return 'renamed'
      case '?': return 'untracked'
      case 'U': return 'conflict'
      default: return 'modified'
    }
  }),
}))

vi.mock('./scenarios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./scenarios')>()
  return {
    ...actual,
    // Override branches so E2E getBranch tests use a known value
    getScenarioData: (scenario: string) => {
      const data = actual.getScenarioData(scenario as never)
      return { ...data, branches: { ...data.branches, '/test-repo': 'feature/test' } }
    },
  }
})

import { register } from './gitBasic'
import { E2EScenario, type HandlerContext } from './types'

function createMockCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    isE2ETest: false,
    e2eScenario: E2EScenario.Default, e2eRealRepos: false,
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
    dockerContainers: new Map(),
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

describe('gitBasic handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGitInstance.env.mockImplementation(() => mockGitInstance)
    // Default mock for raw: resolves to empty string (used by status for MERGE_HEAD check, show, etc.)
    mockGitInstance.raw.mockResolvedValue('')
  })

  describe('registration', () => {
    it('registers all expected channels', () => {
      const handlers = setupHandlers()
      expect(handlers['git:getBranch']).toBeDefined()
      expect(handlers['git:isGitRepo']).toBeDefined()
      expect(handlers['git:status']).toBeDefined()
      expect(handlers['git:stage']).toBeDefined()
      expect(handlers['git:stageAll']).toBeDefined()
      expect(handlers['git:unstage']).toBeDefined()
      expect(handlers['git:checkoutFile']).toBeDefined()
      expect(handlers['git:commit']).toBeDefined()
      expect(handlers['git:commitMerge']).toBeDefined()
      expect(handlers['git:push']).toBeDefined()
      expect(handlers['git:pull']).toBeDefined()
      expect(handlers['git:diff']).toBeDefined()
      expect(handlers['git:show']).toBeDefined()
    })
  })

  describe('git:getBranch', () => {
    it('returns E2E mock branch', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:getBranch'](null, '/test-repo')
      expect(result).toBe('feature/test')
    })

    it('returns branch from git status', async () => {
      mockGitInstance.status.mockResolvedValue({ current: 'develop' })
      const handlers = setupHandlers()
      const result = await handlers['git:getBranch'](null, '/repo')
      expect(result).toBe('develop')
    })

    it('returns unknown on error', async () => {
      mockGitInstance.status.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      const result = await handlers['git:getBranch'](null, '/repo')
      expect(result).toBe('unknown')
    })
  })

  describe('git:isGitRepo', () => {
    it('returns true in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:isGitRepo'](null, '/repo')).toBe(true)
    })

    it('returns checkIsRepo result', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true)
      const handlers = setupHandlers()
      expect(await handlers['git:isGitRepo'](null, '/repo')).toBe(true)
    })

    it('returns false on error', async () => {
      mockGitInstance.checkIsRepo.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:isGitRepo'](null, '/not-repo')).toBe(false)
    })
  })

  describe('git:status', () => {
    it('returns E2E mock status', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:status'](null, '/repo')
      expect(result.files).toHaveLength(3)
      expect(result.ahead).toBe(0)
    })

    it('returns screenshot mode status with more files', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
      const result = await handlers['git:status'](null, '/repo')
      expect(result.files.length).toBeGreaterThan(2)
      expect(result.ahead).toBe(3)
    })

    it('parses git status in normal mode', async () => {
      mockGitInstance.status.mockResolvedValue({
        files: [
          { path: 'file.ts', index: 'M', working_dir: ' ' },
          { path: 'new.ts', index: '?', working_dir: '?' },
        ],
        ahead: 1,
        behind: 0,
        tracking: 'origin/main',
        current: 'feature',
      })

      const handlers = setupHandlers()
      const result = await handlers['git:status'](null, '/repo')
      expect(result.files.length).toBeGreaterThan(0)
      expect(result.current).toBe('feature')
      expect(result.ahead).toBe(1)
    })

    it('handles file with only working dir change', async () => {
      mockGitInstance.status.mockResolvedValue({
        files: [
          { path: 'changed.ts', index: ' ', working_dir: 'M' },
        ],
        ahead: 0,
        behind: 0,
        tracking: null,
        current: 'main',
      })
      const handlers = setupHandlers()
      const result = await handlers['git:status'](null, '/repo')
      expect(result.files).toHaveLength(1)
      expect(result.files[0].staged).toBe(false)
    })

    it('handles file with no index and no working dir change gracefully', async () => {
      mockGitInstance.status.mockResolvedValue({
        files: [
          { path: 'weird.ts', index: ' ', working_dir: ' ' },
        ],
        ahead: 0,
        behind: 0,
        tracking: null,
        current: 'main',
      })
      const handlers = setupHandlers()
      const result = await handlers['git:status'](null, '/repo')
      expect(result.files).toHaveLength(1)
      expect(result.files[0].status).toBe('modified')
      expect(result.files[0].staged).toBe(false)
    })

    it('detects isMerging when MERGE_HEAD exists', async () => {
      mockGitInstance.status.mockResolvedValue({
        files: [],
        ahead: 0,
        behind: 0,
        tracking: null,
        current: 'feature',
      })
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      mockGitInstance.raw.mockImplementation((args: string[]): Promise<string> => {
        if (args[0] === 'rev-parse' && args[2] === 'MERGE_HEAD') {
          return Promise.resolve('abc123')
        }
        return Promise.resolve('')
      })
      const handlers = setupHandlers()
      const result = await handlers['git:status'](null, '/repo')
      expect(result.isMerging).toBe(true)
    })

    it('returns isMerging false when not merging', async () => {
      mockGitInstance.status.mockResolvedValue({
        files: [],
        ahead: 0,
        behind: 0,
        tracking: null,
        current: 'feature',
      })
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      mockGitInstance.raw.mockImplementation((args: string[]): Promise<string> => {
        if (args[0] === 'rev-parse' && args[2] === 'MERGE_HEAD') {
          return Promise.reject(new Error('not a merge'))
        }
        return Promise.resolve('')
      })
      const handlers = setupHandlers()
      const result = await handlers['git:status'](null, '/repo')
      expect(result.isMerging).toBe(false)
    })

    it('detects hasConflicts when unmerged files contain conflict markers', async () => {
      mockGitInstance.status.mockResolvedValue({
        files: [
          { path: 'conflict.ts', index: 'U', working_dir: 'U' },
          { path: 'clean.ts', index: 'M', working_dir: ' ' },
        ],
        ahead: 0,
        behind: 0,
        tracking: null,
        current: 'feature',
      })
      mockReadFile.mockResolvedValue('line1\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>>\nline2')
      const handlers = setupHandlers()
      const result = await handlers['git:status'](null, '/repo')
      expect(result.hasConflicts).toBe(true)
      expect(mockReadFile).toHaveBeenCalledWith('/repo/conflict.ts', 'utf-8')
    })

    it('returns hasConflicts false when unmerged files have no conflict markers', async () => {
      mockGitInstance.status.mockResolvedValue({
        files: [
          { path: 'resolved.ts', index: 'U', working_dir: 'U' },
        ],
        ahead: 0,
        behind: 0,
        tracking: null,
        current: 'feature',
      })
      mockReadFile.mockResolvedValue('clean content with no markers')
      const handlers = setupHandlers()
      const result = await handlers['git:status'](null, '/repo')
      expect(result.hasConflicts).toBe(false)
    })

    it('returns hasConflicts true when unmerged file cannot be read', async () => {
      mockGitInstance.status.mockResolvedValue({
        files: [
          { path: 'unreadable.ts', index: 'U', working_dir: 'U' },
        ],
        ahead: 0,
        behind: 0,
        tracking: null,
        current: 'feature',
      })
      mockReadFile.mockRejectedValue(new Error('ENOENT'))
      const handlers = setupHandlers()
      const result = await handlers['git:status'](null, '/repo')
      expect(result.hasConflicts).toBe(true)
    })

    it('returns hasConflicts false when no files have U status', async () => {
      mockGitInstance.status.mockResolvedValue({
        files: [
          { path: 'clean.ts', index: 'M', working_dir: ' ' },
        ],
        ahead: 0,
        behind: 0,
        tracking: null,
        current: 'feature',
      })
      const handlers = setupHandlers()
      const result = await handlers['git:status'](null, '/repo')
      expect(result.hasConflicts).toBe(false)
      expect(mockReadFile).not.toHaveBeenCalled()
    })

    it('returns empty status on error', async () => {
      mockGitInstance.status.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      const result = await handlers['git:status'](null, '/repo')
      expect(result.files).toEqual([])
      expect(result.current).toBeNull()
    })
  })

  describe('git:stage', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:stage'](null, '/repo', 'file.ts')
      expect(result).toEqual({ success: true })
    })

    it('stages a file in normal mode', async () => {
      mockGitInstance.add.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:stage'](null, '/repo', 'file.ts')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.add).toHaveBeenCalledWith(['file.ts'])
    })

    it('returns error on failure', async () => {
      mockGitInstance.add.mockRejectedValue(new Error('stage error'))
      const handlers = setupHandlers()
      const result = await handlers['git:stage'](null, '/repo', 'file.ts')
      expect(result).toEqual({ success: false, error: expect.stringContaining('stage error') })
    })
  })

  describe('git:stageAll', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:stageAll'](null, '/repo')
      expect(result).toEqual({ success: true })
    })

    it('stages all files in normal mode', async () => {
      mockGitInstance.add.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:stageAll'](null, '/repo')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.add).toHaveBeenCalledWith('.')
    })
  })

  describe('git:unstage', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:unstage'](null, '/repo', 'file.ts')
      expect(result).toEqual({ success: true })
    })

    it('resets file to unstage in normal mode', async () => {
      mockGitInstance.reset.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:unstage'](null, '/repo', 'file.ts')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.reset).toHaveBeenCalledWith(['HEAD', '--', 'file.ts'])
    })

    it('returns error on unstage failure', async () => {
      mockGitInstance.reset.mockRejectedValue(new Error('unstage error'))
      const handlers = setupHandlers()
      const result = await handlers['git:unstage'](null, '/repo', 'file.ts')
      expect(result).toEqual({ success: false, error: expect.stringContaining('unstage error') })
    })
  })

  describe('git:checkoutFile', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:checkoutFile'](null, '/repo', 'file.ts')
      expect(result).toEqual({ success: true })
    })

    it('checks out file in normal mode', async () => {
      mockGitInstance.checkout.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:checkoutFile'](null, '/repo', 'file.ts')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.checkout).toHaveBeenCalledWith(['--', 'file.ts'])
    })

    it('returns error on checkout failure', async () => {
      mockGitInstance.checkout.mockRejectedValue(new Error('checkout error'))
      const handlers = setupHandlers()
      const result = await handlers['git:checkoutFile'](null, '/repo', 'file.ts')
      expect(result).toEqual({ success: false, error: expect.stringContaining('checkout error') })
    })
  })

  describe('git:commit', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:commit'](null, '/repo', 'msg')
      expect(result).toEqual({ success: true })
    })

    it('rejects empty commit message', async () => {
      const handlers = setupHandlers()
      const result = await handlers['git:commit'](null, '/repo', '')
      expect(result).toEqual({ success: false, error: 'Commit message cannot be empty' })
    })

    it('rejects whitespace-only commit message', async () => {
      const handlers = setupHandlers()
      const result = await handlers['git:commit'](null, '/repo', '   ')
      expect(result).toEqual({ success: false, error: 'Commit message cannot be empty' })
    })

    it('commits in normal mode', async () => {
      mockGitInstance.commit.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:commit'](null, '/repo', 'Fix bug')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.commit).toHaveBeenCalledWith('Fix bug')
    })

    it('returns error on commit failure', async () => {
      mockGitInstance.commit.mockRejectedValue(new Error('nothing to commit'))
      const handlers = setupHandlers()
      const result = await handlers['git:commit'](null, '/repo', 'msg')
      expect(result).toEqual({ success: false, error: expect.stringContaining('nothing to commit') })
    })
  })

  describe('git:commitMerge', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:commitMerge'](null, '/repo')
      expect(result).toEqual({ success: true })
    })

    it('commits merge with --no-edit in normal mode', async () => {
      mockGitInstance.raw.mockResolvedValue('')
      const handlers = setupHandlers()
      const result = await handlers['git:commitMerge'](null, '/repo')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.raw).toHaveBeenCalledWith(['commit', '--no-edit'])
    })

    it('returns error on merge commit failure', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('merge commit failed'))
      const handlers = setupHandlers()
      const result = await handlers['git:commitMerge'](null, '/repo')
      expect(result).toEqual({ success: false, error: expect.stringContaining('merge commit failed') })
    })
  })

  describe('git:push', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:push'](null, '/repo')).toEqual({ success: true })
    })

    it('pushes in normal mode', async () => {
      mockGitInstance.push.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      expect(await handlers['git:push'](null, '/repo')).toEqual({ success: true })
    })

    it('returns error on failure', async () => {
      mockGitInstance.push.mockRejectedValue(new Error('push error'))
      const handlers = setupHandlers()
      const result = await handlers['git:push'](null, '/repo')
      expect(result).toEqual({ success: false, error: expect.stringContaining('push error') })
    })
  })

  describe('git:pull', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:pull'](null, '/repo')).toEqual({ success: true })
    })

    it('pulls in normal mode', async () => {
      mockGitInstance.pull.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      expect(await handlers['git:pull'](null, '/repo')).toEqual({ success: true })
    })

    it('returns error on pull failure', async () => {
      mockGitInstance.pull.mockRejectedValue(new Error('pull error'))
      const handlers = setupHandlers()
      const result = await handlers['git:pull'](null, '/repo')
      expect(result).toEqual({ success: false, error: expect.stringContaining('pull error') })
    })
  })

  describe('git:diff', () => {
    it('returns mock diff in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:diff'](null, '/repo')
      expect(result).toContain('diff --git')
    })

    it('returns screenshot mode diff with detailed content', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
      const result = await handlers['git:diff'](null, '/repo')
      expect(result).toContain('diff --git a/src/middleware/auth.ts')
      expect(result).toContain('TokenService')
      expect(result).toContain('SessionStore')
    })

    it('returns diff for specific file', async () => {
      mockGitInstance.diff.mockResolvedValue('file diff')
      const handlers = setupHandlers()
      const result = await handlers['git:diff'](null, '/repo', 'file.ts')
      expect(result).toBe('file diff')
      expect(mockGitInstance.diff).toHaveBeenCalledWith(['file.ts'])
    })

    it('returns diff for all files when no path specified', async () => {
      mockGitInstance.diff.mockResolvedValue('all diff')
      const handlers = setupHandlers()
      const result = await handlers['git:diff'](null, '/repo')
      expect(result).toBe('all diff')
      expect(mockGitInstance.diff).toHaveBeenCalledWith()
    })

    it('returns empty string on error', async () => {
      mockGitInstance.diff.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:diff'](null, '/repo')).toBe('')
    })
  })

  describe('git:show', () => {
    it('returns mock content in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:show'](null, '/repo', 'file.ts')
      expect(result).toContain('function main')
    })

    it('returns screenshot mode content with detailed code', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
      const result = await handlers['git:show'](null, '/repo', 'file.ts')
      expect(result).toContain('authenticate')
      expect(result).toContain('jwt.verify')
    })

    it('shows file at ref in normal mode', async () => {
      mockGitInstance.raw.mockResolvedValue('file content at ref')
      const handlers = setupHandlers()
      const result = await handlers['git:show'](null, '/repo', 'file.ts', 'abc123')
      expect(result).toBe('file content at ref')
      expect(mockGitInstance.raw).toHaveBeenCalledWith(['show', 'abc123:file.ts'])
    })

    it('defaults to HEAD ref', async () => {
      mockGitInstance.raw.mockResolvedValue('file at HEAD')
      const handlers = setupHandlers()
      await handlers['git:show'](null, '/repo', 'file.ts')
      expect(mockGitInstance.raw).toHaveBeenCalledWith(['show', 'HEAD:file.ts'])
    })

    it('returns empty string on error', async () => {
      allowConsoleError()
      mockGitInstance.raw.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:show'](null, '/repo', 'file.ts')).toBe('')
    })
  })
})
