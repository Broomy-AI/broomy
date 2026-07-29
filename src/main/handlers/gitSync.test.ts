import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGitInstance = {
  raw: vi.fn<(args: string[]) => Promise<string>>(),
  fetch: vi.fn<(remote: string, branch: string) => Promise<void>>(),
  merge: vi.fn<(args: string[]) => Promise<void>>(),
  env: vi.fn(),
}
mockGitInstance.env.mockImplementation(() => mockGitInstance)

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

describe('gitSync handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGitInstance.env.mockImplementation(() => mockGitInstance)
  })

  describe('registration', () => {
    it('registers all expected channels', () => {
      const handlers = setupHandlers()
      expect(handlers['git:pullOriginMain']).toBeDefined()
      expect(handlers['git:isBehindMain']).toBeDefined()
      expect(handlers['git:getConfig']).toBeDefined()
      expect(handlers['git:setConfig']).toBeDefined()
      expect(handlers['git:setGlobalConfig']).toBeDefined()
      expect(handlers['git:branchChanges']).toBeDefined()
      expect(handlers['git:branchCommits']).toBeDefined()
      expect(handlers['git:commitFiles']).toBeDefined()
    })
  })

  // raw() serves getDefaultBranch (symbolic-ref refs/remotes/origin/HEAD) AND the on-default guard
  // (symbolic-ref --short HEAD) AND rev-list; route by argument so call ordering isn't brittle.
  const flush = () => new Promise((r) => setTimeout(r, 0))
  function rawRouter(opts: { defaultBranch?: string; headBranch?: string; behind?: string } = {}) {
    const def = opts.defaultBranch ?? 'main'
    mockGitInstance.raw.mockImplementation((args: string[]) => {
      if (args[0] === 'symbolic-ref' && args[1] === 'refs/remotes/origin/HEAD') return Promise.resolve(`refs/remotes/origin/${def}\n`)
      if (args[0] === 'symbolic-ref' && args[1] === '--short') {
        return opts.headBranch === 'detached' ? Promise.reject(new Error('not a symbolic ref')) : Promise.resolve(`${opts.headBranch ?? def}\n`)
      }
      if (args[0] === 'rev-list') return Promise.resolve(`${opts.behind ?? '0'}\n`)
      return Promise.resolve('')
    })
  }

  describe('git:pullOriginMain (#170)', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:pullOriginMain'](null, '/repo')).toEqual({ success: true })
    })

    it('fast-forwards the default branch (--ff-only)', async () => {
      rawRouter()
      mockGitInstance.fetch.mockResolvedValue(undefined)
      mockGitInstance.merge.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:pullOriginMain'](null, '/repo')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.fetch).toHaveBeenCalledWith('origin', 'main')
      expect(mockGitInstance.merge).toHaveBeenCalledWith(['--ff-only', 'origin/main'])
    })

    it('fails clearly when a diverged clone cannot fast-forward (no hasConflicts field)', async () => {
      rawRouter()
      mockGitInstance.fetch.mockResolvedValue(undefined)
      mockGitInstance.merge.mockRejectedValue(new Error('Not possible to fast-forward, aborting.'))
      const handlers = setupHandlers()
      const result = await handlers['git:pullOriginMain'](null, '/repo')
      expect(result.success).toBe(false)
      expect(result.error).toContain('fast-forward')
      expect(result).not.toHaveProperty('hasConflicts')
    })

    it('refuses to fast-forward when the clone is on a non-default branch', async () => {
      rawRouter({ headBranch: 'some-feature' })
      const handlers = setupHandlers()
      const result = await handlers['git:pullOriginMain'](null, '/repo')
      expect(result.success).toBe(false)
      expect(result.error).toContain('not "main"')
      expect(mockGitInstance.merge).not.toHaveBeenCalled()
    })

    it('refuses on a detached HEAD', async () => {
      rawRouter({ headBranch: 'detached' })
      const handlers = setupHandlers()
      const result = await handlers['git:pullOriginMain'](null, '/repo')
      expect(result.success).toBe(false)
      expect(result.error).toContain('detached HEAD')
      expect(mockGitInstance.merge).not.toHaveBeenCalled()
    })

    it('resolves a non-main default branch via the remote (allowRemote)', async () => {
      // origin/HEAD absent → ls-remote --symref → develop; clone is on develop.
      mockGitInstance.raw.mockImplementation((args: string[]) => {
        if (args[0] === 'symbolic-ref' && args[1] === 'refs/remotes/origin/HEAD') return Promise.reject(new Error('no origin/HEAD'))
        if (args[0] === 'ls-remote') return Promise.resolve('ref: refs/heads/develop\tHEAD\n0000\tHEAD\n')
        if (args[0] === 'symbolic-ref' && args[1] === '--short') return Promise.resolve('develop\n')
        return Promise.resolve('')
      })
      mockGitInstance.fetch.mockResolvedValue(undefined)
      mockGitInstance.merge.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:pullOriginMain'](null, '/repo')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.merge).toHaveBeenCalledWith(['--ff-only', 'origin/develop'])
    })

    it('returns the error when fetch fails', async () => {
      rawRouter()
      mockGitInstance.fetch.mockRejectedValue(new Error('network error'))
      const handlers = setupHandlers()
      const result = await handlers['git:pullOriginMain'](null, '/repo')
      expect(result.success).toBe(false)
      expect(result.error).toContain('network error')
    })

    it('serializes syncs on one clone tail-safely — a later caller cannot overtake a queued one', async () => {
      rawRouter()
      mockGitInstance.fetch.mockResolvedValue(undefined)
      const releases: (() => void)[] = []
      mockGitInstance.merge.mockImplementation(() => new Promise<void>((resolve) => releases.push(resolve)))
      const handlers = setupHandlers()
      const A = handlers['git:pullOriginMain'](null, '/repo')
      const B = handlers['git:pullOriginMain'](null, '/repo') // queued behind A
      await flush()
      expect(releases).toHaveLength(1) // only A is running
      releases[0]() // A completes
      await A
      const C = handlers['git:pullOriginMain'](null, '/repo') // arrives AFTER A settled — must NOT overtake B
      await flush()
      expect(releases).toHaveLength(2) // only B is running (C queued behind it — tail-safe cleanup held B's slot)
      releases[1]() // B completes
      await B
      await flush()
      expect(releases).toHaveLength(3) // C runs only now
      releases[2]()
      expect(await C).toEqual({ success: true })
    })
  })

  describe('git:isBehindMain (#170)', () => {
    it('returns a success result with 0 behind in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:isBehindMain'](null, '/repo')).toEqual({ success: true, behind: 0, defaultBranch: 'main' })
    })

    it('returns the behind count on success', async () => {
      rawRouter({ behind: '5' })
      mockGitInstance.fetch.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      expect(await handlers['git:isBehindMain'](null, '/repo')).toEqual({ success: true, behind: 5, defaultBranch: 'main' })
    })

    it('returns a discriminated failure (not 0) when it cannot check', async () => {
      mockGitInstance.raw.mockResolvedValue('refs/remotes/origin/main\n')
      mockGitInstance.fetch.mockRejectedValue(new Error('network down'))
      const handlers = setupHandlers()
      const result = await handlers['git:isBehindMain'](null, '/repo')
      expect(result.success).toBe(false)
      expect(result).not.toHaveProperty('behind')
      expect((result as { error: string }).error).toContain('network down')
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
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
      const result = await handlers['git:branchChanges'](null, '/repo')
      expect(result.files.length).toBeGreaterThan(2)
    })

    it('parses diff output in normal mode', async () => {
      mockGitInstance.raw
        .mockResolvedValueOnce('refs/remotes/origin/main\n') // symbolic-ref
        .mockResolvedValueOnce('M\tfile1.ts\nA\tfile2.ts\nD\tfile3.ts\nR100\told.ts\tnew.ts\nC100\tbase.ts\tcopy.ts\n') // diff --name-status
        .mockResolvedValueOnce('abc123\n') // merge-base

      const handlers = setupHandlers()
      const result = await handlers['git:branchChanges'](null, '/repo')
      expect(result.files).toHaveLength(5)
      expect(result.files[0]).toEqual({ path: 'file1.ts', status: 'modified' })
      expect(result.files[1]).toEqual({ path: 'file2.ts', status: 'added' })
      expect(result.files[2]).toEqual({ path: 'file3.ts', status: 'deleted' })
      expect(result.files[3]).toEqual({ path: 'new.ts', status: 'renamed' })
      expect(result.files[4]).toEqual({ path: 'copy.ts', status: 'added' }) // C = copy/added
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
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
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

  describe('git:setGlobalConfig', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:setGlobalConfig'](null, 'user.name', 'John')).toEqual({ success: true })
    })

    it('sets global config value in production mode', async () => {
      mockGitInstance.raw.mockResolvedValue('')
      const handlers = setupHandlers()
      const result = await handlers['git:setGlobalConfig'](null, 'user.name', 'John')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.raw).toHaveBeenCalledWith(['config', '--global', 'user.name', 'John'])
    })

    it('returns error on failure in production mode', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('config error'))
      const handlers = setupHandlers()
      const result = await handlers['git:setGlobalConfig'](null, 'user.name', 'John')
      expect(result).toEqual({ success: false, error: expect.stringContaining('config error') })
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
      mockGitInstance.raw.mockResolvedValue('M\tfile1.ts\nA\tfile2.ts\nD\tfile3.ts\nC100\tsrc.ts\tdest.ts\nR100\told.ts\tnew.ts\n')

      const handlers = setupHandlers()
      const result = await handlers['git:commitFiles'](null, '/repo', 'abc123')
      expect(result).toHaveLength(5)
      expect(result[0]).toEqual({ path: 'file1.ts', status: 'modified' })
      expect(result[1]).toEqual({ path: 'file2.ts', status: 'added' })
      expect(result[2]).toEqual({ path: 'file3.ts', status: 'deleted' })
      expect(result[3]).toEqual({ path: 'dest.ts', status: 'added' }) // C = copy/added
      expect(result[4]).toEqual({ path: 'new.ts', status: 'renamed' }) // R = renamed
    })

    it('returns empty array on error', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:commitFiles'](null, '/repo', 'abc')).toEqual([])
    })
  })
})
