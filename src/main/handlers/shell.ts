import { BrowserWindow, IpcMain, dialog, Menu, shell } from 'electron'
import { exec } from 'child_process'
import { getExecShell, normalizePath } from '../platform'
import { HandlerContext, expandHomePath } from './types'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('shell:exec', async (_event, command: string, cwd: string) => {
    if (ctx.isE2ETest) {
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
    await shell.openExternal(url)
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
