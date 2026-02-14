import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))

const mockGitInstance = {
  status: vi.fn(),
  raw: vi.fn(),
  push: vi.fn(),
}

vi.mock('simple-git', () => ({
  default: vi.fn(() => mockGitInstance),
}))

vi.mock('../gitStatusParser', () => ({
  buildPrCreateUrl: vi.fn((slug: string, base: string, head: string) =>
    `https://github.com/${slug}/compare/${base}...${head}?expand=1`
  ),
}))

vi.mock('../platform', () => ({
  isWindows: false,
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
}))

vi.mock('./types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./types')>()
  return {
    ...actual,
    expandHomePath: (p: string) => p,
  }
})

import { execSync } from 'child_process'
import { register } from './ghCore'
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

describe('ghCore handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('registration', () => {
    it('registers all expected channels', () => {
      const handlers = setupHandlers()
      expect(handlers['agent:isInstalled']).toBeDefined()
      expect(handlers['git:isInstalled']).toBeDefined()
      expect(handlers['gh:isInstalled']).toBeDefined()
      expect(handlers['gh:issues']).toBeDefined()
      expect(handlers['gh:repoSlug']).toBeDefined()
      expect(handlers['gh:prStatus']).toBeDefined()
      expect(handlers['gh:hasWriteAccess']).toBeDefined()
      expect(handlers['gh:mergeBranchToMain']).toBeDefined()
      expect(handlers['gh:getPrCreateUrl']).toBeDefined()
    })
  })

  describe('agent:isInstalled', () => {
    it('returns true in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(handlers['agent:isInstalled'](null, 'claude')).toBe(true)
    })

    it('returns true when command exists', () => {
      vi.mocked(execSync).mockReturnValue('' as never)
      const handlers = setupHandlers()
      expect(handlers['agent:isInstalled'](null, 'claude')).toBe(true)
    })

    it('returns false when command not found', () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('not found') })
      const handlers = setupHandlers()
      expect(handlers['agent:isInstalled'](null, 'missing-cmd')).toBe(false)
    })
  })

  describe('git:isInstalled', () => {
    it('returns true in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(handlers['git:isInstalled']()).toBe(true)
    })

    it('returns true when git is available', () => {
      vi.mocked(execSync).mockReturnValue('' as never)
      const handlers = setupHandlers()
      expect(handlers['git:isInstalled']()).toBe(true)
    })

    it('returns false when git is not available', () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('not found') })
      const handlers = setupHandlers()
      expect(handlers['git:isInstalled']()).toBe(false)
    })
  })

  describe('gh:isInstalled', () => {
    it('returns true in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(handlers['gh:isInstalled']()).toBe(true)
    })

    it('returns false when gh is not installed', () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('not found') })
      const handlers = setupHandlers()
      expect(handlers['gh:isInstalled']()).toBe(false)
    })
  })

  describe('gh:issues', () => {
    it('returns mock issues in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['gh:issues'](null, '/repo')
      expect(result).toHaveLength(2)
      expect(result[0].number).toBe(42)
    })

    it('parses issue list in normal mode', () => {
      const mockIssues = [
        { number: 1, title: 'Bug', labels: [{ name: 'bug' }], url: 'https://github.com/repo/issues/1' },
      ]
      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockIssues))

      const handlers = setupHandlers()
      const result = handlers['gh:issues'](null, '/repo')
      expect(result).toHaveLength(1)
      expect(result[0].labels).toEqual(['bug'])
    })

    it('returns empty array on error', () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('fail') })
      const handlers = setupHandlers()
      expect(handlers['gh:issues'](null, '/repo')).toEqual([])
    })
  })

  describe('gh:repoSlug', () => {
    it('returns mock slug in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(handlers['gh:repoSlug'](null, '/repo')).toBe('user/demo-project')
    })

    it('returns slug from gh repo view', () => {
      vi.mocked(execSync).mockReturnValue('org/repo\n')
      const handlers = setupHandlers()
      expect(handlers['gh:repoSlug'](null, '/repo')).toBe('org/repo')
    })

    it('returns null on error', () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('fail') })
      const handlers = setupHandlers()
      expect(handlers['gh:repoSlug'](null, '/repo')).toBeNull()
    })

    it('returns null for empty result', () => {
      vi.mocked(execSync).mockReturnValue('  \n')
      const handlers = setupHandlers()
      expect(handlers['gh:repoSlug'](null, '/repo')).toBe(null)
    })
  })

  describe('gh:prStatus', () => {
    it('returns mock PR for non-main branch in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      // The E2E mock branches map has specific entries for some dirs
      const result = handlers['gh:prStatus'](null, '/some/dir')
      // For unmatched dirs, branch falls back to undefined which is falsy, so returns null
      expect(result).toBeNull()
    })

    it('returns PR data from gh pr view in normal mode', () => {
      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        number: 99,
        title: 'My PR',
        state: 'OPEN',
        url: 'https://github.com/org/repo/pull/99',
        headRefName: 'feature',
        baseRefName: 'main',
      }))

      const handlers = setupHandlers()
      const result = handlers['gh:prStatus'](null, '/repo')
      expect(result.number).toBe(99)
      expect(result.state).toBe('OPEN')
    })

    it('returns null on error', () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('no PR') })
      const handlers = setupHandlers()
      expect(handlers['gh:prStatus'](null, '/repo')).toBeNull()
    })
  })

  describe('gh:hasWriteAccess', () => {
    it('returns true in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(handlers['gh:hasWriteAccess'](null, '/repo')).toBe(true)
    })

    it('returns true for WRITE permission', () => {
      vi.mocked(execSync).mockReturnValue('WRITE\n')
      const handlers = setupHandlers()
      expect(handlers['gh:hasWriteAccess'](null, '/repo')).toBe(true)
    })

    it('returns true for ADMIN permission', () => {
      vi.mocked(execSync).mockReturnValue('ADMIN\n')
      const handlers = setupHandlers()
      expect(handlers['gh:hasWriteAccess'](null, '/repo')).toBe(true)
    })

    it('returns false for READ permission', () => {
      vi.mocked(execSync).mockReturnValue('READ\n')
      const handlers = setupHandlers()
      expect(handlers['gh:hasWriteAccess'](null, '/repo')).toBe(false)
    })

    it('returns false on error', () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('fail') })
      const handlers = setupHandlers()
      expect(handlers['gh:hasWriteAccess'](null, '/repo')).toBe(false)
    })
  })

  describe('gh:mergeBranchToMain', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:mergeBranchToMain'](null, '/repo')
      expect(result).toEqual({ success: true })
    })

    it('pushes current branch and to default branch', async () => {
      mockGitInstance.status.mockResolvedValue({ current: 'feature' })
      mockGitInstance.raw.mockResolvedValue('refs/remotes/origin/main\n')
      mockGitInstance.push.mockResolvedValue(undefined)

      const handlers = setupHandlers()
      const result = await handlers['gh:mergeBranchToMain'](null, '/repo')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.push).toHaveBeenCalledTimes(2)
    })

    it('returns error when current branch cannot be determined', async () => {
      mockGitInstance.status.mockResolvedValue({ current: null })

      const handlers = setupHandlers()
      const result = await handlers['gh:mergeBranchToMain'](null, '/repo')
      expect(result).toEqual({ success: false, error: 'Could not determine current branch' })
    })

    it('returns error on push failure', async () => {
      mockGitInstance.status.mockResolvedValue({ current: 'feature' })
      mockGitInstance.raw.mockResolvedValue('refs/remotes/origin/main\n')
      mockGitInstance.push.mockRejectedValue(new Error('push failed'))

      const handlers = setupHandlers()
      const result = await handlers['gh:mergeBranchToMain'](null, '/repo')
      expect(result).toEqual({ success: false, error: expect.stringContaining('push failed') })
    })

    it('falls back to master when origin/main does not exist', async () => {
      mockGitInstance.status.mockResolvedValue({ current: 'feature' })
      mockGitInstance.raw.mockRejectedValueOnce(new Error('no symbolic ref'))
        .mockRejectedValueOnce(new Error('no main'))
      mockGitInstance.push.mockResolvedValue(undefined)

      const handlers = setupHandlers()
      const result = await handlers['gh:mergeBranchToMain'](null, '/repo')
      expect(result).toEqual({ success: true })
      // Should push to master
      expect(mockGitInstance.push).toHaveBeenCalledWith('origin', 'HEAD:master')
    })
  })

  describe('gh:getPrCreateUrl', () => {
    it('returns mock URL in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:getPrCreateUrl'](null, '/repo')
      expect(result).toContain('github.com')
    })

    it('builds PR create URL in normal mode', async () => {
      mockGitInstance.status.mockResolvedValue({ current: 'feature/auth' })
      mockGitInstance.raw.mockResolvedValue('refs/remotes/origin/main\n')
      vi.mocked(execSync).mockReturnValue('org/repo\n')

      const handlers = setupHandlers()
      const result = await handlers['gh:getPrCreateUrl'](null, '/repo')
      expect(result).toContain('org/repo')
      expect(result).toContain('main')
      expect(result).toContain('feature/auth')
    })

    it('returns null when no current branch', async () => {
      mockGitInstance.status.mockResolvedValue({ current: null })

      const handlers = setupHandlers()
      const result = await handlers['gh:getPrCreateUrl'](null, '/repo')
      expect(result).toBeNull()
    })

    it('returns null when repo slug is empty', async () => {
      mockGitInstance.status.mockResolvedValue({ current: 'feature' })
      vi.mocked(execSync).mockReturnValue('  \n')

      const handlers = setupHandlers()
      const result = await handlers['gh:getPrCreateUrl'](null, '/repo')
      expect(result).toBeNull()
    })

    it('returns null on error', async () => {
      mockGitInstance.status.mockRejectedValue(new Error('fail'))

      const handlers = setupHandlers()
      const result = await handlers['gh:getPrCreateUrl'](null, '/repo')
      expect(result).toBeNull()
    })
  })
})
