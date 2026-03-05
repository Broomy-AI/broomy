/**
 * IPC handlers for auto-update lifecycle: check, download, and install via electron-updater.
 */
import { BrowserWindow, IpcMain } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
type UpdateInfo = import('electron-updater').UpdateInfo
import { HandlerContext } from './types'
import { getScenarioData } from './scenarios'

export type UpdateCheckResult = {
  updateAvailable: boolean
  version?: string
  checkFailed?: boolean
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  // In E2E or dev mode, return mock/no-op responses
  if (ctx.isE2ETest || ctx.isDev) {
    ipcMain.handle('updater:checkForUpdates', (): UpdateCheckResult => {
      return getScenarioData(ctx.e2eScenario).updater
    })
    ipcMain.handle('updater:downloadUpdate', () => {})
    ipcMain.handle('updater:installUpdate', () => {})
    return
  }

  // Configure electron-updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Forward download progress to all renderer windows
  autoUpdater.on('download-progress', (progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('updater:downloadProgress', progress.percent)
    }
  })

  autoUpdater.on('update-downloaded', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('updater:updateDownloaded')
    }
  })

  ipcMain.handle('updater:checkForUpdates', async (): Promise<UpdateCheckResult> => {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result?.updateInfo) {
        return { updateAvailable: false }
      }
      const info: UpdateInfo = result.updateInfo
      const isNewer = info.version !== autoUpdater.currentVersion?.version
      if (!isNewer) {
        return { updateAvailable: false }
      }
      return {
        updateAvailable: true,
        version: info.version,
      }
    } catch {
      // Network errors, rate limits, etc.
      return { updateAvailable: false, checkFailed: true }
    }
  })

  ipcMain.handle('updater:downloadUpdate', async () => {
    await autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updater:installUpdate', () => {
    autoUpdater.quitAndInstall()
  })
}
