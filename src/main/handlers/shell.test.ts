import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HandlerContext } from './types'

// Mock child_process.exec
const mockExec = vi.fn()
vi.mock('child_process', () => ({
  exec: (...args: unknown[]) => mockExec(...args),
}))

// Mock electron
const mockShellOpenExternal = vi.fn()
const mockDialogShowOpenDialog = vi.fn()
const mockMenuBuildFromTemplate = vi.fn()
const mockMenuPopup = vi.fn()
const mockBrowserWindowFromWebContents = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: (...args: unknown[]) => mockBrowserWindowFromWebContents(...args),
  },
  shell: {
    openExternal: (...args: unknown[]) => mockShellOpenExternal(...args),
  },
  dialog: {
    showOpenDialog: (...args: unknown[]) => mockDialogShowOpenDialog(...args),
  },
  Menu: {
    buildFromTemplate: (...args: unknown[]) => mockMenuBuildFromTemplate(...args),
  },
}))

// Mock platform
vi.mock('../platform', () => ({
  getExecShell: () => '/bin/bash',
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
}))

// Build a minimal HandlerContext
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
      await handlers['shell:openExternal'](mockEvent, 'https://example.com')
      expect(mockShellOpenExternal).toHaveBeenCalledWith('https://example.com')
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

  describe('menu:popup', () => {
    it('resolves with item id when clicked', async () => {
      const { register } = await import('./shell')
      const mockWindow = { id: 1 }
      const ctx = createCtx({ mainWindow: mockWindow as never })
      register(mockIpcMain as never, ctx)

      mockBrowserWindowFromWebContents.mockReturnValue(mockWindow)

      let capturedTemplate: Array<{ label?: string; click?: () => void; type?: string }> = []
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

      let capturedTemplate: Array<{ type?: string; label?: string; enabled?: boolean; click?: () => void }> = []
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
})
