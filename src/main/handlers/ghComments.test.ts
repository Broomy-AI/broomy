import { describe, it, expect, vi, beforeEach } from 'vitest'
import { allowConsoleError } from '../../test/console-guard'

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

vi.mock('./types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./types')>()
  return {
    ...actual,
    expandHomePath: (p: string) => p,
  }
})

import { execFile } from 'child_process'
import { register } from './ghComments'
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

describe('ghComments handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('registration', () => {
    it('registers all expected channels', () => {
      const handlers = setupHandlers()
      expect(handlers['gh:prComments']).toBeDefined()
      expect(handlers['gh:replyToComment']).toBeDefined()
      expect(handlers['gh:prsToReview']).toBeDefined()
      expect(handlers['gh:submitDraftReview']).toBeDefined()
    })
  })

  describe('gh:prComments', () => {
    it('returns mock comments in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:prComments'](null, '/repo', 123)
      expect(result).toHaveLength(2)
      expect(result[0].author).toBe('reviewer')
      expect(result[0].path).toBe('src/index.ts')
    })

    it('parses gh API output in normal mode', async () => {
      const mockOutput = [
        JSON.stringify({ id: 1, body: 'comment 1', path: 'file.ts', line: 5, side: 'RIGHT', author: 'user1', createdAt: '2024-01-01', url: 'https://example.com' }),
        JSON.stringify({ id: 2, body: 'comment 2', path: 'file2.ts', line: 10, side: 'LEFT', author: 'user2', createdAt: '2024-01-02', url: 'https://example.com/2' }),
      ].join('\n')
      vi.mocked(execFile).mockResolvedValue({ stdout: mockOutput, stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:prComments'](null, '/repo', 42)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(1)
      expect(result[1].body).toBe('comment 2')
    })

    it('returns empty array on error', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('gh not found'))

      const handlers = setupHandlers()
      const result = await handlers['gh:prComments'](null, '/repo', 42)
      expect(result).toEqual([])
    })

    it('filters out malformed JSON lines', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: 'not json\n{}\n', stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:prComments'](null, '/repo', 42)
      // "not json" becomes null and gets filtered, {} is valid
      expect(result).toHaveLength(1)
    })
  })

  describe('gh:replyToComment', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:replyToComment'](null, '/repo', 42, 1, 'reply text')
      expect(result).toEqual({ success: true })
    })

    it('calls execFile with correct args in normal mode', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: '', stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:replyToComment'](null, '/repo', 42, 1, 'reply text')
      expect(result).toEqual({ success: true })
      expect(execFile).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['api']),
        expect.objectContaining({ cwd: '/repo' }),
      )
    })

    it('returns error on failure', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('network error'))

      const handlers = setupHandlers()
      const result = await handlers['gh:replyToComment'](null, '/repo', 42, 1, 'reply')
      expect(result).toEqual({ success: false, error: expect.stringContaining('network error') })
    })
  })

  describe('gh:prsToReview', () => {
    it('returns mock PRs in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:prsToReview'](null, '/repo')
      expect(result).toHaveLength(2)
      expect(result[0].title).toContain('dark mode')
    })

    it('parses gh pr list output in normal mode', async () => {
      const mockPrs = [
        {
          number: 10,
          title: 'Test PR',
          author: { login: 'alice' },
          url: 'https://github.com/repo/pull/10',
          headRefName: 'feat',
          baseRefName: 'main',
          labels: [{ name: 'bug' }],
        },
      ]
      vi.mocked(execFile).mockResolvedValue({ stdout: JSON.stringify(mockPrs), stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:prsToReview'](null, '/repo')
      expect(result).toHaveLength(1)
      expect(result[0].author).toBe('alice')
      expect(result[0].labels).toEqual(['bug'])
    })

    it('returns empty array on error', async () => {
      allowConsoleError()
      vi.mocked(execFile).mockRejectedValue(new Error('gh error'))

      const handlers = setupHandlers()
      const result = await handlers['gh:prsToReview'](null, '/repo')
      expect(result).toEqual([])
    })
  })

  describe('gh:prDescription', () => {
    it('returns mock description in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:prDescription'](null, '/repo', 123)
      expect(result).toContain('dark mode')
    })

    it('returns description from gh CLI in normal mode', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: 'PR body text\n', stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:prDescription'](null, '/repo', 42)
      expect(result).toBe('PR body text')
    })

    it('returns null for empty body', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: '  \n', stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:prDescription'](null, '/repo', 42)
      expect(result).toBeNull()
    })

    it('returns null on error', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('gh error'))

      const handlers = setupHandlers()
      const result = await handlers['gh:prDescription'](null, '/repo', 42)
      expect(result).toBeNull()
    })
  })

  describe('gh:prIssueComments', () => {
    it('returns mock comments in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:prIssueComments'](null, '/repo', 123)
      expect(result).toHaveLength(2)
      expect(result[0].author).toBe('reviewer')
    })

    it('parses JSON lines output in normal mode', async () => {
      const mockOutput = [
        JSON.stringify({ id: 1, body: 'comment', author: 'user1', createdAt: '2024-01-01', url: 'https://example.com', reactions: [] }),
      ].join('\n')
      vi.mocked(execFile).mockResolvedValue({ stdout: mockOutput, stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:prIssueComments'](null, '/repo', 42)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(1)
    })

    it('returns empty array on error', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('gh error'))

      const handlers = setupHandlers()
      const result = await handlers['gh:prIssueComments'](null, '/repo', 42)
      expect(result).toEqual([])
    })

    it('passes pagination params', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: '', stderr: '' } as never)

      const handlers = setupHandlers()
      await handlers['gh:prIssueComments'](null, '/repo', 42, 2, 10)
      expect(execFile).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['-F', 'per_page=10', '-F', 'page=2']),
        expect.objectContaining({ cwd: '/repo' }),
      )
    })
  })

  describe('gh:addReaction', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:addReaction'](null, '/repo', 1, '+1', 'review')
      expect(result).toEqual({ success: true })
    })

    it('adds reaction to review comment', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: '', stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:addReaction'](null, '/repo', 5, 'heart', 'review')
      expect(result).toEqual({ success: true })
      expect(execFile).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['api', 'repos/{owner}/{repo}/pulls/comments/5/reactions']),
        expect.objectContaining({ cwd: '/repo' }),
      )
    })

    it('adds reaction to issue comment', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: '', stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:addReaction'](null, '/repo', 5, '+1', 'issue')
      expect(result).toEqual({ success: true })
      expect(execFile).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['api', 'repos/{owner}/{repo}/issues/comments/5/reactions']),
        expect.objectContaining({ cwd: '/repo' }),
      )
    })

    it('returns error on failure', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('api error'))

      const handlers = setupHandlers()
      const result = await handlers['gh:addReaction'](null, '/repo', 1, '+1', 'review')
      expect(result).toEqual({ success: false, error: expect.stringContaining('api error') })
    })
  })

  describe('gh:submitDraftReview', () => {
    it('returns success with mock reviewId in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:submitDraftReview'](null, '/repo', 42, [])
      expect(result).toEqual({ success: true, reviewId: 999 })
    })

    it('creates review via gh API in normal mode', async () => {
      vi.mocked(execFile).mockResolvedValue({ stdout: JSON.stringify({ id: 123 }), stderr: '' } as never)

      const handlers = setupHandlers()
      const comments = [{ path: 'file.ts', line: 5, body: 'fix this' }]
      const result = await handlers['gh:submitDraftReview'](null, '/repo', 42, comments)
      expect(result).toEqual({ success: true, reviewId: 123 })
    })

    it('returns error on failure', async () => {
      vi.mocked(execFile).mockRejectedValue(new Error('api error'))

      const handlers = setupHandlers()
      const result = await handlers['gh:submitDraftReview'](null, '/repo', 42, [])
      expect(result).toEqual({ success: false, error: expect.stringContaining('api error') })
    })
  })

  describe('gh:myReviewStatus', () => {
    it('returns pending in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['gh:myReviewStatus'](null, '/repo', 42)
      expect(result).toBe('pending')
    })

    it('returns reviewed when user is not in requested reviewers', async () => {
      vi.mocked(execFile)
        .mockReturnValueOnce({ stdout: 'user/repo\n', stderr: '' } as never)
        .mockReturnValueOnce({ stdout: 'octocat\n', stderr: '' } as never)
        .mockReturnValueOnce({ stdout: '\n', stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:myReviewStatus'](null, '/repo', 42)
      expect(result).toBe('reviewed')
    })

    it('returns pending when user is in requested reviewers', async () => {
      vi.mocked(execFile)
        .mockReturnValueOnce({ stdout: 'user/repo\n', stderr: '' } as never)
        .mockReturnValueOnce({ stdout: 'octocat\n', stderr: '' } as never)
        .mockReturnValueOnce({ stdout: 'octocat\n', stderr: '' } as never)

      const handlers = setupHandlers()
      const result = await handlers['gh:myReviewStatus'](null, '/repo', 42)
      expect(result).toBe('pending')
    })

    it('returns null on error', async () => {
      vi.mocked(execFile).mockImplementation(() => {
        throw new Error('network error')
      })

      const handlers = setupHandlers()
      const result = await handlers['gh:myReviewStatus'](null, '/repo', 42)
      expect(result).toBeNull()
    })
  })
})
