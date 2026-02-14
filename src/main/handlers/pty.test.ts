import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HandlerContext } from './types'

// Mock node-pty
const mockPtyWrite = vi.fn()
const mockPtyResize = vi.fn()
const mockPtyKill = vi.fn()
const mockPtyOnData = vi.fn()
const mockPtyOnExit = vi.fn()
const mockPtySpawn = vi.fn()

vi.mock('node-pty', () => ({
  spawn: (...args: unknown[]) => mockPtySpawn(...args),
}))

// Mock electron
const mockBrowserWindowFromWebContents = vi.fn()
vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: (...args: unknown[]) => mockBrowserWindowFromWebContents(...args),
  },
  IpcMain: {},
}))

// Mock platform
vi.mock('../platform', () => ({
  isWindows: false,
  getDefaultShell: () => '/bin/zsh',
}))

function createMockPtyProcess() {
  return {
    write: mockPtyWrite,
    resize: mockPtyResize,
    kill: mockPtyKill,
    onData: mockPtyOnData,
    onExit: mockPtyOnExit,
  }
}

function createCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
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
  } as HandlerContext
}

describe('pty handlers', () => {
  let handlers: Record<string, Function>
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers[channel] = handler
    }),
  }

  const mockSenderWindow = {
    id: 1,
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      send: vi.fn(),
    },
  }

  const mockEvent = {
    sender: { id: 1 },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = {}
    mockPtyOnData.mockReturnValue({ dispose: vi.fn() })
    mockPtyOnExit.mockReturnValue({ dispose: vi.fn() })
  })

  describe('pty:create', () => {
    it('uses fake-claude script in E2E mode when command is provided', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx({ isE2ETest: true })
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      const result = await handlers['pty:create'](mockEvent, {
        id: 'test-1',
        cwd: '/tmp',
        command: 'claude',
      })

      expect(result).toEqual({ id: 'test-1' })
      expect(mockPtySpawn).toHaveBeenCalledWith(
        '/bin/bash',
        [],
        expect.objectContaining({ cwd: '/tmp' }),
      )
      expect(ctx.ptyProcesses.has('test-1')).toBe(true)
    })

    it('echoes E2E_TEST_SHELL_READY in E2E mode without command', async () => {
      vi.useFakeTimers()
      const { register } = await import('./pty')
      const ctx = createCtx({ isE2ETest: true })
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'test-2',
        cwd: '/tmp',
      })

      // The initial command (echo "E2E_TEST_SHELL_READY"...) is written after 100ms timeout
      vi.advanceTimersByTime(100)
      expect(mockPtyWrite).toHaveBeenCalledWith(
        expect.stringContaining('E2E_TEST_SHELL_READY'),
      )
      vi.useRealTimers()
    })

    it('uses screenshot fake-claude for session 1 in screenshot mode', async () => {
      vi.useFakeTimers()
      const { register } = await import('./pty')
      const ctx = createCtx({ isE2ETest: true, isScreenshotMode: true })
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'test-ss',
        cwd: '/tmp',
        command: 'claude',
        sessionId: '1',
      })

      vi.advanceTimersByTime(100)
      expect(mockPtyWrite).toHaveBeenCalledWith(
        expect.stringContaining('fake-claude-screenshot.sh'),
      )
      vi.useRealTimers()
    })

    it('uses screenshot-idle for non-session-1 in screenshot mode', async () => {
      vi.useFakeTimers()
      const { register } = await import('./pty')
      const ctx = createCtx({ isE2ETest: true, isScreenshotMode: true })
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'test-ss-idle',
        cwd: '/tmp',
        command: 'claude',
        sessionId: '2',
      })

      vi.advanceTimersByTime(100)
      expect(mockPtyWrite).toHaveBeenCalledWith(
        expect.stringContaining('fake-claude-screenshot-idle.sh'),
      )
      vi.useRealTimers()
    })

    it('uses custom FAKE_CLAUDE_SCRIPT when provided in E2E mode', async () => {
      vi.useFakeTimers()
      const { register } = await import('./pty')
      const ctx = createCtx({ isE2ETest: true, FAKE_CLAUDE_SCRIPT: '/custom/fake.sh' })
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'test-custom',
        cwd: '/tmp',
        command: 'claude',
      })

      vi.advanceTimersByTime(100)
      expect(mockPtyWrite).toHaveBeenCalledWith(
        expect.stringContaining('/custom/fake.sh'),
      )
      vi.useRealTimers()
    })

    it('spawns default shell in normal mode without command', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      const result = await handlers['pty:create'](mockEvent, {
        id: 'normal-1',
        cwd: '/home/user',
      })

      expect(result).toEqual({ id: 'normal-1' })
      expect(mockPtySpawn).toHaveBeenCalledWith(
        '/bin/zsh',
        [],
        expect.objectContaining({ cwd: '/home/user', name: 'xterm-256color' }),
      )
    })

    it('passes command as shell args in normal mode on Unix', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'cmd-1',
        cwd: '/tmp',
        command: 'claude',
      })

      // On Unix, command is passed as shell args: ['-l', '-i', '-c', command]
      expect(mockPtySpawn).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-l', '-i', '-c', 'claude'],
        expect.any(Object),
      )
    })

    it('uses E2E_MOCK_SHELL when provided', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx({ E2E_MOCK_SHELL: '/path/to/mock-shell.sh' })
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'mock-shell-1',
        cwd: '/tmp',
      })

      expect(mockPtySpawn).toHaveBeenCalledWith(
        '/bin/bash',
        ['/path/to/mock-shell.sh'],
        expect.any(Object),
      )
    })

    it('stores pty process and owner window in context', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'stored-1',
        cwd: '/tmp',
      })

      expect(ctx.ptyProcesses.get('stored-1')).toBe(mockProcess)
      expect(ctx.ptyOwnerWindows.get('stored-1')).toBe(mockSenderWindow)
    })

    it('forwards data events to owner window', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'data-1',
        cwd: '/tmp',
      })

      // Capture the onData callback and invoke it
      const onDataCallback = mockPtyOnData.mock.calls[0][0]
      onDataCallback('hello world')
      expect(mockSenderWindow.webContents.send).toHaveBeenCalledWith('pty:data:data-1', 'hello world')
    })

    it('cleans up on exit event', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'exit-1',
        cwd: '/tmp',
      })

      expect(ctx.ptyProcesses.has('exit-1')).toBe(true)

      // Capture the onExit callback and invoke it
      const onExitCallback = mockPtyOnExit.mock.calls[0][0]
      onExitCallback({ exitCode: 0 })

      expect(mockSenderWindow.webContents.send).toHaveBeenCalledWith('pty:exit:exit-1', 0)
      expect(ctx.ptyProcesses.has('exit-1')).toBe(false)
      expect(ctx.ptyOwnerWindows.has('exit-1')).toBe(false)
    })

    it('does not send data if owner window is destroyed', async () => {
      const { register } = await import('./pty')
      const destroyedWindow = {
        ...mockSenderWindow,
        isDestroyed: vi.fn().mockReturnValue(true),
        webContents: { send: vi.fn() },
      }
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(destroyedWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'destroyed-1',
        cwd: '/tmp',
      })

      const onDataCallback = mockPtyOnData.mock.calls[0][0]
      onDataCallback('data')
      expect(destroyedWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('removes CLAUDE_CONFIG_DIR from base env', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const originalEnv = process.env.CLAUDE_CONFIG_DIR
      process.env.CLAUDE_CONFIG_DIR = '/custom/config'

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'env-1',
        cwd: '/tmp',
      })

      const spawnEnv = mockPtySpawn.mock.calls[0][2].env
      expect(spawnEnv.CLAUDE_CONFIG_DIR).toBeUndefined()

      // Restore
      if (originalEnv !== undefined) {
        process.env.CLAUDE_CONFIG_DIR = originalEnv
      } else {
        delete process.env.CLAUDE_CONFIG_DIR
      }
    })

    it('expands ~ in agent env values', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'env-expand-1',
        cwd: '/tmp',
        env: { MY_DIR: '~/my-dir', PLAIN: '/absolute/path' },
      })

      const spawnEnv = mockPtySpawn.mock.calls[0][2].env
      expect(spawnEnv.MY_DIR).toContain('my-dir')
      expect(spawnEnv.MY_DIR).not.toContain('~')
      expect(spawnEnv.PLAIN).toBe('/absolute/path')
    })

    it('skips default CLAUDE_CONFIG_DIR in agent env', async () => {
      const { register } = await import('./pty')
      const { homedir } = await import('os')
      const { join } = await import('path')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'env-skip-default',
        cwd: '/tmp',
        env: { CLAUDE_CONFIG_DIR: '~/.claude' },
      })

      const spawnEnv = mockPtySpawn.mock.calls[0][2].env
      // ~/.claude is the default, so it should NOT be set explicitly
      expect(spawnEnv.CLAUDE_CONFIG_DIR).not.toBe(join(homedir(), '.claude'))
    })

    it('sets non-default CLAUDE_CONFIG_DIR in agent env', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'env-custom-config',
        cwd: '/tmp',
        env: { CLAUDE_CONFIG_DIR: '~/.claude-custom' },
      })

      const spawnEnv = mockPtySpawn.mock.calls[0][2].env
      expect(spawnEnv.CLAUDE_CONFIG_DIR).toContain('.claude-custom')
    })

    it('does not set owner window when sender window not found', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(null)

      await handlers['pty:create'](mockEvent, {
        id: 'no-sender',
        cwd: '/tmp',
      })

      expect(ctx.ptyProcesses.has('no-sender')).toBe(true)
      expect(ctx.ptyOwnerWindows.has('no-sender')).toBe(false)
    })
  })

  describe('pty:write', () => {
    it('writes data to the pty process', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      ctx.ptyProcesses.set('write-1', mockProcess as never)

      await handlers['pty:write'](mockEvent, 'write-1', 'hello')
      expect(mockPtyWrite).toHaveBeenCalledWith('hello')
    })

    it('does nothing if pty process not found', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      // Should not throw
      await handlers['pty:write'](mockEvent, 'nonexistent', 'data')
      expect(mockPtyWrite).not.toHaveBeenCalled()
    })
  })

  describe('pty:resize', () => {
    it('resizes the pty process', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      ctx.ptyProcesses.set('resize-1', mockProcess as never)

      await handlers['pty:resize'](mockEvent, 'resize-1', 120, 40)
      expect(mockPtyResize).toHaveBeenCalledWith(120, 40)
    })

    it('does nothing if pty process not found', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      await handlers['pty:resize'](mockEvent, 'nonexistent', 80, 30)
      expect(mockPtyResize).not.toHaveBeenCalled()
    })
  })

  describe('pty:kill', () => {
    it('kills the pty process and removes from context', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      ctx.ptyProcesses.set('kill-1', mockProcess as never)

      await handlers['pty:kill'](mockEvent, 'kill-1')
      expect(mockPtyKill).toHaveBeenCalled()
      expect(ctx.ptyProcesses.has('kill-1')).toBe(false)
    })

    it('does nothing if pty process not found', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      await handlers['pty:kill'](mockEvent, 'nonexistent')
      expect(mockPtyKill).not.toHaveBeenCalled()
    })
  })
})
