import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}))

vi.mock('../platform', () => ({
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
}))

import { readFileSync, readdirSync, statSync } from 'fs'
import { register } from './fsSearch'
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

describe('fsSearch handler', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('registers fs:search channel', () => {
    const handlers = setupHandlers()
    expect(handlers['fs:search']).toBeDefined()
  })

  it('returns empty array in E2E mode', () => {
    const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
    const result = handlers['fs:search'](null, '/dir', 'query')
    expect(result).toEqual([])
  })

  it('finds files matching by filename', () => {
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'search-result.ts', isDirectory: () => false },
      { name: 'other.ts', isDirectory: () => false },
    ] as never)
    vi.mocked(statSync).mockReturnValue({ size: 100 } as never)
    vi.mocked(readFileSync).mockReturnValue('no match here')

    const handlers = setupHandlers()
    const result = handlers['fs:search'](null, '/project', 'search')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('search-result.ts')
    expect(result[0].matchType).toBe('filename')
  })

  it('finds files matching by content', () => {
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'file.ts', isDirectory: () => false },
    ] as never)
    vi.mocked(statSync).mockReturnValue({ size: 100 } as never)
    vi.mocked(readFileSync).mockReturnValue('line 1\nfindme here\nline 3')

    const handlers = setupHandlers()
    const result = handlers['fs:search'](null, '/project', 'findme')
    expect(result).toHaveLength(1)
    expect(result[0].matchType).toBe('content')
    expect(result[0].contentMatches).toHaveLength(1)
    expect(result[0].contentMatches[0].line).toBe(2)
    expect(result[0].contentMatches[0].text).toContain('findme')
  })

  it('skips ignored directories', () => {
    vi.mocked(readdirSync).mockImplementation((dir: unknown) => {
      if (String(dir) === '/project') {
        return [
          { name: 'node_modules', isDirectory: () => true },
          { name: '.git', isDirectory: () => true },
          { name: 'src', isDirectory: () => true },
        ] as never
      }
      if (String(dir) === '/project/src') {
        return [
          { name: 'match.ts', isDirectory: () => false },
        ] as never
      }
      return [] as never
    })
    vi.mocked(statSync).mockReturnValue({ size: 100 } as never)
    vi.mocked(readFileSync).mockReturnValue('no match')

    const handlers = setupHandlers()
    const result = handlers['fs:search'](null, '/project', 'match')
    // Only src/match.ts should be found, node_modules and .git should be skipped
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('match.ts')
  })

  it('skips binary extensions for content search', () => {
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'image.png', isDirectory: () => false },
    ] as never)

    const handlers = setupHandlers()
    const result = handlers['fs:search'](null, '/project', 'image')
    // Should match by filename only, not content
    expect(result).toHaveLength(1)
    expect(result[0].matchType).toBe('filename')
    expect(result[0].contentMatches).toEqual([])
    expect(readFileSync).not.toHaveBeenCalled()
  })

  it('skips files larger than MAX_FILE_SIZE for content matching', () => {
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'huge.ts', isDirectory: () => false },
    ] as never)
    vi.mocked(statSync).mockReturnValue({ size: 2 * 1024 * 1024 } as never)

    const handlers = setupHandlers()
    const result = handlers['fs:search'](null, '/project', 'huge')
    // Matches by filename, but content search skipped due to size
    expect(result).toHaveLength(1)
    expect(result[0].contentMatches).toEqual([])
    expect(readFileSync).not.toHaveBeenCalled()
  })

  it('handles read errors gracefully during directory walk', () => {
    vi.mocked(readdirSync).mockImplementation(() => { throw new Error('permission denied') })

    const handlers = setupHandlers()
    const result = handlers['fs:search'](null, '/protected', 'query')
    expect(result).toEqual([])
  })

  it('limits content matches per file', () => {
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'file.ts', isDirectory: () => false },
    ] as never)
    vi.mocked(statSync).mockReturnValue({ size: 100 } as never)
    // Generate many matching lines
    const lines = Array.from({ length: 20 }, (_, i) => `match line ${i}`)
    vi.mocked(readFileSync).mockReturnValue(lines.join('\n'))

    const handlers = setupHandlers()
    const result = handlers['fs:search'](null, '/project', 'match')
    expect(result).toHaveLength(1)
    // MAX_CONTENT_MATCHES_PER_FILE = 5
    expect(result[0].contentMatches.length).toBeLessThanOrEqual(5)
  })

  it('performs case-insensitive search', () => {
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'FILE.ts', isDirectory: () => false },
    ] as never)
    vi.mocked(statSync).mockReturnValue({ size: 100 } as never)
    vi.mocked(readFileSync).mockReturnValue('nothing here')

    const handlers = setupHandlers()
    const result = handlers['fs:search'](null, '/project', 'file')
    expect(result).toHaveLength(1)
    expect(result[0].matchType).toBe('filename')
  })
})
