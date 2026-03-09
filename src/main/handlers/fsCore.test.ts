import { describe, it, expect, vi, beforeEach } from 'vitest'
import { allowConsoleError } from '../../test/console-guard'

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(),
  },
}))

vi.mock('fs', () => ({
  watch: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  access: vi.fn(),
}))

vi.mock('../platform', () => ({
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
}))

import { BrowserWindow } from 'electron'
import { watch } from 'fs'
import { readdir, readFile, writeFile, appendFile, stat, mkdir, rm, access } from 'fs/promises'
import { register } from './fsCore'
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

describe('fsCore handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Default: access resolves (file exists)
    vi.mocked(access).mockResolvedValue(undefined)
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
    it('returns mock file tree in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['fs:readDir'](null, '/some/path')
      expect(result).toEqual([
        { name: 'src', path: expect.any(String), isDirectory: true },
        { name: 'package.json', path: expect.any(String), isDirectory: false },
        { name: 'README.md', path: expect.any(String), isDirectory: false },
      ])
    })

    it('returns screenshot-mode mock data for /src path', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
      const result = await handlers['fs:readDir'](null, '/project/src')
      expect(result.some((e: { name: string }) => e.name === 'components')).toBe(true)
      expect(result.some((e: { name: string }) => e.name === 'app.ts')).toBe(true)
    })

    it('returns screenshot-mode mock data for /middleware path', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
      const result = await handlers['fs:readDir'](null, '/project/src/middleware')
      expect(result.some((e: { name: string }) => e.name === 'auth.ts')).toBe(true)
      expect(result.some((e: { name: string }) => e.name === 'cors.ts')).toBe(true)
    })

    it('returns screenshot-mode mock data for /services path', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
      const result = await handlers['fs:readDir'](null, '/project/src/services')
      expect(result.some((e: { name: string }) => e.name === 'session.ts')).toBe(true)
      expect(result.some((e: { name: string }) => e.name === 'token.ts')).toBe(true)
    })

    it('returns screenshot-mode mock data for /routes path', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
      const result = await handlers['fs:readDir'](null, '/project/src/routes')
      expect(result.some((e: { name: string }) => e.name === 'auth.ts')).toBe(true)
      expect(result.some((e: { name: string }) => e.name === 'health.ts')).toBe(true)
    })

    it('returns screenshot-mode mock data for root path', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
      const result = await handlers['fs:readDir'](null, '/project')
      expect(result.some((e: { name: string }) => e.name === 'src')).toBe(true)
      expect(result.some((e: { name: string }) => e.name === 'package.json')).toBe(true)
      expect(result.some((e: { name: string }) => e.name === 'Dockerfile')).toBe(true)
    })

    it('reads directory entries sorted with dirs first in normal mode', async () => {
      vi.mocked(readdir).mockResolvedValue([
        { name: 'b.ts', isDirectory: () => false },
        { name: 'a-dir', isDirectory: () => true },
        { name: '.git', isDirectory: () => true },
        { name: 'a.ts', isDirectory: () => false },
      ] as never)

      const handlers = setupHandlers()
      const result = await handlers['fs:readDir'](null, '/project')
      // .git should be filtered out
      expect(result).toHaveLength(3)
      // Directories first
      expect(result[0].isDirectory).toBe(true)
      expect(result[0].name).toBe('a-dir')
      // Files sorted alphabetically
      expect(result[1].name).toBe('a.ts')
      expect(result[2].name).toBe('b.ts')
    })

    it('returns empty array on read error', async () => {
      vi.mocked(readdir).mockRejectedValue(new Error('access denied'))
      const handlers = setupHandlers()
      const result = await handlers['fs:readDir'](null, '/bad/path')
      expect(result).toEqual([])
    })
  })

  describe('fs:readFile', () => {
    it('returns mock content in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['fs:readFile'](null, '/some/file.ts')
      expect(result).toContain('Mock file content')
    })

    it('returns screenshot auth.ts content in screenshot mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
      const result = await handlers['fs:readFile'](null, '/project/src/middleware/auth.ts')
      expect(result).toContain('authenticate')
      expect(result).toContain('TokenService')
    })

    it('returns screenshot review.json content in screenshot mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
      const result = await handlers['fs:readFile'](null, '/tmp/broomy-review-abc123/review.json')
      const parsed = JSON.parse(result)
      expect(parsed.version).toBe(1)
      expect(parsed.prNumber).toBe(47)
      expect(parsed.changePatterns).toHaveLength(3)
    })

    it('returns empty comments array for screenshot comments.json', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
      const result = await handlers['fs:readFile'](null, '/tmp/broomy-review-abc123/comments.json')
      expect(result).toBe('[]')
    })

    it('reads file content in normal mode', async () => {
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => false, size: 100 } as never)
      vi.mocked(readFile).mockResolvedValue('file content')

      const handlers = setupHandlers()
      const result = await handlers['fs:readFile'](null, '/some/file.ts')
      expect(result).toBe('file content')
    })

    it('throws when file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      const handlers = setupHandlers()
      await expect(handlers['fs:readFile'](null, '/missing.ts')).rejects.toThrow('File not found')
    })

    it('throws when path is a directory', async () => {
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => true, size: 0 } as never)
      const handlers = setupHandlers()
      await expect(handlers['fs:readFile'](null, '/some/dir')).rejects.toThrow('Cannot read directory as file')
    })

    it('throws when file is too large', async () => {
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => false, size: 6 * 1024 * 1024 } as never)
      const handlers = setupHandlers()
      await expect(handlers['fs:readFile'](null, '/big-file.bin')).rejects.toThrow('too large')
    })
  })

  describe('fs:writeFile', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['fs:writeFile'](null, '/file.ts', 'content')
      expect(result).toEqual({ success: true })
    })

    it('writes file in normal mode', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['fs:writeFile'](null, '/file.ts', 'content')
      expect(result).toEqual({ success: true })
      expect(writeFile).toHaveBeenCalledWith('/file.ts', 'content', 'utf-8')
    })

    it('returns error when write fails', async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error('write error'))
      const handlers = setupHandlers()
      const result = await handlers['fs:writeFile'](null, '/file.ts', 'content')
      expect(result).toEqual({ success: false, error: expect.stringContaining('write error') })
    })
  })

  describe('fs:appendFile', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['fs:appendFile'](null, '/file.ts', 'content')
      expect(result).toEqual({ success: true })
    })

    it('appends to file in normal mode', async () => {
      vi.mocked(appendFile).mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['fs:appendFile'](null, '/file.ts', 'more content')
      expect(result).toEqual({ success: true })
      expect(appendFile).toHaveBeenCalledWith('/file.ts', 'more content', 'utf-8')
    })

    it('returns error when append fails', async () => {
      vi.mocked(appendFile).mockRejectedValue(new Error('append error'))
      const handlers = setupHandlers()
      const result = await handlers['fs:appendFile'](null, '/file.ts', 'content')
      expect(result).toEqual({ success: false, error: expect.stringContaining('append error') })
    })
  })

  describe('fs:exists', () => {
    it('returns true for screenshot-mode review files', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing }))
      const result = await handlers['fs:exists'](null, '/tmp/broomy-review-abc/review.json')
      expect(result).toBe(true)
    })

    it('returns true when file exists', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['fs:exists'](null, '/existing-file.ts')
      expect(result).toBe(true)
    })

    it('returns false when file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      const handlers = setupHandlers()
      const result = await handlers['fs:exists'](null, '/missing-file.ts')
      expect(result).toBe(false)
    })
  })

  describe('fs:mkdir', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['fs:mkdir'](null, '/new/dir')
      expect(result).toEqual({ success: true })
    })

    it('creates directory in normal mode', async () => {
      // access rejects = directory does not exist
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(mkdir).mockResolvedValue(undefined)

      const handlers = setupHandlers()
      const result = await handlers['fs:mkdir'](null, '/new/dir')
      expect(result).toEqual({ success: true })
      expect(mkdir).toHaveBeenCalledWith('/new/dir', { recursive: true })
    })

    it('returns error when directory already exists', async () => {
      // access resolves = directory exists
      vi.mocked(access).mockResolvedValue(undefined)

      const handlers = setupHandlers()
      const result = await handlers['fs:mkdir'](null, '/existing/dir')
      expect(result).toEqual({ success: false, error: 'Directory already exists' })
    })

    it('returns error when mkdir throws', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(mkdir).mockRejectedValue(new Error('mkdir error'))

      const handlers = setupHandlers()
      const result = await handlers['fs:mkdir'](null, '/bad/dir')
      expect(result).toEqual({ success: false, error: expect.stringContaining('mkdir error') })
    })
  })

  describe('fs:rm', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['fs:rm'](null, '/some/path')
      expect(result).toEqual({ success: true })
    })

    it('removes target in normal mode', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(rm).mockResolvedValue(undefined)

      const handlers = setupHandlers()
      const result = await handlers['fs:rm'](null, '/some/file.ts')
      expect(result).toEqual({ success: true })
      expect(rm).toHaveBeenCalledWith('/some/file.ts', { recursive: true, force: true })
    })

    it('returns success when target does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const handlers = setupHandlers()
      const result = await handlers['fs:rm'](null, '/missing/file.ts')
      expect(result).toEqual({ success: true })
    })

    it('returns error when rm fails', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(rm).mockRejectedValue(new Error('rm error'))

      const handlers = setupHandlers()
      const result = await handlers['fs:rm'](null, '/locked/file.ts')
      expect(result).toEqual({ success: false, error: expect.stringContaining('rm error') })
    })
  })

  describe('fs:createFile', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['fs:createFile'](null, '/new-file.ts')
      expect(result).toEqual({ success: true })
    })

    it('creates empty file in normal mode', async () => {
      // access rejects = file does not exist
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const handlers = setupHandlers()
      const result = await handlers['fs:createFile'](null, '/new-file.ts')
      expect(result).toEqual({ success: true })
      expect(writeFile).toHaveBeenCalledWith('/new-file.ts', '')
    })

    it('returns error when file already exists', async () => {
      vi.mocked(access).mockResolvedValue(undefined)

      const handlers = setupHandlers()
      const result = await handlers['fs:createFile'](null, '/existing.ts')
      expect(result).toEqual({ success: false, error: 'File already exists' })
    })

    it('returns error when createFile throws', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(writeFile).mockRejectedValue(new Error('create error'))

      const handlers = setupHandlers()
      const result = await handlers['fs:createFile'](null, '/bad/file.ts')
      expect(result).toEqual({ success: false, error: expect.stringContaining('create error') })
    })
  })

  describe('fs:readFileBase64', () => {
    it('returns mock base64 in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['fs:readFileBase64'](null, '/image.png')
      expect(result).toContain('iVBOR')
    })

    it('reads file as base64 in normal mode', async () => {
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => false, size: 100 } as never)
      const buf = Buffer.from('hello')
      vi.mocked(readFile).mockResolvedValue(buf as never)

      const handlers = setupHandlers()
      const result = await handlers['fs:readFileBase64'](null, '/file.png')
      expect(result).toBe(buf.toString('base64'))
    })

    it('throws when file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      const handlers = setupHandlers()
      await expect(handlers['fs:readFileBase64'](null, '/missing.png')).rejects.toThrow('File not found')
    })

    it('throws when path is a directory', async () => {
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => true, size: 0 } as never)
      const handlers = setupHandlers()
      await expect(handlers['fs:readFileBase64'](null, '/some/dir')).rejects.toThrow('Cannot read directory as file')
    })

    it('throws when file is too large', async () => {
      vi.mocked(stat).mockResolvedValue({ isDirectory: () => false, size: 11 * 1024 * 1024 } as never)
      const handlers = setupHandlers()
      await expect(handlers['fs:readFileBase64'](null, '/huge.bin')).rejects.toThrow('too large')
    })
  })

  describe('fs:watch', () => {
    beforeEach(() => {
      vi.mocked(access).mockResolvedValue(undefined)
    })

    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const event = { sender: {} }
      const result = await handlers['fs:watch'](event, 'watch-1', '/dir')
      expect(result).toEqual({ success: true })
    })

    it('sets up a file watcher in normal mode', async () => {
      const mockWatcher = { on: vi.fn(), close: vi.fn() }
      vi.mocked(watch).mockReturnValue(mockWatcher as never)
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({ isDestroyed: () => false, webContents: { send: vi.fn() } } as never)

      const ctx = createMockCtx()
      const handlers = setupHandlers(ctx)
      const event = { sender: {} }
      const result = await handlers['fs:watch'](event, 'watch-1', '/dir')
      expect(result).toEqual({ success: true })
      expect(ctx.fileWatchers.has('watch-1')).toBe(true)
    })

    it('returns error when directory does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null)

      const handlers = setupHandlers()
      const event = { sender: {} }
      const result = await handlers['fs:watch'](event, 'watch-1', '/nonexistent')
      expect(result).toEqual({ success: false, error: 'Path does not exist' })
    })

    it('closes existing watcher before creating new one', async () => {
      const oldWatcher = { close: vi.fn(), on: vi.fn() }
      const newWatcher = { on: vi.fn(), close: vi.fn() }
      vi.mocked(watch).mockReturnValue(newWatcher as never)
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null)

      const ctx = createMockCtx()
      ctx.fileWatchers.set('watch-1', oldWatcher as never)

      const handlers = setupHandlers(ctx)
      const event = { sender: {} }
      await handlers['fs:watch'](event, 'watch-1', '/dir')
      expect(oldWatcher.close).toHaveBeenCalled()
    })

    it('sends fs:change events through watcher callback', async () => {
      let watchCallback: (eventType: string, filename: string | null) => void = () => {}
      const mockWatcher = { on: vi.fn(), close: vi.fn() }
      vi.mocked(watch).mockImplementation(((_path: string, cb: unknown) => {
        watchCallback = cb as (eventType: string, filename: string | null) => void
        return mockWatcher as never
      }) as unknown as typeof watch)
      const mockSend = vi.fn()
      const mockWindow = { isDestroyed: () => false, webContents: { send: mockSend } }
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(mockWindow as never)

      const ctx = createMockCtx()
      const handlers = setupHandlers(ctx)
      const event = { sender: {} }
      await handlers['fs:watch'](event, 'watch-1', '/dir')

      // Normal file change should send event
      watchCallback('change', 'src/file.ts')
      expect(mockSend).toHaveBeenCalledWith('fs:change:watch-1', { eventType: 'change', filename: 'src/file.ts' })
    })

    it('uses mainWindow when owner window is not available', async () => {
      let watchCallback: (eventType: string, filename: string | null) => void = () => {}
      const mockWatcher = { on: vi.fn(), close: vi.fn() }
      vi.mocked(watch).mockImplementation(((_path: string, cb: unknown) => {
        watchCallback = cb as (eventType: string, filename: string | null) => void
        return mockWatcher as never
      }) as unknown as typeof watch)
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null)

      const mockSend = vi.fn()
      const mainWindow = { isDestroyed: () => false, webContents: { send: mockSend } }
      const ctx = createMockCtx({ mainWindow: mainWindow as never })
      const handlers = setupHandlers(ctx)
      const event = { sender: {} }
      await handlers['fs:watch'](event, 'watch-1', '/dir')

      watchCallback('change', 'file.ts')
      expect(mockSend).toHaveBeenCalledWith('fs:change:watch-1', { eventType: 'change', filename: 'file.ts' })
    })

    it('handles watcher error by removing from map', async () => {
      allowConsoleError()
      const mockWatcher = { on: vi.fn(), close: vi.fn() }
      vi.mocked(watch).mockReturnValue(mockWatcher as never)
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null)

      const ctx = createMockCtx()
      const handlers = setupHandlers(ctx)
      const event = { sender: {} }
      await handlers['fs:watch'](event, 'watch-1', '/dir')
      expect(ctx.fileWatchers.has('watch-1')).toBe(true)

      // Trigger the error handler
      const errorHandler = mockWatcher.on.mock.calls.find((c: unknown[]) => c[0] === 'error')?.[1] as ((err: Error) => void) | undefined
      errorHandler?.(new Error('watcher error'))
      expect(ctx.fileWatchers.has('watch-1')).toBe(false)
    })

    it('returns error when watch throws', async () => {
      allowConsoleError()
      vi.mocked(watch).mockImplementation(() => { throw new Error('watch failed') })
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null)

      const handlers = setupHandlers()
      const event = { sender: {} }
      const result = await handlers['fs:watch'](event, 'watch-1', '/bad/dir')
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
