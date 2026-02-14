import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(),
  },
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  watch: vi.fn(),
  appendFileSync: vi.fn(),
  rmSync: vi.fn(),
}))

vi.mock('../platform', () => ({
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
}))

import { BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, watch, appendFileSync, rmSync } from 'fs'
import { register } from './fsCore'
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

describe('fsCore handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('registration', () => {
    it('registers all expected IPC channels', () => {
      const handlers = setupHandlers()
      expect(handlers['fs:readDir']).toBeDefined()
      expect(handlers['fs:readFile']).toBeDefined()
      expect(handlers['fs:writeFile']).toBeDefined()
      expect(handlers['fs:appendFile']).toBeDefined()
      expect(handlers['fs:exists']).toBeDefined()
      expect(handlers['fs:mkdir']).toBeDefined()
      expect(handlers['fs:rm']).toBeDefined()
      expect(handlers['fs:createFile']).toBeDefined()
      expect(handlers['fs:readFileBase64']).toBeDefined()
      expect(handlers['fs:watch']).toBeDefined()
      expect(handlers['fs:unwatch']).toBeDefined()
    })
  })

  describe('fs:readDir', () => {
    it('returns mock file tree in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['fs:readDir'](null, '/some/path')
      expect(result).toEqual([
        { name: 'src', path: expect.any(String), isDirectory: true },
        { name: 'package.json', path: expect.any(String), isDirectory: false },
        { name: 'README.md', path: expect.any(String), isDirectory: false },
      ])
    })

    it('returns screenshot-mode mock data for /src path', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, isScreenshotMode: true }))
      const result = handlers['fs:readDir'](null, '/project/src')
      expect(result.some((e: { name: string }) => e.name === 'components')).toBe(true)
      expect(result.some((e: { name: string }) => e.name === 'app.ts')).toBe(true)
    })

    it('reads directory entries sorted with dirs first in normal mode', () => {
      vi.mocked(readdirSync).mockReturnValue([
        { name: 'b.ts', isDirectory: () => false },
        { name: 'a-dir', isDirectory: () => true },
        { name: '.git', isDirectory: () => true },
        { name: 'a.ts', isDirectory: () => false },
      ] as never)

      const handlers = setupHandlers()
      const result = handlers['fs:readDir'](null, '/project')
      // .git should be filtered out
      expect(result).toHaveLength(3)
      // Directories first
      expect(result[0].isDirectory).toBe(true)
      expect(result[0].name).toBe('a-dir')
      // Files sorted alphabetically
      expect(result[1].name).toBe('a.ts')
      expect(result[2].name).toBe('b.ts')
    })

    it('returns empty array on read error', () => {
      vi.mocked(readdirSync).mockImplementation(() => { throw new Error('access denied') })
      const handlers = setupHandlers()
      const result = handlers['fs:readDir'](null, '/bad/path')
      expect(result).toEqual([])
    })
  })

  describe('fs:readFile', () => {
    it('returns mock content in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['fs:readFile'](null, '/some/file.ts')
      expect(result).toContain('Mock file content')
    })

    it('reads file content in normal mode', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => false, size: 100 } as never)
      vi.mocked(readFileSync).mockReturnValue('file content')

      const handlers = setupHandlers()
      const result = handlers['fs:readFile'](null, '/some/file.ts')
      expect(result).toBe('file content')
    })

    it('throws when file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const handlers = setupHandlers()
      expect(() => handlers['fs:readFile'](null, '/missing.ts')).toThrow('File not found')
    })

    it('throws when path is a directory', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true, size: 0 } as never)
      const handlers = setupHandlers()
      expect(() => handlers['fs:readFile'](null, '/some/dir')).toThrow('Cannot read directory as file')
    })

    it('throws when file is too large', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => false, size: 6 * 1024 * 1024 } as never)
      const handlers = setupHandlers()
      expect(() => handlers['fs:readFile'](null, '/big-file.bin')).toThrow('too large')
    })
  })

  describe('fs:writeFile', () => {
    it('returns success in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['fs:writeFile'](null, '/file.ts', 'content')
      expect(result).toEqual({ success: true })
    })

    it('writes file in normal mode', () => {
      const handlers = setupHandlers()
      const result = handlers['fs:writeFile'](null, '/file.ts', 'content')
      expect(result).toEqual({ success: true })
      expect(writeFileSync).toHaveBeenCalledWith('/file.ts', 'content', 'utf-8')
    })

    it('returns error when write fails', () => {
      vi.mocked(writeFileSync).mockImplementation(() => { throw new Error('write error') })
      const handlers = setupHandlers()
      const result = handlers['fs:writeFile'](null, '/file.ts', 'content')
      expect(result).toEqual({ success: false, error: expect.stringContaining('write error') })
    })
  })

  describe('fs:appendFile', () => {
    it('returns success in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['fs:appendFile'](null, '/file.ts', 'content')
      expect(result).toEqual({ success: true })
    })

    it('appends to file in normal mode', () => {
      const handlers = setupHandlers()
      const result = handlers['fs:appendFile'](null, '/file.ts', 'more content')
      expect(result).toEqual({ success: true })
      expect(appendFileSync).toHaveBeenCalledWith('/file.ts', 'more content', 'utf-8')
    })

    it('returns error when append fails', () => {
      vi.mocked(appendFileSync).mockImplementation(() => { throw new Error('append error') })
      const handlers = setupHandlers()
      const result = handlers['fs:appendFile'](null, '/file.ts', 'content')
      expect(result).toEqual({ success: false, error: expect.stringContaining('append error') })
    })
  })

  describe('fs:exists', () => {
    it('returns true for screenshot-mode review files', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, isScreenshotMode: true }))
      const result = handlers['fs:exists'](null, '/tmp/broomy-review-abc/review.json')
      expect(result).toBe(true)
    })

    it('delegates to existsSync in normal mode', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const handlers = setupHandlers()
      const result = handlers['fs:exists'](null, '/missing-file.ts')
      expect(result).toBe(false)
    })
  })

  describe('fs:mkdir', () => {
    it('returns success in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['fs:mkdir'](null, '/new/dir')
      expect(result).toEqual({ success: true })
    })

    it('creates directory in normal mode', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const handlers = setupHandlers()
      const result = handlers['fs:mkdir'](null, '/new/dir')
      expect(result).toEqual({ success: true })
      expect(mkdirSync).toHaveBeenCalledWith('/new/dir', { recursive: true })
    })

    it('returns error when directory already exists', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      const handlers = setupHandlers()
      const result = handlers['fs:mkdir'](null, '/existing/dir')
      expect(result).toEqual({ success: false, error: 'Directory already exists' })
    })
  })

  describe('fs:rm', () => {
    it('returns success in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['fs:rm'](null, '/some/path')
      expect(result).toEqual({ success: true })
    })

    it('removes target in normal mode', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      const handlers = setupHandlers()
      const result = handlers['fs:rm'](null, '/some/file.ts')
      expect(result).toEqual({ success: true })
      expect(rmSync).toHaveBeenCalledWith('/some/file.ts', { recursive: true, force: true })
    })

    it('returns success when target does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const handlers = setupHandlers()
      const result = handlers['fs:rm'](null, '/missing/file.ts')
      expect(result).toEqual({ success: true })
    })

    it('returns error when rm fails', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(rmSync).mockImplementation(() => { throw new Error('rm error') })
      const handlers = setupHandlers()
      const result = handlers['fs:rm'](null, '/locked/file.ts')
      expect(result).toEqual({ success: false, error: expect.stringContaining('rm error') })
    })
  })

  describe('fs:createFile', () => {
    it('returns success in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['fs:createFile'](null, '/new-file.ts')
      expect(result).toEqual({ success: true })
    })

    it('creates empty file in normal mode', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const handlers = setupHandlers()
      const result = handlers['fs:createFile'](null, '/new-file.ts')
      expect(result).toEqual({ success: true })
      expect(writeFileSync).toHaveBeenCalledWith('/new-file.ts', '')
    })

    it('returns error when file already exists', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      const handlers = setupHandlers()
      const result = handlers['fs:createFile'](null, '/existing.ts')
      expect(result).toEqual({ success: false, error: 'File already exists' })
    })
  })

  describe('fs:readFileBase64', () => {
    it('returns mock base64 in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['fs:readFileBase64'](null, '/image.png')
      expect(result).toContain('iVBOR')
    })

    it('reads file as base64 in normal mode', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => false, size: 100 } as never)
      const buf = Buffer.from('hello')
      vi.mocked(readFileSync).mockReturnValue(buf as never)

      const handlers = setupHandlers()
      const result = handlers['fs:readFileBase64'](null, '/file.png')
      expect(result).toBe(buf.toString('base64'))
    })

    it('throws when file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const handlers = setupHandlers()
      expect(() => handlers['fs:readFileBase64'](null, '/missing.png')).toThrow('File not found')
    })

    it('throws when file is too large', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => false, size: 11 * 1024 * 1024 } as never)
      const handlers = setupHandlers()
      expect(() => handlers['fs:readFileBase64'](null, '/huge.bin')).toThrow('too large')
    })
  })

  describe('fs:watch', () => {
    it('returns success in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const event = { sender: {} }
      const result = handlers['fs:watch'](event, 'watch-1', '/dir')
      expect(result).toEqual({ success: true })
    })

    it('sets up a file watcher in normal mode', () => {
      const mockWatcher = { on: vi.fn(), close: vi.fn() }
      vi.mocked(watch).mockReturnValue(mockWatcher as never)
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({ isDestroyed: () => false, webContents: { send: vi.fn() } } as never)

      const ctx = createMockCtx()
      const handlers = setupHandlers(ctx)
      const event = { sender: {} }
      const result = handlers['fs:watch'](event, 'watch-1', '/dir')
      expect(result).toEqual({ success: true })
      expect(ctx.fileWatchers.has('watch-1')).toBe(true)
    })

    it('closes existing watcher before creating new one', () => {
      const oldWatcher = { close: vi.fn(), on: vi.fn() }
      const newWatcher = { on: vi.fn(), close: vi.fn() }
      vi.mocked(watch).mockReturnValue(newWatcher as never)
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null)

      const ctx = createMockCtx()
      ctx.fileWatchers.set('watch-1', oldWatcher as never)

      const handlers = setupHandlers(ctx)
      const event = { sender: {} }
      handlers['fs:watch'](event, 'watch-1', '/dir')
      expect(oldWatcher.close).toHaveBeenCalled()
    })

    it('returns error when watch throws', () => {
      vi.mocked(watch).mockImplementation(() => { throw new Error('watch failed') })
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null)

      const handlers = setupHandlers()
      const event = { sender: {} }
      const result = handlers['fs:watch'](event, 'watch-1', '/bad/dir')
      expect(result).toEqual({ success: false, error: expect.stringContaining('watch failed') })
    })
  })

  describe('fs:unwatch', () => {
    it('closes and removes an existing watcher', () => {
      const mockWatcher = { close: vi.fn() }
      const ctx = createMockCtx()
      ctx.fileWatchers.set('watch-1', mockWatcher as never)

      const handlers = setupHandlers(ctx)
      const result = handlers['fs:unwatch'](null, 'watch-1')
      expect(result).toEqual({ success: true })
      expect(mockWatcher.close).toHaveBeenCalled()
      expect(ctx.fileWatchers.has('watch-1')).toBe(false)
    })

    it('returns success even when no watcher exists', () => {
      const handlers = setupHandlers()
      const result = handlers['fs:unwatch'](null, 'nonexistent')
      expect(result).toEqual({ success: true })
    })
  })
})
