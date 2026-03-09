import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>()
  return {
    ...actual,
    promisify: (fn: Function) => fn,
  }
})

const mockGitInstance: Record<string, ReturnType<typeof vi.fn>> = {
  status: vi.fn(),
  raw: vi.fn(),
  push: vi.fn(),
  env: vi.fn().mockImplementation(() => mockGitInstance),
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
  getExecShell: vi.fn(() => undefined),
  resolveCommand: vi.fn(() => null),
  resolveWindowsCommand: vi.fn(() => null),
  enhancedPath: vi.fn((p: string) => p || ''),
}))

vi.mock('./types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./types')>()
  return {
    ...actual,
    expandHomePath: (p: string) => p,
  }
})

import { execFile } from 'child_process'
import { register } from './ghCore'
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

describe('ghCore handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGitInstance.env.mockImplementation(() => mockGitInstance)
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
      expect(handlers['gh:prChecksStatus']).toBeDefined()
      expect(handlers['gh:getPrCreateUrl']).toBeDefined()
    })
  })

  describe('agent:isInstalled', () => {
    it('returns true in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['agent:isInstalled'](null, 'claude')).toBe(true)
    })

    it('returns true when command exists', async () => {
      // Non-Windows path uses execFileAsync with shell -c to avoid command injection
      vi.mocked(execFile).mockResolvedValue({ stdout: '/usr/bin/claude', stderr: '' } as never)
      const handlers = setupHandlers()
      expect(await handlers['agent:isInstalled'](null, 'claude')).toBe(true)
    })

    it('returns false when command not found', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('not found'))
      const handlers = setupHandlers()
      expect(await handlers['agent:isInstalled'](null, 'missing-cmd')).toBe(false)
    })

    it('extracts base command from commands with flags', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: '/usr/bin/claude', stderr: '' } as never)
      const handlers = setupHandlers()
      expect(await handlers['agent:isInstalled'](null, 'claude --dangerously-skip-permissions')).toBe(true)
      // The shell args should use the base command, not the full string with flags
      const callArgs = vi.mocked(execFile).mock.calls[0]
      expect(callArgs[1]).toContain('claude')
    })
  })

  describe('git:isInstalled', () => {
    it('returns true in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:isInstalled']()).toBe(true)
    })

    it('returns true when git is available', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: 'git version 2.x', stderr: '' } as never)
      const handlers = setupHandlers()
      expect(await handlers['git:isInstalled']()).toBe(true)
    })

    it('returns false when git is not available', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('not found'))
      const handlers = setupHandlers()
      expect(await handlers['git:isInstalled']()).toBe(false)
    })
  })

  describe('gh:isInstalled', () => {
    it('returns true in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['gh:isInstalled']()).toBe(true)
    })

    it('returns false when gh is not installed', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('not found'))
      const handlers = setupHandlers()
      expect(await handlers['gh:isInstalled']()).toBe(false)
    })

    it('returns true when gh is installed', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: 'gh version 2.x', stderr: '' } as never)
      const handlers = setupHandlers()
      expect(await handlers['gh:isInstalled']()).toBe(true)
    })
  })

  describe('gh:issues', () => {
    it('returns mock issues in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:issues'](null, '/repo')
      expect(result).toHaveLength(2)
      expect(result[0].number).toBe(42)
    })

    it('parses issue list in normal mode', async () => {
      const mockIssues = [
        { number: 1, title: 'Bug', labels: [{ name: 'bug' }], url: 'https://github.com/repo/issues/1' },
      ]
      vi.mocked(execFile).mockResolvedValue({ stdout: JSON.stringify(mockIssues), stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:issues'](null, '/repo')
      expect(result).toHaveLength(1)
      expect(result[0].labels).toEqual(['bug'])
    })

    it('returns empty array on error', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['gh:issues'](null, '/repo')).toEqual([])
    })
  })

  describe('gh:searchIssues', () => {
    it('returns filtered mock issues in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:searchIssues'](null, '/repo', 'dark mode')
      expect(result).toHaveLength(1)
      expect(result[0].number).toBe(42)
    })

    it('returns mock issues matching label in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:searchIssues'](null, '/repo', 'bug')
      expect(result).toHaveLength(1)
      expect(result[0].number).toBe(17)
    })

    it('parses search results in normal mode', async () => {
      const mockIssues = [
        { number: 5, title: 'Search result', labels: [{ name: 'enhancement' }], url: 'https://github.com/repo/issues/5' },
      ]
      vi.mocked(execFile).mockResolvedValue({ stdout: JSON.stringify(mockIssues), stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:searchIssues'](null, '/repo', 'search')
      expect(result).toHaveLength(1)
      expect(result[0].labels).toEqual(['enhancement'])
    })

    it('returns empty array on error', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['gh:searchIssues'](null, '/repo', 'test')).toEqual([])
    })
  })

  describe('gh:repoSlug', () => {
    it('returns mock slug in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['gh:repoSlug'](null, '/repo')).toBe('user/demo-project')
    })

    it('returns slug from gh repo view', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: 'org/repo\n', stderr: '' } as never)
      const handlers = setupHandlers()
      expect(await handlers['gh:repoSlug'](null, '/repo')).toBe('org/repo')
    })

    it('returns null on error', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['gh:repoSlug'](null, '/repo')).toBeNull()
    })

    it('returns null for empty result', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: '  \n', stderr: '' } as never)
      const handlers = setupHandlers()
      expect(await handlers['gh:repoSlug'](null, '/repo')).toBe(null)
    })
  })

  describe('gh:prStatus', () => {
    it('returns mock PR for non-main branch in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      // For unmatched dirs, branch falls back to undefined which is falsy, so returns null
      const result = await handlers['gh:prStatus'](null, '/some/dir')
      expect(result).toBeNull()
    })

    it('returns PR data from gh pr view in normal mode', async () => {
      vi.mocked(execFile).mockResolvedValue({
        stdout: JSON.stringify({
          number: 99,
          title: 'My PR',
          state: 'OPEN',
          url: 'https://github.com/org/repo/pull/99',
          headRefName: 'feature',
          baseRefName: 'main',
        }),
        stderr: '',
      } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:prStatus'](null, '/repo')
      expect(result.number).toBe(99)
      expect(result.state).toBe('OPEN')
    })

    it('returns null on unexpected error', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('no PR'))
      const handlers = setupHandlers()
      expect(await handlers['gh:prStatus'](null, '/repo')).toBeNull()
    })
  })

  describe('gh:hasWriteAccess', () => {
    it('returns true in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['gh:hasWriteAccess'](null, '/repo')).toBe(true)
    })

    it('returns true for WRITE permission', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: 'WRITE\n', stderr: '' } as never)
      const handlers = setupHandlers()
      expect(await handlers['gh:hasWriteAccess'](null, '/repo')).toBe(true)
    })

    it('returns true for ADMIN permission', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: 'ADMIN\n', stderr: '' } as never)
      const handlers = setupHandlers()
      expect(await handlers['gh:hasWriteAccess'](null, '/repo')).toBe(true)
    })

    it('returns true for MAINTAIN permission', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: 'MAINTAIN\n', stderr: '' } as never)
      const handlers = setupHandlers()
      expect(await handlers['gh:hasWriteAccess'](null, '/repo')).toBe(true)
    })

    it('returns false for READ permission', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: 'READ\n', stderr: '' } as never)
      const handlers = setupHandlers()
      expect(await handlers['gh:hasWriteAccess'](null, '/repo')).toBe(false)
    })

    it('returns false on error', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['gh:hasWriteAccess'](null, '/repo')).toBe(false)
    })
  })

  describe('gh:prChecksStatus', () => {
    it('returns passed in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:prChecksStatus'](null, '/repo')
      expect(result).toBe('passed')
    })

    it('returns passed when all checks succeed', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: 'SUCCESS\nSUCCESS\n', stderr: '' } as never)
      const handlers = setupHandlers()
      const result = await handlers['gh:prChecksStatus'](null, '/repo')
      expect(result).toBe('passed')
    })

    it('returns pending when checks are in progress', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: 'SUCCESS\nPENDING\n', stderr: '' } as never)
      const handlers = setupHandlers()
      const result = await handlers['gh:prChecksStatus'](null, '/repo')
      expect(result).toBe('pending')
    })

    it('returns failed when a check fails', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: 'SUCCESS\nFAILURE\n', stderr: '' } as never)
      const handlers = setupHandlers()
      const result = await handlers['gh:prChecksStatus'](null, '/repo')
      expect(result).toBe('failed')
    })

    it('returns none when no checks exist', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: '', stderr: '' } as never)
      const handlers = setupHandlers()
      const result = await handlers['gh:prChecksStatus'](null, '/repo')
      expect(result).toBe('none')
    })

    it('returns none on error', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('no PR'))
      const handlers = setupHandlers()
      const result = await handlers['gh:prChecksStatus'](null, '/repo')
      expect(result).toBe('none')
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
      vi.mocked(execFile).mockResolvedValue({ stdout: 'org/repo\n', stderr: '' } as never)

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
      vi.mocked(execFile).mockResolvedValue({ stdout: '  \n', stderr: '' } as never)

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

  describe('gh:currentUser', () => {
    it('returns test-user in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:currentUser'](null)
      expect(result).toBe('test-user')
    })

    it('returns login from gh api', async () => {
      // promisify mock returns fn as-is, so execFileAsync === execFile
      vi.mocked(execFile).mockReturnValue({ stdout: 'octocat\n', stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:currentUser'](null)
      expect(result).toBe('octocat')
    })

    it('returns error object on error', async () => {
      vi.mocked(execFile).mockImplementation(() => {
        throw new Error('auth fail')
      })

      const handlers = setupHandlers()
      const result = await handlers['gh:currentUser'](null)
      expect(result).toEqual({ error: 'auth fail' })
    })
  })
})
