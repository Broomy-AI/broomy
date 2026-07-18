import { describe, it, expect, vi, beforeEach } from 'vitest'
import { E2EScenario, type HandlerContext } from './types'

// Mock child_process.exec
const mockExec = vi.fn()
vi.mock('child_process', () => ({
  exec: (...args: unknown[]) => mockExec(...args),
}))

// Mock electron
const mockShellOpenExternal = vi.fn()
const mockShellOpenPath = vi.fn()
const mockShowItemInFolder = vi.fn()
const mockDialogShowOpenDialog = vi.fn()
const mockDialogShowSaveDialog = vi.fn()
const mockMenuBuildFromTemplate = vi.fn()
const mockBrowserWindowFromWebContents = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: (...args: unknown[]) => mockBrowserWindowFromWebContents(...args),
  },
  shell: {
    openExternal: (...args: unknown[]) => mockShellOpenExternal(...args),
    openPath: (...args: unknown[]) => mockShellOpenPath(...args),
    showItemInFolder: (...args: unknown[]) => mockShowItemInFolder(...args),
  },
  dialog: {
    showOpenDialog: (...args: unknown[]) => mockDialogShowOpenDialog(...args),
    showSaveDialog: (...args: unknown[]) => mockDialogShowSaveDialog(...args),
  },
  Menu: {
    buildFromTemplate: (...args: unknown[]) => mockMenuBuildFromTemplate(...args),
  },
}))

// Mock fs/promises (lstat drives the openPath / pathExists file-type checks)
const mockLstat = vi.fn()
vi.mock('fs/promises', () => ({
  lstat: (...args: unknown[]) => mockLstat(...args),
}))

// Mock platform
vi.mock('../platform', () => ({
  getExecShell: () => '/bin/bash',
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
  getAvailableShells: () => [
    { path: '/bin/zsh', name: 'zsh', isDefault: true },
    { path: '/bin/bash', name: 'bash', isDefault: false },
  ],
  getDefaultShell: () => '/bin/zsh',
}))

// Build a minimal HandlerContext
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

describe('shell handlers', () => {
  let handlers: Record<string, Function>
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers[channel] = handler
    }),
  }
  const mockEvent = {
    sender: { id: 1 },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = {}
  })

  describe('shell:exec', () => {
    it('returns mock data in E2E mode', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx({ isE2ETest: true })
      register(mockIpcMain as never, ctx)

      const result = await handlers['shell:exec'](mockEvent, 'echo hello', '/tmp')
      expect(result).toEqual({ success: true, stdout: '', stderr: '', exitCode: 0 })
      expect(mockExec).not.toHaveBeenCalled()
    })

    it('executes command in normal mode and resolves on success', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockExec.mockImplementation((_cmd: string, _opts: unknown, cb: Function) => {
        cb(null, 'output text', '')
      })

      const result = await handlers['shell:exec'](mockEvent, 'echo hello', '/tmp')
      expect(result).toEqual({ success: true, stdout: 'output text', stderr: '', exitCode: 0 })
      expect(mockExec).toHaveBeenCalledWith(
        'echo hello',
        expect.objectContaining({ cwd: '/tmp', timeout: 300000 }),
        expect.any(Function),
      )
    })

    it('resolves with error info when command fails', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const error = new Error('Command failed') as Error & { code: number }
      error.code = 127
      mockExec.mockImplementation((_cmd: string, _opts: unknown, cb: Function) => {
        cb(error, '', 'not found')
      })

      const result = await handlers['shell:exec'](mockEvent, 'bad-command', '/tmp')
      expect(result).toEqual({ success: false, stdout: '', stderr: 'not found', exitCode: 127 })
    })

    it('defaults exitCode to 1 when error.code is not a number', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const error = new Error('fail') as Error & { code?: unknown }
      error.code = 'ENOENT'
      mockExec.mockImplementation((_cmd: string, _opts: unknown, cb: Function) => {
        cb(error, '', 'err')
      })

      const result = await handlers['shell:exec'](mockEvent, 'missing', '/tmp')
      expect(result.exitCode).toBe(1)
      expect(result.success).toBe(false)
    })

    it('defaults exitCode to 1 when error has no code', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const error = new Error('fail')
      mockExec.mockImplementation((_cmd: string, _opts: unknown, cb: Function) => {
        cb(error, '', '')
      })

      const result = await handlers['shell:exec'](mockEvent, 'fail', '/tmp')
      expect(result.exitCode).toBe(1)
    })

    it('expands ~ in cwd path', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockExec.mockImplementation((_cmd: string, _opts: unknown, cb: Function) => {
        cb(null, '', '')
      })

      await handlers['shell:exec'](mockEvent, 'ls', '~/projects')
      expect(mockExec).toHaveBeenCalledWith(
        'ls',
        expect.objectContaining({
          cwd: expect.stringContaining('projects'),
        }),
        expect.any(Function),
      )
    })
  })

  describe('shell:openExternal', () => {
    it('calls shell.openExternal with the URL', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockShellOpenExternal.mockResolvedValue(undefined)
      // A URL with a path is passed through unchanged (normalized href === input).
      await handlers['shell:openExternal'](mockEvent, 'https://github.com/Broomy-AI/broomy/pull/149')
      expect(mockShellOpenExternal).toHaveBeenCalledWith('https://github.com/Broomy-AI/broomy/pull/149')
    })

    it('allows http as well as https', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockShellOpenExternal.mockResolvedValue(undefined)
      // WHATWG normalizes a bare host to a trailing slash — the OS gets exactly what we validated.
      await handlers['shell:openExternal'](mockEvent, 'http://localhost:5173')
      expect(mockShellOpenExternal).toHaveBeenCalledWith('http://localhost:5173/')
    })

    it('dispatches the normalized href, not the raw string (parser-differential guard)', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockShellOpenExternal.mockResolvedValue(undefined)
      // Backslashes are normalized to forward slashes by WHATWG; the OS must not re-parse the raw form.
      await handlers['shell:openExternal'](mockEvent, 'https://example.com\\@evil.com')
      expect(mockShellOpenExternal).toHaveBeenCalledTimes(1)
      expect(mockShellOpenExternal.mock.calls[0][0]).not.toContain('\\')
    })

    it('refuses non-http(s) schemes (file:, javascript:, mailto:, custom)', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'mailto:a@b.com', 'app://x']) {
        await handlers['shell:openExternal'](mockEvent, url)
      }
      expect(mockShellOpenExternal).not.toHaveBeenCalled()
    })

    it('refuses malformed / non-string input', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      await handlers['shell:openExternal'](mockEvent, 'not a url')
      await handlers['shell:openExternal'](mockEvent, '')
      await handlers['shell:openExternal'](mockEvent, undefined as never)
      expect(mockShellOpenExternal).not.toHaveBeenCalled()
    })
  })

  describe('dialog:openFolder', () => {
    it('returns normalized path when user selects a folder', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1 }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)
      mockDialogShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/Users/test/my-project'],
      })

      const result = await handlers['dialog:openFolder'](mockEvent)
      expect(result).toBe('/Users/test/my-project')
      expect(mockDialogShowOpenDialog).toHaveBeenCalledWith(mockWindow, {
        properties: ['openDirectory'],
        title: 'Select a Git Repository',
      })
    })

    it('returns null when dialog is canceled', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(null)
      mockDialogShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

      const result = await handlers['dialog:openFolder'](mockEvent)
      expect(result).toBeNull()
    })

    it('returns null when no file paths selected', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(null)
      mockDialogShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })

      const result = await handlers['dialog:openFolder'](mockEvent)
      expect(result).toBeNull()
    })

    it('falls back to mainWindow when sender window not found', async () => {
      const { register } = await import('./shell')
      const mockMainWin = { id: 99 }
      const ctx = createCtx({ mainWindow: mockMainWin as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(null)
      mockDialogShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/path'] })

      await handlers['dialog:openFolder'](mockEvent)
      expect(mockDialogShowOpenDialog).toHaveBeenCalledWith(mockMainWin, expect.any(Object))
    })
  })

  describe('dialog:saveFile', () => {
    it('returns chosen path when user selects a file', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1 }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)
      mockDialogShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.cast' })

      const result = await handlers['dialog:saveFile'](mockEvent, { defaultPath: 'out.cast', title: 'Save' })
      expect(result).toBe('/tmp/out.cast')
      expect(mockDialogShowSaveDialog).toHaveBeenCalledWith(mockWindow, expect.objectContaining({
        defaultPath: 'out.cast', title: 'Save',
      }))
    })

    it('returns null when the user cancels', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(null)
      mockDialogShowSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })

      const result = await handlers['dialog:saveFile'](mockEvent, {})
      expect(result).toBeNull()
    })

    it('returns null in E2E mode without opening a dialog', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx({ isE2ETest: true })
      register(mockIpcMain as never, ctx)

      const result = await handlers['dialog:saveFile'](mockEvent, {})
      expect(result).toBeNull()
      expect(mockDialogShowSaveDialog).not.toHaveBeenCalled()
    })
  })

  describe('shells:list', () => {
    it('returns E2E mock shells in E2E mode', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx({ isE2ETest: true })
      register(mockIpcMain as never, ctx)

      const result = await handlers['shells:list'](mockEvent)
      expect(result).toHaveLength(3)
      expect(result[0].isDefault).toBe(true)
    })

    it('returns available shells in normal mode', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const result = await handlers['shells:list'](mockEvent)
      expect(result).toHaveLength(2)
      expect(result[0].path).toBe('/bin/zsh')
    })
  })

  describe('window controls', () => {
    it('window:minimize does nothing in E2E mode', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx({ isE2ETest: true })
      register(mockIpcMain as never, ctx)

      await handlers['window:minimize'](mockEvent)
      expect(mockBrowserWindowFromWebContents).not.toHaveBeenCalled()
    })

    it('window:minimize calls minimize on sender window', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockMin = vi.fn()
      mockBrowserWindowFromWebContents.mockReturnValue({ minimize: mockMin })

      await handlers['window:minimize'](mockEvent)
      expect(mockMin).toHaveBeenCalled()
    })

    it('window:maximize toggles maximize', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockMaximize = vi.fn()
      const mockUnmaximize = vi.fn()
      mockBrowserWindowFromWebContents.mockReturnValue({
        isMaximized: () => false,
        maximize: mockMaximize,
        unmaximize: mockUnmaximize,
      })

      await handlers['window:maximize'](mockEvent)
      expect(mockMaximize).toHaveBeenCalled()
    })

    it('window:maximize unmaximizes when already maximized', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockMaximize = vi.fn()
      const mockUnmaximize = vi.fn()
      mockBrowserWindowFromWebContents.mockReturnValue({
        isMaximized: () => true,
        maximize: mockMaximize,
        unmaximize: mockUnmaximize,
      })

      await handlers['window:maximize'](mockEvent)
      expect(mockUnmaximize).toHaveBeenCalled()
      expect(mockMaximize).not.toHaveBeenCalled()
    })

    it('window:close closes the sender window', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      const mockClose = vi.fn()
      mockBrowserWindowFromWebContents.mockReturnValue({ close: mockClose })

      await handlers['window:close'](mockEvent)
      expect(mockClose).toHaveBeenCalled()
    })

    it('window:maximize does nothing in E2E mode', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx({ isE2ETest: true })
      register(mockIpcMain as never, ctx)

      await handlers['window:maximize'](mockEvent)
      expect(mockBrowserWindowFromWebContents).not.toHaveBeenCalled()
    })

    it('window:close does nothing in E2E mode', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx({ isE2ETest: true })
      register(mockIpcMain as never, ctx)

      await handlers['window:close'](mockEvent)
      expect(mockBrowserWindowFromWebContents).not.toHaveBeenCalled()
    })
  })

  describe('shell:openExternal E2E', () => {
    it('does nothing in E2E mode', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx({ isE2ETest: true })
      register(mockIpcMain as never, ctx)

      await handlers['shell:openExternal'](mockEvent, 'https://example.com')
      expect(mockShellOpenExternal).not.toHaveBeenCalled()
    })
  })

  describe('menu:appMenuPopup', () => {
    it('returns null in E2E mode', async () => {
      const { register } = await import('./shell')
      const ctx = createCtx({ isE2ETest: true })
      register(mockIpcMain as never, ctx)

      const result = await handlers['menu:appMenuPopup'](mockEvent)
      expect(result).toBeNull()
    })

    it('builds menu and resolves when a Help item is clicked', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1, webContents: { send: vi.fn() } }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)

      let capturedTemplate: { label?: string; submenu?: { label?: string; click?: () => void }[]; click?: () => void }[] = []
      mockMenuBuildFromTemplate.mockImplementation((template: typeof capturedTemplate) => {
        capturedTemplate = template
        return {
          popup: () => {
            // Find the Help submenu and click 'Getting Started'
            const helpMenu = capturedTemplate.find(item => item.label === 'Help')
            const gettingStarted = helpMenu?.submenu?.find(item => item.label === 'Getting Started')
            gettingStarted?.click?.()
          },
        }
      })

      const result = await handlers['menu:appMenuPopup'](mockEvent)
      expect(result).toBe('help:getting-started')
    })

    it('resolves null when menu is closed without selection', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1, webContents: { send: vi.fn() } }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)

      mockMenuBuildFromTemplate.mockImplementation(() => ({
        popup: ({ callback }: { callback: () => void }) => {
          callback()
        },
      }))

      const result = await handlers['menu:appMenuPopup'](mockEvent)
      expect(result).toBeNull()
    })

    it('resolves configure-toolbar when Configure Toolbar is clicked', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1, webContents: { send: vi.fn() } }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)

      let capturedTemplate: { label?: string; click?: () => void }[] = []
      mockMenuBuildFromTemplate.mockImplementation((template: typeof capturedTemplate) => {
        capturedTemplate = template
        return {
          popup: () => {
            const configItem = capturedTemplate.find(item => item.label === 'Configure Toolbar...')
            configItem?.click?.()
          },
        }
      })

      const result = await handlers['menu:appMenuPopup'](mockEvent)
      expect(result).toBe('configure-toolbar')
    })

    it('resolves about when About Broomy is clicked', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1, webContents: { send: vi.fn() } }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)

      let capturedTemplate: { label?: string; click?: () => void }[] = []
      mockMenuBuildFromTemplate.mockImplementation((template: typeof capturedTemplate) => {
        capturedTemplate = template
        return {
          popup: () => {
            const aboutItem = capturedTemplate.find(item => item.label === 'About Broomy')
            aboutItem?.click?.()
          },
        }
      })

      const result = await handlers['menu:appMenuPopup'](mockEvent)
      expect(result).toBe('about')
    })

    it('resolves help:shortcuts when Keyboard Shortcuts is clicked', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1, webContents: { send: vi.fn() } }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)

      let capturedTemplate: { label?: string; submenu?: { label?: string; click?: () => void }[] }[] = []
      mockMenuBuildFromTemplate.mockImplementation((template: typeof capturedTemplate) => {
        capturedTemplate = template
        return {
          popup: () => {
            const helpMenu = capturedTemplate.find(item => item.label === 'Help')
            const item = helpMenu?.submenu?.find(i => i.label === 'Keyboard Shortcuts')
            item?.click?.()
          },
        }
      })

      const result = await handlers['menu:appMenuPopup'](mockEvent)
      expect(result).toBe('help:shortcuts')
    })

    it('resolves help:reset-tutorial when Reset Tutorial is clicked', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1, webContents: { send: vi.fn() } }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)

      let capturedTemplate: { label?: string; submenu?: { label?: string; click?: () => void }[] }[] = []
      mockMenuBuildFromTemplate.mockImplementation((template: typeof capturedTemplate) => {
        capturedTemplate = template
        return {
          popup: () => {
            const helpMenu = capturedTemplate.find(item => item.label === 'Help')
            const item = helpMenu?.submenu?.find(i => i.label === 'Reset Tutorial Progress')
            item?.click?.()
          },
        }
      })

      const result = await handlers['menu:appMenuPopup'](mockEvent)
      expect(result).toBe('help:reset-tutorial')
    })

    it('resolves check-for-updates when Check for Updates is clicked', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1, webContents: { send: vi.fn() } }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)

      let capturedTemplate: { label?: string; submenu?: { label?: string; click?: () => void }[] }[] = []
      mockMenuBuildFromTemplate.mockImplementation((template: typeof capturedTemplate) => {
        capturedTemplate = template
        return {
          popup: () => {
            const helpMenu = capturedTemplate.find(item => item.label === 'Help')
            const item = helpMenu?.submenu?.find(i => i.label === 'Check for Updates...')
            item?.click?.()
          },
        }
      })

      const result = await handlers['menu:appMenuPopup'](mockEvent)
      expect(result).toBe('check-for-updates')
    })

    it('opens GitHub issues URL when Report Issue is clicked', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1, webContents: { send: vi.fn() } }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)
      mockShellOpenExternal.mockResolvedValue(undefined)

      let capturedTemplate: { label?: string; submenu?: { label?: string; click?: () => void }[] }[] = []
      mockMenuBuildFromTemplate.mockImplementation((template: typeof capturedTemplate) => {
        capturedTemplate = template
        return {
          popup: () => {
            const helpMenu = capturedTemplate.find(item => item.label === 'Help')
            const item = helpMenu?.submenu?.find(i => i.label === 'Report Issue...')
            item?.click?.()
          },
        }
      })

      const result = await handlers['menu:appMenuPopup'](mockEvent)
      expect(mockShellOpenExternal).toHaveBeenCalledWith('https://github.com/Broomy-AI/broomy/issues')
      expect(result).toBeNull()
    })

    it('triggers select-all via Edit > Select All click', async () => {
      const { register } = await import('./shell')
      const mockSend = vi.fn()
      const mockWindow = { id: 1, webContents: { send: mockSend } }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)

      type SubItem = { label?: string; role?: string; click?: () => void; accelerator?: string }
      let capturedTemplate: { label?: string; submenu?: SubItem[] }[] = []
      mockMenuBuildFromTemplate.mockImplementation((template: typeof capturedTemplate) => {
        capturedTemplate = template
        return {
          popup: ({ callback }: { callback: () => void }) => {
            const editMenu = capturedTemplate.find(item => item.label === 'Edit')
            const selectAll = editMenu?.submenu?.find(i => i.label === 'Select All')
            selectAll?.click?.()
            callback()
          },
        }
      })

      await handlers['menu:appMenuPopup'](mockEvent)
      expect(mockSend).toHaveBeenCalledWith('menu:select-all')
    })
  })

  describe('menu:popup', () => {
    it('resolves with item id when clicked', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1 }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)

      let capturedTemplate: { label?: string; click?: () => void; type?: string }[] = []
      mockMenuBuildFromTemplate.mockImplementation((template: typeof capturedTemplate) => {
        capturedTemplate = template
        return {
          popup: ({ callback: _cb }: { callback: () => void }) => {
            // Simulate clicking the first non-separator item
            const clickableItem = capturedTemplate.find(item => item.click)
            if (clickableItem?.click) clickableItem.click()
          },
        }
      })

      const items = [
        { id: 'edit', label: 'Edit', enabled: true },
        { id: 'delete', label: 'Delete' },
      ]
      const result = await handlers['menu:popup'](mockEvent, items)
      expect(result).toBe('edit')
    })

    it('resolves with null when menu is closed without selection', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1 }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)

      mockMenuBuildFromTemplate.mockImplementation(() => ({
        popup: ({ callback }: { callback: () => void }) => {
          // Simulate closing the menu without clicking anything
          callback()
        },
      }))

      const items = [{ id: 'edit', label: 'Edit' }]
      const result = await handlers['menu:popup'](mockEvent, items)
      expect(result).toBeNull()
    })

    it('handles separator items in the menu', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1 }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)

      let capturedTemplate: { type?: string; label?: string; enabled?: boolean; click?: () => void }[] = []
      mockMenuBuildFromTemplate.mockImplementation((template: typeof capturedTemplate) => {
        capturedTemplate = template
        return {
          popup: ({ callback }: { callback: () => void }) => {
            callback()
          },
        }
      })

      const items = [
        { id: 'edit', label: 'Edit' },
        { id: 'sep', label: '', type: 'separator' as const },
        { id: 'delete', label: 'Delete', enabled: false },
      ]
      await handlers['menu:popup'](mockEvent, items)

      // Verify separator was correctly mapped
      expect(capturedTemplate[0]).toHaveProperty('label', 'Edit')
      expect(capturedTemplate[0]).toHaveProperty('enabled', true)
      expect(capturedTemplate[1]).toEqual({ type: 'separator' })
      expect(capturedTemplate[2]).toHaveProperty('label', 'Delete')
      expect(capturedTemplate[2]).toHaveProperty('enabled', false)
    })
  })

  describe('isNativeOpen', () => {
    it('opens document/media extensions and reveals the rest (case-insensitive)', async () => {
      const { isNativeOpen } = await import('./shell')
      expect(isNativeOpen('/a/b.html')).toBe(true)
      expect(isNativeOpen('/a/b.HTML')).toBe(true)
      expect(isNativeOpen('/a/b.pdf')).toBe(true)
      expect(isNativeOpen('/a/b.ts')).toBe(false)
      expect(isNativeOpen('/a/Makefile')).toBe(false)
      expect(isNativeOpen('/a/b')).toBe(false)
    })
  })

  describe('resolveTerminalPath', () => {
    it('keeps absolute paths and resolves relative ones against baseCwd', async () => {
      const { resolveTerminalPath } = await import('./shell')
      expect(resolveTerminalPath('/etc/hosts', '/repo')).toBe('/etc/hosts')
      expect(resolveTerminalPath('src/a.ts', '/repo/app')).toBe('/repo/app/src/a.ts')
    })
    it('rejects non-strings, control chars, and a non-absolute base', async () => {
      const { resolveTerminalPath } = await import('./shell')
      expect(resolveTerminalPath(42, '/repo')).toBeNull()
      expect(resolveTerminalPath('/a\u0000b', '/repo')).toBeNull()
      expect(resolveTerminalPath('src/a.ts', 'relative')).toBeNull()
    })
  })

  describe('shell:pathExists', () => {
    it('returns one boolean per input (existing → true, missing → false)', async () => {
      const { register } = await import('./shell')
      register(mockIpcMain as never, createCtx())
      mockLstat.mockImplementation((p: string) =>
        p === '/repo/there.txt' ? Promise.resolve({ isFile: () => true }) : Promise.reject(Object.assign(new Error('no'), { code: 'ENOENT' })),
      )
      expect(await handlers['shell:pathExists'](mockEvent, ['there.txt', 'gone.txt'], '/repo')).toEqual([true, false])
    })
    it('counts a broken symlink as existing (lstat resolves)', async () => {
      const { register } = await import('./shell')
      register(mockIpcMain as never, createCtx())
      mockLstat.mockResolvedValue({ isFile: () => false })
      expect(await handlers['shell:pathExists'](mockEvent, ['/broken.link'], '/repo')).toEqual([true])
    })
    it('is a no-op (all false) in E2E mode', async () => {
      const { register } = await import('./shell')
      register(mockIpcMain as never, createCtx({ isE2ETest: true }))
      expect(await handlers['shell:pathExists'](mockEvent, ['/a', '/b'], '/repo')).toEqual([false, false])
    })
  })

  describe('shell:openPath', () => {
    it('opens a native-open regular file with the default app', async () => {
      const { register } = await import('./shell')
      register(mockIpcMain as never, createCtx())
      mockLstat.mockResolvedValue({ isFile: () => true })
      mockShellOpenPath.mockResolvedValue('')
      expect(await handlers['shell:openPath'](mockEvent, '/repo/a.html', '/repo')).toEqual({ action: 'opened' })
      expect(mockShellOpenPath).toHaveBeenCalledWith('/repo/a.html')
    })
    it('reveals a non-native regular file (source, no ext)', async () => {
      const { register } = await import('./shell')
      register(mockIpcMain as never, createCtx())
      mockLstat.mockResolvedValue({ isFile: () => true })
      expect(await handlers['shell:openPath'](mockEvent, '/repo/a.ts', '/repo')).toEqual({ action: 'revealed' })
      expect(mockShowItemInFolder).toHaveBeenCalledWith('/repo/a.ts')
      expect(mockShellOpenPath).not.toHaveBeenCalled()
    })
    it('reveals a symlink even with a safe extension (never follows it into openPath)', async () => {
      const { register } = await import('./shell')
      register(mockIpcMain as never, createCtx())
      mockLstat.mockResolvedValue({ isFile: () => false }) // symlink or directory
      expect(await handlers['shell:openPath'](mockEvent, '/repo/report.pdf', '/repo')).toEqual({ action: 'revealed' })
      expect(mockShellOpenPath).not.toHaveBeenCalled()
    })
    it('returns none for a missing path', async () => {
      const { register } = await import('./shell')
      register(mockIpcMain as never, createCtx())
      mockLstat.mockRejectedValue(Object.assign(new Error('no'), { code: 'ENOENT' }))
      expect(await handlers['shell:openPath'](mockEvent, '/repo/gone.html', '/repo')).toEqual({ action: 'none' })
    })
    it('surfaces an openPath error string', async () => {
      const { register } = await import('./shell')
      register(mockIpcMain as never, createCtx())
      mockLstat.mockResolvedValue({ isFile: () => true })
      mockShellOpenPath.mockResolvedValue('No application set')
      expect(await handlers['shell:openPath'](mockEvent, '/repo/a.pdf', '/repo')).toEqual({ action: 'failed', error: 'No application set' })
    })
    it('is a no-op in E2E mode', async () => {
      const { register } = await import('./shell')
      register(mockIpcMain as never, createCtx({ isE2ETest: true }))
      expect(await handlers['shell:openPath'](mockEvent, '/repo/a.html', '/repo')).toEqual({ action: 'none' })
      expect(mockShellOpenPath).not.toHaveBeenCalled()
    })
    it('returns failed on a non-ENOENT lstat error (e.g. EACCES)', async () => {
      const { register } = await import('./shell')
      register(mockIpcMain as never, createCtx())
      mockLstat.mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }))
      expect((await handlers['shell:openPath'](mockEvent, '/repo/a.html', '/repo')).action).toBe('failed')
    })
    it('returns failed (never rejects) when the OS dispatch throws', async () => {
      const { register } = await import('./shell')
      register(mockIpcMain as never, createCtx())
      mockLstat.mockResolvedValue({ isFile: () => true })
      mockShellOpenPath.mockRejectedValue(new Error('boom'))
      expect((await handlers['shell:openPath'](mockEvent, '/repo/a.html', '/repo')).action).toBe('failed')
    })
  })
})
