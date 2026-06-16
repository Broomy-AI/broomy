import { describe, it, expect, vi, beforeEach } from 'vitest'
import { E2EScenario, type HandlerContext } from './types'

// Mock node-pty
const mockPtyWrite = vi.fn()
const mockPtyResize = vi.fn()
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

// Mock containerUtils
const mockIsDockerAvailable = vi.fn()
const mockEnsureAgentInstalled = vi.fn()
vi.mock('../containerUtils', () => ({
  acquireSetupLock: async () => () => {},
  isSetupLockHeld: () => false,
  isDockerAvailable: (...args: unknown[]) => mockIsDockerAvailable(...args),
  dockerSetupMessage: () => 'Docker not available',
  ensureAgentInstalled: (...args: unknown[]) => mockEnsureAgentInstalled(...args),
}))

// Mock devcontainer
const mockHasDevcontainerConfig = vi.fn()
const mockIsDevcontainerCliAvailable = vi.fn()
const mockDevcontainerUp = vi.fn()
const mockBuildDevcontainerExecArgs = vi.fn()
vi.mock('../devcontainer', () => ({
  hasDevcontainerConfig: (...args: unknown[]) => mockHasDevcontainerConfig(...args),
  isDevcontainerCliAvailable: (...args: unknown[]) => mockIsDevcontainerCliAvailable(...args),
  devcontainerUp: (...args: unknown[]) => mockDevcontainerUp(...args),
  buildDevcontainerExecArgs: (...args: unknown[]) => mockBuildDevcontainerExecArgs(...args),
  devcontainerSetupMessage: () => 'Devcontainer CLI not available',
}))

// Mock platform
vi.mock('../platform', () => ({
  isWindows: false,
  getDefaultShell: () => '/bin/zsh',
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
  resolveCommand: () => null,
  enhancedPath: (p: string) => p || '',
}))

// Mock treeKill — every PTY teardown path goes through it now
const mockTreeKill = vi.fn(async (_pid: number, _graceMs?: number, _extra?: Iterable<{ pid: number; startTime: string }>) => {})
vi.mock('../treeKill', () => ({
  treeKill: (pid: number, graceMs?: number, extra?: Iterable<{ pid: number; startTime: string }>) => mockTreeKill(pid, graceMs, extra),
  parsePsSnapshot: vi.fn(() => [] as { pid: number; ppid: number; pgid: number }[]),
  collectDescendants: vi.fn(() => new Set<number>()),
}))

// Mock child_process so killOrphans's execFileSync doesn't actually run ps
vi.mock('child_process', () => ({
  execFileSync: vi.fn(() => ''),
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: () => void) => { cb() }),
}))

// Mock marker file I/O so tests don't touch ~/.broomy/pids
vi.mock('../ptyMarkers', () => ({
  recordPtyMarker: vi.fn(),
  removePtyMarker: vi.fn(),
}))

// Mock the descendants tracker — pty.ts calls trackPty/untrackPty/etc.
vi.mock('../descendantsTracker', () => ({
  trackPty: vi.fn(),
  untrackPty: vi.fn(),
  getHistoricalDescendants: vi.fn(() => [] as { pid: number; startTime: string }[]),
  getAllStats: vi.fn(() => ({})),
}))

let nextMockPid = 1000
function createMockPtyProcess() {
  return {
    pid: ++nextMockPid,
    write: mockPtyWrite,
    resize: mockPtyResize,
    onData: mockPtyOnData,
    onExit: mockPtyOnExit,
  }
}

function createCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
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
      const ctx = createCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing })
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
      const ctx = createCtx({ isE2ETest: true, e2eScenario: E2EScenario.Marketing })
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

    it('cleans up on exit event and disposes listeners', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const dataDispose = vi.fn()
      const exitDispose = vi.fn()
      mockPtyOnData.mockReturnValue({ dispose: dataDispose })
      mockPtyOnExit.mockReturnValue({ dispose: exitDispose })

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
      // Disposables should be cleaned up on exit too
      expect(dataDispose).toHaveBeenCalled()
      expect(exitDispose).toHaveBeenCalled()
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

    it('defaults CLAUDE_CODE_NO_FLICKER=1 to opt Claude into alt-screen', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'env-no-flicker-default',
        cwd: '/tmp',
      })

      const spawnEnv = mockPtySpawn.mock.calls[0][2].env
      expect(spawnEnv.CLAUDE_CODE_NO_FLICKER).toBe('1')
    })

    it('lets per-session env override CLAUDE_CODE_NO_FLICKER', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'env-no-flicker-override',
        cwd: '/tmp',
        env: { CLAUDE_CODE_NO_FLICKER: '0' },
      })

      const spawnEnv = mockPtySpawn.mock.calls[0][2].env
      expect(spawnEnv.CLAUDE_CODE_NO_FLICKER).toBe('0')
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
    it('kills existing PTY with the same ID before creating a new one', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      // Pre-populate an existing PTY in the context
      const existingProcess = createMockPtyProcess()
      ctx.ptyProcesses.set('dup-id', existingProcess as never)
      ctx.ptyOwnerWindows.set('dup-id', mockSenderWindow as never)

      const newProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(newProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'dup-id',
        cwd: '/tmp',
      })

      expect(mockTreeKill).toHaveBeenCalledWith(existingProcess.pid, undefined, expect.anything())
      expect(ctx.ptyProcesses.get('dup-id')).toBe(newProcess)
    })
  })

  describe('pty:create with devcontainer isolation', () => {
    it('falls through when no devcontainer config exists', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)
      mockHasDevcontainerConfig.mockReturnValue(false)

      const result = await handlers['pty:create'](mockEvent, {
        id: 'dc-fallthrough',
        cwd: '/repo',
        isolated: true,
        sessionId: 'sess-ft',
      })

      // Returns id (falls through to standard PTY)
      expect(result).toEqual({ id: 'dc-fallthrough' })
      // Should notify renderer about missing config
      expect(mockSenderWindow.webContents.send).toHaveBeenCalledWith(
        'pty:devcontainer-missing',
        { sessionId: 'sess-ft' },
      )
    })

    it('returns id immediately when devcontainer config exists', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)
      mockHasDevcontainerConfig.mockReturnValue(true)
      mockIsDevcontainerCliAvailable.mockResolvedValue({ available: true })
      mockIsDockerAvailable.mockResolvedValue({ available: true })
      mockDevcontainerUp.mockResolvedValue({
        success: true,
        result: { containerId: 'dc-123', remoteUser: 'node' },
      })
      mockBuildDevcontainerExecArgs.mockReturnValue(['exec', '-it', 'dc-123', 'bash', '-l'])
      mockEnsureAgentInstalled.mockResolvedValue({ success: true })

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)

      const result = await handlers['pty:create'](mockEvent, {
        id: 'dc-sync',
        cwd: '/repo',
        isolated: true,
        sessionId: 'sess-dc',
      })

      expect(result).toEqual({ id: 'dc-sync' })
    })

    it('displays error when devcontainer CLI is not available', async () => {
      vi.useFakeTimers()
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)
      mockHasDevcontainerConfig.mockReturnValue(true)
      mockIsDevcontainerCliAvailable.mockResolvedValue({ available: false, error: 'Not found' })

      await handlers['pty:create'](mockEvent, {
        id: 'dc-no-cli',
        cwd: '/repo',
        isolated: true,
        sessionId: 'sess-no-cli',
      })

      await vi.advanceTimersByTimeAsync(300)

      expect(mockSenderWindow.webContents.send).toHaveBeenCalledWith(
        'pty:data:dc-no-cli',
        expect.stringContaining('Devcontainer CLI not available'),
      )
      vi.useRealTimers()
    })

    it('displays error when Docker is not available', async () => {
      vi.useFakeTimers()
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)
      mockHasDevcontainerConfig.mockReturnValue(true)
      mockIsDevcontainerCliAvailable.mockResolvedValue({ available: true })
      mockIsDockerAvailable.mockResolvedValue({ available: false, error: 'Docker not running' })

      await handlers['pty:create'](mockEvent, {
        id: 'dc-no-docker',
        cwd: '/repo',
        isolated: true,
        sessionId: 'sess-no-docker',
      })

      await vi.advanceTimersByTimeAsync(300)

      expect(mockSenderWindow.webContents.send).toHaveBeenCalledWith(
        'pty:data:dc-no-docker',
        expect.stringContaining('Docker not available'),
      )
      vi.useRealTimers()
    })

    it('displays error when devcontainer up fails', async () => {
      vi.useFakeTimers()
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)
      mockHasDevcontainerConfig.mockReturnValue(true)
      mockIsDevcontainerCliAvailable.mockResolvedValue({ available: true })
      mockIsDockerAvailable.mockResolvedValue({ available: true })
      mockDevcontainerUp.mockResolvedValue({ success: false, error: 'Build failed' })

      await handlers['pty:create'](mockEvent, {
        id: 'dc-fail',
        cwd: '/repo',
        isolated: true,
        sessionId: 'sess-fail',
      })

      await vi.advanceTimersByTimeAsync(300)

      expect(mockSenderWindow.webContents.send).toHaveBeenCalledWith(
        'pty:data:dc-fail',
        expect.stringContaining('Build failed'),
      )
      vi.useRealTimers()
    })

    it('starts docker exec PTY after successful devcontainer setup', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)
      mockHasDevcontainerConfig.mockReturnValue(true)
      mockIsDevcontainerCliAvailable.mockResolvedValue({ available: true })
      mockIsDockerAvailable.mockResolvedValue({ available: true })
      mockDevcontainerUp.mockResolvedValue({
        success: true,
        result: { containerId: 'dc-123', remoteUser: 'node', remoteWorkspaceFolder: '/workspaces/repo' },
      })
      mockBuildDevcontainerExecArgs.mockReturnValue(['exec', '-it', '-u', 'node', 'dc-123', 'bash', '-l'])
      mockEnsureAgentInstalled.mockResolvedValue({ success: true })

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)

      await handlers['pty:create'](mockEvent, {
        id: 'dc-pty',
        cwd: '/repo',
        isolated: true,
        sessionId: 'sess-pty',
        command: 'claude',
      })

      await vi.waitFor(() => {
        expect(mockBuildDevcontainerExecArgs).toHaveBeenCalledWith(
          'dc-123', 'node', '/workspaces/repo', expect.any(Object), 'claude',
        )
        expect(mockPtySpawn).toHaveBeenCalledWith(
          'docker',
          ['exec', '-it', '-u', 'node', 'dc-123', 'bash', '-l'],
          expect.any(Object),
        )
      })
    })

    it('emits devcontainer-ready when postAttachCommand is present', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)
      mockHasDevcontainerConfig.mockReturnValue(true)
      mockIsDevcontainerCliAvailable.mockResolvedValue({ available: true })
      mockIsDockerAvailable.mockResolvedValue({ available: true })
      mockDevcontainerUp.mockResolvedValue({
        success: true,
        result: { containerId: 'dc-svc', remoteUser: 'node', remoteWorkspaceFolder: '/workspaces/repo', postAttachCommand: 'npm start' },
      })
      mockBuildDevcontainerExecArgs.mockReturnValue(['exec', '-it', 'dc-svc', 'bash', '-l'])

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)

      await handlers['pty:create'](mockEvent, {
        id: 'dc-svc',
        cwd: '/repo',
        isolated: true,
        sessionId: 'sess-svc',
      })

      await vi.waitFor(() => {
        expect(mockSenderWindow.webContents.send).toHaveBeenCalledWith(
          'pty:devcontainer-ready',
          expect.objectContaining({
            sessionId: 'sess-svc',
            postAttachCommand: 'npm start',
            containerId: 'dc-svc',
            remoteUser: 'node',
          }),
        )
      })
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
    it('tree-kills the pty process and removes from context', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockProcess = createMockPtyProcess()
      ctx.ptyProcesses.set('kill-1', mockProcess as never)

      await handlers['pty:kill'](mockEvent, 'kill-1')
      expect(mockTreeKill).toHaveBeenCalledWith(mockProcess.pid, undefined, expect.anything())
      expect(ctx.ptyProcesses.has('kill-1')).toBe(false)
    })

    it('does nothing if pty process not found', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      await handlers['pty:kill'](mockEvent, 'nonexistent')
      expect(mockTreeKill).not.toHaveBeenCalled()
    })

    it('disposes event listeners when killing a PTY', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const dataDispose = vi.fn()
      const exitDispose = vi.fn()
      mockPtyOnData.mockReturnValue({ dispose: dataDispose })
      mockPtyOnExit.mockReturnValue({ dispose: exitDispose })

      const mockProcess = createMockPtyProcess()
      mockPtySpawn.mockReturnValue(mockProcess)
      mockBrowserWindowFromWebContents.mockReturnValue(mockSenderWindow)

      await handlers['pty:create'](mockEvent, {
        id: 'dispose-1',
        cwd: '/tmp',
      })

      await handlers['pty:kill'](mockEvent, 'dispose-1')
      expect(dataDispose).toHaveBeenCalled()
      expect(exitDispose).toHaveBeenCalled()
    })
  })

  describe('pty:killForSession', () => {
    it('kills every PTY whose ID starts with the session prefix', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const sessionId = 'session-123'
      const agentProc = createMockPtyProcess()
      const userProc = createMockPtyProcess()
      const servicesProc = createMockPtyProcess()
      const otherProc = createMockPtyProcess()
      ctx.ptyProcesses.set(`${sessionId}-111`, agentProc as never)
      ctx.ptyProcesses.set(`user-${sessionId}-tab-aaa-222`, userProc as never)
      ctx.ptyProcesses.set(`services-${sessionId}-333`, servicesProc as never)
      ctx.ptyProcesses.set('session-other-444', otherProc as never)

      const count = await handlers['pty:killForSession'](mockEvent, sessionId)

      expect(count).toBe(3)
      expect(mockTreeKill).toHaveBeenCalledWith(agentProc.pid, undefined, expect.anything())
      expect(mockTreeKill).toHaveBeenCalledWith(userProc.pid, undefined, expect.anything())
      expect(mockTreeKill).toHaveBeenCalledWith(servicesProc.pid, undefined, expect.anything())
      expect(mockTreeKill).not.toHaveBeenCalledWith(otherProc.pid, undefined, expect.anything())
      expect(ctx.ptyProcesses.has('session-other-444')).toBe(true)
    })

    it('returns 0 when no sessionId is given', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)
      const count = await handlers['pty:killForSession'](mockEvent, '')
      expect(count).toBe(0)
    })

    it('returns 0 when no PTYs match', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)
      const count = await handlers['pty:killForSession'](mockEvent, 'session-missing')
      expect(count).toBe(0)
      expect(mockTreeKill).not.toHaveBeenCalled()
    })
  })

  describe('pty:getStats', () => {
    it('aggregates per-PTY stats into per-session stats', async () => {
      const tracker = await import('../descendantsTracker')
      vi.mocked(tracker.getAllStats).mockReturnValue({
        'sess-A-111': { shellPid: 101, rssMb: 100, cpuPct: 1.5, liveCount: 2 },
        'user-sess-A-tab-x-222': { shellPid: 102, rssMb: 50, cpuPct: 0.5, liveCount: 1 },
        'sess-B-333': { shellPid: 103, rssMb: 200, cpuPct: 5.0, liveCount: 3 },
      })

      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)
      const stats = await handlers['pty:getStats']()

      expect(stats['sess-A']).toEqual({ rssMb: 150, cpuPct: 2.0, ptyCount: 2 })
      expect(stats['sess-B']).toEqual({ rssMb: 200, cpuPct: 5.0, ptyCount: 1 })
    })
  })

  describe('pty:killOrphans', () => {
    it('passes verified extraPids (with start times) into treeKill', async () => {
      const tracker = await import('../descendantsTracker')
      // PTY 'foo' has shell pid 100, with historical descendants 100, 200, 300.
      vi.mocked(tracker.getHistoricalDescendants).mockReturnValueOnce([
        { pid: 100, startTime: 'Mon Jan  1 00:00:01 2024' },
        { pid: 200, startTime: 'Mon Jan  1 00:00:02 2024' },
        { pid: 300, startTime: 'Mon Jan  1 00:00:03 2024' },
      ])

      // ps says 200 and 300 are alive but only 100 (the shell) is still
      // reachable from the live tree (200/300 reparented to init).
      const treeKillMod = await import('../treeKill')
      vi.mocked(treeKillMod.parsePsSnapshot).mockReturnValueOnce([
        { pid: 100, ppid: 1, pgid: 100 },
        { pid: 200, ppid: 1, pgid: 999 }, // detached, different pgid
        { pid: 300, ppid: 1, pgid: 999 }, // detached, different pgid
      ])
      vi.mocked(treeKillMod.collectDescendants).mockReturnValueOnce(new Set<number>([100]))

      const { register } = await import('./pty')
      const ctx = createCtx()
      const proc = createMockPtyProcess()
      ctx.ptyProcesses.set('foo', proc as never)
      register(mockIpcMain as never, ctx)

      const count = await handlers['pty:killOrphans']()
      expect(count).toBe(2)
      // treeKill receives the structured extras carrying the recorded start times.
      const lastCall = mockTreeKill.mock.calls[mockTreeKill.mock.calls.length - 1]
      const extras = [...(lastCall[2] as Iterable<{ pid: number; startTime: string }>)]
        .slice()
        .sort((a, b) => a.pid - b.pid)
      expect(extras).toEqual([
        { pid: 200, startTime: 'Mon Jan  1 00:00:02 2024' },
        { pid: 300, startTime: 'Mon Jan  1 00:00:03 2024' },
      ])
    })

    it('returns 0 when there are no orphans', async () => {
      const { register } = await import('./pty')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)
      const count = await handlers['pty:killOrphans']()
      expect(count).toBe(0)
    })
  })
})
