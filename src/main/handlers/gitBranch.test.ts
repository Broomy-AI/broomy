import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGitInstance = {
  clone: vi.fn(),
  raw: vi.fn(),
  push: vi.fn(),
  getRemotes: vi.fn(),
  log: vi.fn(),
  branch: vi.fn(),
  fetch: vi.fn(),
  merge: vi.fn(),
}

vi.mock('simple-git', () => ({
  default: vi.fn(() => mockGitInstance),
}))

vi.mock('../cloneErrorHint', () => ({
  getCloneErrorHint: vi.fn(() => null),
}))

vi.mock('../platform', () => ({
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
}))

vi.mock('./types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./types')>()
  return {
    ...actual,
    expandHomePath: (p: string) => p,
  }
})

import { register } from './gitBranch'
import { getCloneErrorHint } from '../cloneErrorHint'
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

describe('gitBranch handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('registration', () => {
    it('registers all expected channels', () => {
      const handlers = setupHandlers()
      expect(handlers['git:clone']).toBeDefined()
      expect(handlers['git:worktreeAdd']).toBeDefined()
      expect(handlers['git:worktreeList']).toBeDefined()
      expect(handlers['git:pushNewBranch']).toBeDefined()
      expect(handlers['git:defaultBranch']).toBeDefined()
      expect(handlers['git:remoteUrl']).toBeDefined()
      expect(handlers['git:headCommit']).toBeDefined()
      expect(handlers['git:listBranches']).toBeDefined()
      expect(handlers['git:fetchBranch']).toBeDefined()
      expect(handlers['git:fetchPrHead']).toBeDefined()
      expect(handlers['git:pullPrBranch']).toBeDefined()
      expect(handlers['git:isMergedInto']).toBeDefined()
      expect(handlers['git:hasBranchCommits']).toBeDefined()
      expect(handlers['git:worktreeRemove']).toBeDefined()
      expect(handlers['git:deleteBranch']).toBeDefined()
    })
  })

  describe('git:clone', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:clone'](null, 'https://github.com/org/repo.git', '/target')
      expect(result).toEqual({ success: true })
    })

    it('clones repo in normal mode', async () => {
      mockGitInstance.clone.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:clone'](null, 'https://github.com/org/repo.git', '/target')
      expect(result).toEqual({ success: true })
    })

    it('returns error with hint on failure', async () => {
      mockGitInstance.clone.mockRejectedValue(new Error('clone failed'))
      vi.mocked(getCloneErrorHint).mockReturnValue('\n\nTry SSH instead')

      const handlers = setupHandlers()
      const result = await handlers['git:clone'](null, 'https://github.com/org/repo.git', '/target')
      expect(result.success).toBe(false)
      expect(result.error).toContain('clone failed')
      expect(result.error).toContain('Try SSH instead')
    })

    it('returns error without hint when no hint applies', async () => {
      mockGitInstance.clone.mockRejectedValue(new Error('generic error'))
      vi.mocked(getCloneErrorHint).mockReturnValue(null)

      const handlers = setupHandlers()
      const result = await handlers['git:clone'](null, 'url', '/target')
      expect(result.success).toBe(false)
      expect(result.error).toContain('generic error')
    })
  })

  describe('git:worktreeAdd', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:worktreeAdd'](null, '/repo', '/wt', 'branch', 'main')
      expect(result).toEqual({ success: true })
    })

    it('adds worktree in normal mode', async () => {
      mockGitInstance.raw.mockResolvedValue('')
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAdd'](null, '/repo', '/wt', 'branch', 'main')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.raw).toHaveBeenCalledWith(['worktree', 'add', '-b', 'branch', '/wt', 'main'])
    })

    it('returns error on failure', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('worktree error'))
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAdd'](null, '/repo', '/wt', 'branch', 'main')
      expect(result).toEqual({ success: false, error: expect.stringContaining('worktree error') })
    })
  })

  describe('git:worktreeList', () => {
    it('returns mock worktree in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:worktreeList'](null, '/repo')
      expect(result).toHaveLength(1)
      expect(result[0].branch).toBe('main')
    })

    it('parses worktree list output', async () => {
      mockGitInstance.raw.mockResolvedValue(
        'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo-wt\nHEAD def456\nbranch refs/heads/feature\n'
      )

      const handlers = setupHandlers()
      const result = await handlers['git:worktreeList'](null, '/repo')
      expect(result).toHaveLength(2)
      expect(result[0].path).toBe('/repo')
      expect(result[0].branch).toBe('main')
      expect(result[0].head).toBe('abc123')
      expect(result[1].branch).toBe('feature')
    })

    it('returns empty array on error', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:worktreeList'](null, '/repo')).toEqual([])
    })
  })

  describe('git:pushNewBranch', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:pushNewBranch'](null, '/repo', 'branch')).toEqual({ success: true })
    })

    it('pushes with upstream in normal mode', async () => {
      mockGitInstance.push.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      await handlers['git:pushNewBranch'](null, '/repo', 'feature')
      expect(mockGitInstance.push).toHaveBeenCalledWith(['--set-upstream', 'origin', 'feature'])
    })
  })

  describe('git:defaultBranch', () => {
    it('returns main in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:defaultBranch'](null, '/repo')).toBe('main')
    })

    it('resolves from symbolic ref', async () => {
      mockGitInstance.raw.mockResolvedValue('refs/remotes/origin/develop\n')
      const handlers = setupHandlers()
      expect(await handlers['git:defaultBranch'](null, '/repo')).toBe('develop')
    })

    it('falls back to main when symbolic ref fails', async () => {
      mockGitInstance.raw.mockRejectedValueOnce(new Error('no ref'))
        .mockResolvedValueOnce('') // rev-parse --verify main succeeds
      const handlers = setupHandlers()
      expect(await handlers['git:defaultBranch'](null, '/repo')).toBe('main')
    })

    it('falls back to master when main does not exist', async () => {
      mockGitInstance.raw
        .mockRejectedValueOnce(new Error('no ref'))
        .mockRejectedValueOnce(new Error('no main'))
        .mockResolvedValueOnce('') // rev-parse --verify master succeeds
      const handlers = setupHandlers()
      expect(await handlers['git:defaultBranch'](null, '/repo')).toBe('master')
    })

    it('returns main when everything fails', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:defaultBranch'](null, '/repo')).toBe('main')
    })
  })

  describe('git:remoteUrl', () => {
    it('returns mock URL in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:remoteUrl'](null, '/repo')).toBe('git@github.com:user/demo-project.git')
    })

    it('returns origin fetch URL', async () => {
      mockGitInstance.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'https://github.com/org/repo.git', push: 'https://github.com/org/repo.git' } },
      ])
      const handlers = setupHandlers()
      expect(await handlers['git:remoteUrl'](null, '/repo')).toBe('https://github.com/org/repo.git')
    })

    it('returns null when no origin remote', async () => {
      mockGitInstance.getRemotes.mockResolvedValue([
        { name: 'upstream', refs: { fetch: 'url' } },
      ])
      const handlers = setupHandlers()
      expect(await handlers['git:remoteUrl'](null, '/repo')).toBeNull()
    })
  })

  describe('git:headCommit', () => {
    it('returns mock hash in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:headCommit'](null, '/repo')).toBe('abc1234567890')
    })

    it('returns latest commit hash', async () => {
      mockGitInstance.log.mockResolvedValue({ latest: { hash: 'abc' } })
      const handlers = setupHandlers()
      expect(await handlers['git:headCommit'](null, '/repo')).toBe('abc')
    })

    it('returns null on error', async () => {
      mockGitInstance.log.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:headCommit'](null, '/repo')).toBeNull()
    })
  })

  describe('git:listBranches', () => {
    it('returns mock branches in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:listBranches'](null, '/repo')
      expect(result).toHaveLength(4)
      expect(result[0].name).toBe('main')
      expect(result[0].current).toBe(true)
    })

    it('parses branch summary in normal mode', async () => {
      mockGitInstance.branch.mockResolvedValue({
        branches: {
          'main': { current: true },
          'feature': { current: false },
          'remotes/origin/main': { current: false },
          'remotes/origin/HEAD': { current: false },
        },
      })

      const handlers = setupHandlers()
      const result = await handlers['git:listBranches'](null, '/repo')
      // HEAD should be filtered out
      expect(result).toHaveLength(3)
      expect(result[0].name).toBe('main')
      expect(result[0].isRemote).toBe(false)
      expect(result[2].name).toBe('origin/main')
      expect(result[2].isRemote).toBe(true)
    })

    it('returns empty array on error', async () => {
      mockGitInstance.branch.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:listBranches'](null, '/repo')).toEqual([])
    })
  })

  describe('git:fetchBranch', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:fetchBranch'](null, '/repo', 'main')).toEqual({ success: true })
    })

    it('fetches branch in normal mode', async () => {
      mockGitInstance.fetch.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      expect(await handlers['git:fetchBranch'](null, '/repo', 'main')).toEqual({ success: true })
      expect(mockGitInstance.fetch).toHaveBeenCalledWith('origin', 'main')
    })
  })

  describe('git:fetchPrHead', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:fetchPrHead'](null, '/repo', 42)).toEqual({ success: true })
    })

    it('fetches PR head with target branch', async () => {
      mockGitInstance.fetch.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      await handlers['git:fetchPrHead'](null, '/repo', 42, 'pr-branch')
      expect(mockGitInstance.fetch).toHaveBeenCalledWith('origin', 'pull/42/head:refs/remotes/origin/pr-branch')
    })

    it('fetches PR head without target branch', async () => {
      mockGitInstance.fetch.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      await handlers['git:fetchPrHead'](null, '/repo', 42)
      expect(mockGitInstance.fetch).toHaveBeenCalledWith('origin', 'pull/42/head')
    })
  })

  describe('git:pullPrBranch', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:pullPrBranch'](null, '/repo', 'branch', 42)).toEqual({ success: true })
    })

    it('fetches by branch name first (same-repo PR)', async () => {
      mockGitInstance.fetch.mockResolvedValue(undefined)
      mockGitInstance.merge.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:pullPrBranch'](null, '/repo', 'feature', 42)
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.fetch).toHaveBeenCalledWith('origin', 'feature')
    })

    it('falls back to PR ref on branch fetch failure', async () => {
      mockGitInstance.fetch.mockRejectedValueOnce(new Error('no branch'))
        .mockResolvedValueOnce(undefined)
      mockGitInstance.merge.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:pullPrBranch'](null, '/repo', 'feature', 42)
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.fetch).toHaveBeenCalledWith('origin', 'pull/42/head:refs/remotes/origin/feature')
    })
  })

  describe('git:isMergedInto', () => {
    it('returns false in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:isMergedInto'](null, '/repo', 'main')).toBe(false)
    })

    it('returns true when rev-list count is 0', async () => {
      mockGitInstance.raw.mockResolvedValue('0\n')
      const handlers = setupHandlers()
      expect(await handlers['git:isMergedInto'](null, '/repo', 'main')).toBe(true)
    })

    it('checks content diff when commits exist', async () => {
      mockGitInstance.raw
        .mockResolvedValueOnce('2\n') // rev-list count > 0
        .mockResolvedValueOnce('abc123\n') // merge-base
        .mockResolvedValueOnce('file1.ts\nfile2.ts') // changed files (diff --name-only mergeBase HEAD)
        .mockResolvedValueOnce('') // diff output empty = merged

      const handlers = setupHandlers()
      expect(await handlers['git:isMergedInto'](null, '/repo', 'main')).toBe(true)
    })

    it('returns false on error', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:isMergedInto'](null, '/repo', 'main')).toBe(false)
    })
  })

  describe('git:hasBranchCommits', () => {
    it('returns false in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:hasBranchCommits'](null, '/repo', 'main')).toBe(false)
    })

    it('returns true when commits exist beyond merge-base', async () => {
      mockGitInstance.raw
        .mockResolvedValueOnce('abc123\n') // merge-base
        .mockResolvedValueOnce('3\n') // rev-list count
      const handlers = setupHandlers()
      expect(await handlers['git:hasBranchCommits'](null, '/repo', 'main')).toBe(true)
    })

    it('returns false when no commits beyond merge-base', async () => {
      mockGitInstance.raw
        .mockResolvedValueOnce('abc123\n')
        .mockResolvedValueOnce('0\n')
      const handlers = setupHandlers()
      expect(await handlers['git:hasBranchCommits'](null, '/repo', 'main')).toBe(false)
    })
  })

  describe('git:worktreeRemove', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:worktreeRemove'](null, '/repo', '/wt')).toEqual({ success: true })
    })

    it('removes worktree in normal mode', async () => {
      mockGitInstance.raw.mockResolvedValue('')
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeRemove'](null, '/repo', '/wt')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.raw).toHaveBeenCalledWith(['worktree', 'remove', '--force', '/wt'])
    })
  })

  describe('git:deleteBranch', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:deleteBranch'](null, '/repo', 'branch')).toEqual({ success: true })
    })

    it('deletes branch in normal mode', async () => {
      mockGitInstance.branch.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:deleteBranch'](null, '/repo', 'old-branch')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.branch).toHaveBeenCalledWith(['-D', 'old-branch'])
    })

    it('returns error on failure', async () => {
      mockGitInstance.branch.mockRejectedValue(new Error('branch in use'))
      const handlers = setupHandlers()
      const result = await handlers['git:deleteBranch'](null, '/repo', 'branch')
      expect(result).toEqual({ success: false, error: expect.stringContaining('branch in use') })
    })
  })
})
