import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))

vi.mock('./types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./types')>()
  return {
    ...actual,
    expandHomePath: (p: string) => p,
  }
})

import { execSync } from 'child_process'
import { register } from './ghComments'
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
    it('returns mock comments in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['gh:prComments'](null, '/repo', 123)
      expect(result).toHaveLength(2)
      expect(result[0].author).toBe('reviewer')
      expect(result[0].path).toBe('src/index.ts')
    })

    it('parses gh API output in normal mode', () => {
      const mockOutput = [
        JSON.stringify({ id: 1, body: 'comment 1', path: 'file.ts', line: 5, side: 'RIGHT', author: 'user1', createdAt: '2024-01-01', url: 'https://example.com' }),
        JSON.stringify({ id: 2, body: 'comment 2', path: 'file2.ts', line: 10, side: 'LEFT', author: 'user2', createdAt: '2024-01-02', url: 'https://example.com/2' }),
      ].join('\n')
      vi.mocked(execSync).mockReturnValue(mockOutput)

      const handlers = setupHandlers()
      const result = handlers['gh:prComments'](null, '/repo', 42)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(1)
      expect(result[1].body).toBe('comment 2')
    })

    it('returns empty array on error', () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('gh not found') })

      const handlers = setupHandlers()
      const result = handlers['gh:prComments'](null, '/repo', 42)
      expect(result).toEqual([])
    })

    it('filters out malformed JSON lines', () => {
      vi.mocked(execSync).mockReturnValue('not json\n{}\n')

      const handlers = setupHandlers()
      const result = handlers['gh:prComments'](null, '/repo', 42)
      // "not json" becomes null and gets filtered, {} is valid
      expect(result).toHaveLength(1)
    })
  })

  describe('gh:replyToComment', () => {
    it('returns success in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['gh:replyToComment'](null, '/repo', 42, 1, 'reply text')
      expect(result).toEqual({ success: true })
    })

    it('calls execSync with correct args in normal mode', () => {
      vi.mocked(execSync).mockReturnValue('')

      const handlers = setupHandlers()
      const result = handlers['gh:replyToComment'](null, '/repo', 42, 1, 'reply text')
      expect(result).toEqual({ success: true })
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('42/comments'),
        expect.objectContaining({ cwd: '/repo' }),
      )
    })

    it('returns error on failure', () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('network error') })

      const handlers = setupHandlers()
      const result = handlers['gh:replyToComment'](null, '/repo', 42, 1, 'reply')
      expect(result).toEqual({ success: false, error: expect.stringContaining('network error') })
    })
  })

  describe('gh:prsToReview', () => {
    it('returns mock PRs in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['gh:prsToReview'](null, '/repo')
      expect(result).toHaveLength(2)
      expect(result[0].title).toContain('dark mode')
    })

    it('parses gh pr list output in normal mode', () => {
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
      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockPrs))

      const handlers = setupHandlers()
      const result = handlers['gh:prsToReview'](null, '/repo')
      expect(result).toHaveLength(1)
      expect(result[0].author).toBe('alice')
      expect(result[0].labels).toEqual(['bug'])
    })

    it('returns empty array on error', () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('gh error') })

      const handlers = setupHandlers()
      const result = handlers['gh:prsToReview'](null, '/repo')
      expect(result).toEqual([])
    })
  })

  describe('gh:submitDraftReview', () => {
    it('returns success with mock reviewId in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['gh:submitDraftReview'](null, '/repo', 42, [])
      expect(result).toEqual({ success: true, reviewId: 999 })
    })

    it('creates review via gh API in normal mode', () => {
      vi.mocked(execSync).mockReturnValue(JSON.stringify({ id: 123 }))

      const handlers = setupHandlers()
      const comments = [{ path: 'file.ts', line: 5, body: 'fix this' }]
      const result = handlers['gh:submitDraftReview'](null, '/repo', 42, comments)
      expect(result).toEqual({ success: true, reviewId: 123 })
    })

    it('returns error on failure', () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('api error') })

      const handlers = setupHandlers()
      const result = handlers['gh:submitDraftReview'](null, '/repo', 42, [])
      expect(result).toEqual({ success: false, error: expect.stringContaining('api error') })
    })
  })
})
