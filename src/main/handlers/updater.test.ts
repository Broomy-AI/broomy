import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockAutoUpdater } = vi.hoisted(() => ({
  mockAutoUpdater: {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    currentVersion: { version: '0.6.1' } as { version: string },
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
  },
}))

vi.mock('electron-updater', () => ({
  default: { autoUpdater: mockAutoUpdater },
  autoUpdater: mockAutoUpdater,
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

import { register } from './updater'
import { E2EScenario, type HandlerContext } from './types'
import type { IpcMain } from 'electron'

function createMockIpcMain() {
  return { handle: vi.fn() }
}

function createMockCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    isDev: false,
    isE2ETest: false,
    e2eScenario: E2EScenario.Default,
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
  } as unknown as HandlerContext
}

function getHandler(mockIpcMain: { handle: ReturnType<typeof vi.fn> }, channel: string) {
  const call = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === channel)
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as (...args: unknown[]) => unknown
}

describe('updater handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAutoUpdater.autoDownload = true
    mockAutoUpdater.autoInstallOnAppQuit = false
    mockAutoUpdater.currentVersion = { version: '0.6.1' }
  })

  describe('in E2E test mode', () => {
    it('registers all three handlers', () => {
      const mockIpcMain = createMockIpcMain()
      register(mockIpcMain as unknown as IpcMain, createMockCtx({ isE2ETest: true }))

      const channels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0])
      expect(channels).toContain('updater:checkForUpdates')
      expect(channels).toContain('updater:downloadUpdate')
      expect(channels).toContain('updater:installUpdate')
    })

    it('checkForUpdates returns no update available', () => {
      const mockIpcMain = createMockIpcMain()
      register(mockIpcMain as unknown as IpcMain, createMockCtx({ isE2ETest: true }))

      const handler = getHandler(mockIpcMain, 'updater:checkForUpdates')
      expect(handler()).toEqual({ updateAvailable: false })
    })

    it('does not configure autoUpdater', () => {
      const mockIpcMain = createMockIpcMain()
      register(mockIpcMain as unknown as IpcMain, createMockCtx({ isE2ETest: true }))

      // autoDownload should remain unchanged (not set to false)
      expect(mockAutoUpdater.autoDownload).toBe(true)
      expect(mockAutoUpdater.on).not.toHaveBeenCalled()
    })
  })

  describe('in dev mode', () => {
    it('returns no update available', () => {
      const mockIpcMain = createMockIpcMain()
      register(mockIpcMain as unknown as IpcMain, createMockCtx({ isDev: true }))

      const handler = getHandler(mockIpcMain, 'updater:checkForUpdates')
      expect(handler()).toEqual({ updateAvailable: false })
    })
  })

  describe('in production mode', () => {
    it('configures autoUpdater correctly', () => {
      const mockIpcMain = createMockIpcMain()
      register(mockIpcMain as unknown as IpcMain, createMockCtx())

      expect(mockAutoUpdater.autoDownload).toBe(false)
      expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true)
    })

    it('registers event listeners for download-progress and update-downloaded', () => {
      const mockIpcMain = createMockIpcMain()
      register(mockIpcMain as unknown as IpcMain, createMockCtx())

      const eventNames = mockAutoUpdater.on.mock.calls.map((c: unknown[]) => c[0])
      expect(eventNames).toContain('download-progress')
      expect(eventNames).toContain('update-downloaded')
    })

    it('registers all three IPC handlers', () => {
      const mockIpcMain = createMockIpcMain()
      register(mockIpcMain as unknown as IpcMain, createMockCtx())

      const channels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0])
      expect(channels).toContain('updater:checkForUpdates')
      expect(channels).toContain('updater:downloadUpdate')
      expect(channels).toContain('updater:installUpdate')
    })

    describe('checkForUpdates handler', () => {
      it('returns updateAvailable: true when a newer version exists', async () => {
        mockAutoUpdater.checkForUpdates.mockResolvedValue({
          updateInfo: {
            version: '1.0.0',
          },
        })

        const mockIpcMain = createMockIpcMain()
        register(mockIpcMain as unknown as IpcMain, createMockCtx())

        const handler = getHandler(mockIpcMain, 'updater:checkForUpdates')
        const result = await handler()
        expect(result).toEqual({
          updateAvailable: true,
          version: '1.0.0',
        })
      })

      it('returns updateAvailable: false when on the latest version', async () => {
        mockAutoUpdater.checkForUpdates.mockResolvedValue({
          updateInfo: {
            version: '0.6.1', // Same as current
          },
        })

        const mockIpcMain = createMockIpcMain()
        register(mockIpcMain as unknown as IpcMain, createMockCtx())

        const handler = getHandler(mockIpcMain, 'updater:checkForUpdates')
        const result = await handler()
        expect(result).toEqual({ updateAvailable: false })
      })

      it('returns updateAvailable: false when checkForUpdates returns null', async () => {
        mockAutoUpdater.checkForUpdates.mockResolvedValue(null)

        const mockIpcMain = createMockIpcMain()
        register(mockIpcMain as unknown as IpcMain, createMockCtx())

        const handler = getHandler(mockIpcMain, 'updater:checkForUpdates')
        const result = await handler()
        expect(result).toEqual({ updateAvailable: false })
      })

      it('returns updateAvailable: false on network error', async () => {
        mockAutoUpdater.checkForUpdates.mockRejectedValue(new Error('Network error'))

        const mockIpcMain = createMockIpcMain()
        register(mockIpcMain as unknown as IpcMain, createMockCtx())

        const handler = getHandler(mockIpcMain, 'updater:checkForUpdates')
        const result = await handler()
        expect(result).toEqual({ updateAvailable: false, checkFailed: true })
      })

    })

    describe('downloadUpdate handler', () => {
      it('calls autoUpdater.downloadUpdate()', async () => {
        mockAutoUpdater.downloadUpdate.mockResolvedValue(undefined)

        const mockIpcMain = createMockIpcMain()
        register(mockIpcMain as unknown as IpcMain, createMockCtx())

        const handler = getHandler(mockIpcMain, 'updater:downloadUpdate')
        await handler()
        expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalledOnce()
      })
    })

    describe('installUpdate handler', () => {
      it('calls autoUpdater.quitAndInstall()', () => {
        const mockIpcMain = createMockIpcMain()
        register(mockIpcMain as unknown as IpcMain, createMockCtx())

        const handler = getHandler(mockIpcMain, 'updater:installUpdate')
        handler()
        expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledOnce()
      })
    })
  })
})
