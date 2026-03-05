import { describe, it, expect, vi, beforeEach } from 'vitest'
import { E2EScenario, type HandlerContext } from './types'

// Mock devcontainer functions
const mockIsCliAvailable = vi.fn()
const mockHasConfig = vi.fn()
const mockWriteConfig = vi.fn()
const mockGetContainerInfo = vi.fn()
const mockResetContainer = vi.fn()
vi.mock('../devcontainer', () => ({
  isDevcontainerCliAvailable: (...args: unknown[]) => mockIsCliAvailable(...args),
  hasDevcontainerConfig: (...args: unknown[]) => mockHasConfig(...args),
  writeDefaultDevcontainerConfig: (...args: unknown[]) => mockWriteConfig(...args),
  getContainerInfo: (...args: unknown[]) => mockGetContainerInfo(...args),
  resetContainer: (...args: unknown[]) => mockResetContainer(...args),
}))

function createCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    isE2ETest: false,
    e2eScenario: E2EScenario.Default,
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
  } as HandlerContext
}

describe('devcontainer handlers', () => {
  let handlers: Record<string, Function>
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers[channel] = handler
    }),
  }
  const mockEvent = { sender: { id: 1 } }

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = {}
  })

  describe('devcontainer:status', () => {
    it('returns mock data in E2E mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx({ isE2ETest: true }))

      const result = await handlers['devcontainer:status'](mockEvent)
      expect(result).toEqual({ available: true, version: '0.71.0' })
    })

    it('calls isDevcontainerCliAvailable in normal mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx())

      mockIsCliAvailable.mockResolvedValue({ available: true, version: '0.72.0' })
      const result = await handlers['devcontainer:status'](mockEvent)
      expect(result).toEqual({ available: true, version: '0.72.0' })
    })
  })

  describe('devcontainer:hasConfig', () => {
    it('returns false in E2E mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx({ isE2ETest: true }))

      const result = await handlers['devcontainer:hasConfig'](mockEvent, '/workspace')
      expect(result).toBe(false)
    })

    it('delegates to hasDevcontainerConfig in normal mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx())

      mockHasConfig.mockReturnValue(true)
      const result = await handlers['devcontainer:hasConfig'](mockEvent, '/workspace')
      expect(result).toBe(true)
      expect(mockHasConfig).toHaveBeenCalledWith('/workspace')
    })
  })

  describe('devcontainer:generateDefaultConfig', () => {
    it('does nothing in E2E mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx({ isE2ETest: true }))

      await handlers['devcontainer:generateDefaultConfig'](mockEvent, '/workspace')
      expect(mockWriteConfig).not.toHaveBeenCalled()
    })

    it('calls writeDefaultDevcontainerConfig in normal mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx())

      await handlers['devcontainer:generateDefaultConfig'](mockEvent, '/workspace')
      expect(mockWriteConfig).toHaveBeenCalledWith('/workspace')
    })
  })

  describe('devcontainer:containerInfo', () => {
    it('returns container info when container exists and is running', async () => {
      const { register } = await import('./devcontainer')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const containerInfo = {
        containerId: 'abc123def456',
        status: 'running' as const,
        image: 'mcr.microsoft.com/devcontainers/base:ubuntu',
        repoDir: '/workspace/myrepo',
      }
      mockGetContainerInfo.mockResolvedValue(containerInfo)

      const result = await handlers['devcontainer:containerInfo'](mockEvent, '/workspace/myrepo')
      expect(result).toEqual(containerInfo)
      expect(mockGetContainerInfo).toHaveBeenCalledWith(ctx, '/workspace/myrepo')
    })

    it('returns null when no container exists', async () => {
      const { register } = await import('./devcontainer')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockGetContainerInfo.mockResolvedValue(null)

      const result = await handlers['devcontainer:containerInfo'](mockEvent, '/workspace/myrepo')
      expect(result).toBeNull()
      expect(mockGetContainerInfo).toHaveBeenCalledWith(ctx, '/workspace/myrepo')
    })

    it('returns null in E2E mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx({ isE2ETest: true }))

      const result = await handlers['devcontainer:containerInfo'](mockEvent, '/workspace/myrepo')
      expect(result).toBeNull()
      expect(mockGetContainerInfo).not.toHaveBeenCalled()
    })
  })

  describe('devcontainer:resetContainer', () => {
    it('removes container from map and calls docker rm', async () => {
      const { register } = await import('./devcontainer')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockResetContainer.mockResolvedValue(undefined)

      await handlers['devcontainer:resetContainer'](mockEvent, '/workspace/myrepo')
      expect(mockResetContainer).toHaveBeenCalledWith(ctx, '/workspace/myrepo')
    })

    it('handles missing container gracefully', async () => {
      const { register } = await import('./devcontainer')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      // resetContainer resolves even if no container entry exists
      mockResetContainer.mockResolvedValue(undefined)

      await expect(
        handlers['devcontainer:resetContainer'](mockEvent, '/workspace/nonexistent')
      ).resolves.toBeUndefined()
      expect(mockResetContainer).toHaveBeenCalledWith(ctx, '/workspace/nonexistent')
    })

    it('does nothing in E2E mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx({ isE2ETest: true }))

      await handlers['devcontainer:resetContainer'](mockEvent, '/workspace/myrepo')
      expect(mockResetContainer).not.toHaveBeenCalled()
    })
  })
})
