/**
 * IPC handlers for shell commands, external URLs, native dialogs, and context menus.
 */
import { BrowserWindow, IpcMain, dialog, Menu, shell } from 'electron'
import { exec } from 'child_process'
import { getExecShell, normalizePath, getAvailableShells, getDefaultShell } from '../platform'
import { HandlerContext, expandHomePath } from './types'

const isDev = process.env.ELECTRON_RENDERER_URL !== undefined

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('shell:exec', async (_event, command: string, cwd: string) => {
    if (ctx.isE2ETest && !ctx.e2eRealRepos) {
      return { success: true, stdout: '', stderr: '', exitCode: 0 }
    }

    return new Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>((resolve) => {
      exec(command, { cwd: expandHomePath(cwd), shell: getExecShell(), timeout: 300000 }, (error, stdout, stderr) => {
        const exitCode = error ? error.code ?? 1 : 0
        resolve({
          success: !error,
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: typeof exitCode === 'number' ? exitCode : 1,
        })
      })
    })
  })

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (ctx.isE2ETest) {
      return
    }
    await shell.openExternal(url)
  })

  ipcMain.handle('shells:list', (_event) => {
    if (ctx.isE2ETest) {
      const defaultPath = getDefaultShell()
      return [
        { path: defaultPath, name: 'Default Shell', isDefault: true },
        { path: '/bin/bash', name: 'Bash', isDefault: false },
        { path: '/bin/sh', name: 'sh', isDefault: false },
      ]
    }
    return getAvailableShells()
  })

  ipcMain.handle('dialog:openFolder', async (_event) => {
    const senderWindow = BrowserWindow.fromWebContents(_event.sender) || ctx.mainWindow
    const result = await dialog.showOpenDialog(senderWindow!, {
      properties: ['openDirectory'],
      title: 'Select a Git Repository',
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return normalizePath(result.filePaths[0])
  })

  ipcMain.handle('menu:appMenuPopup', async (_event) => {
    if (ctx.isE2ETest) {
      return null
    }
    const senderWindow = BrowserWindow.fromWebContents(_event.sender) || ctx.mainWindow
    return new Promise<string | null>((resolve) => {
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            {
              label: 'Select All',
              accelerator: 'CmdOrCtrl+A',
              click: () => {
                senderWindow?.webContents.send('menu:select-all')
              },
            },
          ],
        },
        {
          label: 'View',
          submenu: [
            ...(isDev
              ? [
                  { role: 'reload' as const },
                  { role: 'forceReload' as const },
                  { role: 'toggleDevTools' as const },
                  { type: 'separator' as const },
                ]
              : []),
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' },
          ],
        },
        {
          label: 'Window',
          submenu: [
            { role: 'minimize' },
            { role: 'zoom' },
            { role: 'close' },
          ],
        },
        {
          label: 'Help',
          submenu: [
            { label: 'Getting Started', click: () => resolve('help:getting-started') },
            { label: 'Keyboard Shortcuts', click: () => resolve('help:shortcuts') },
            { type: 'separator' },
            { label: 'Reset Tutorial Progress', click: () => resolve('help:reset-tutorial') },
            { type: 'separator' },
            { label: 'Check for Updates...', click: () => resolve('check-for-updates') },
            { type: 'separator' },
            {
              label: 'Report Issue...',
              click: () => {
                void shell.openExternal('https://github.com/Broomy-AI/broomy/issues')
                resolve(null)
              },
            },
          ],
        },
        { type: 'separator' },
        { label: 'Configure Toolbar...', click: () => resolve('configure-toolbar') },
        { label: 'About Broomy', click: () => resolve('about') },
      ]

      const menu = Menu.buildFromTemplate(template)
      menu.popup({
        window: senderWindow!,
        callback: () => {
          resolve(null)
        },
      })
    })
  })

  ipcMain.handle('window:minimize', (_event) => {
    if (ctx.isE2ETest) return
    BrowserWindow.fromWebContents(_event.sender)?.minimize()
  })

  ipcMain.handle('window:maximize', (_event) => {
    if (ctx.isE2ETest) return
    const win = BrowserWindow.fromWebContents(_event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle('window:close', (_event) => {
    if (ctx.isE2ETest) return
    BrowserWindow.fromWebContents(_event.sender)?.close()
  })

  ipcMain.handle('menu:popup', async (_event, items: { id: string; label: string; enabled?: boolean; type?: 'separator' }[]) => {
    const senderWindow = BrowserWindow.fromWebContents(_event.sender) || ctx.mainWindow
    return new Promise<string | null>((resolve) => {
      const template = items.map((item) => {
        if (item.type === 'separator') {
          return { type: 'separator' as const }
        }
        return {
          label: item.label,
          enabled: item.enabled !== false,
          click: () => resolve(item.id),
        }
      })

      const menu = Menu.buildFromTemplate(template)
      menu.popup({
        window: senderWindow!,
        callback: () => {
          resolve(null)
        },
      })
    })
  })
}
