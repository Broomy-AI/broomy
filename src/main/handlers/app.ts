/**
 * IPC handlers for app-level queries like platform, home directory, version,
 * and crash log management.
 */
import { app, IpcMain } from 'electron'
import { homedir, tmpdir } from 'os'
import { normalizePath } from '../platform'
import { HandlerContext } from './types'
import {
  readLatestCrashLog,
  deleteAllCrashLogs,
  buildCrashReportUrl,
} from '../crashLog'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('app:isDev', () => ctx.isDev)
  ipcMain.handle('app:homedir', () => normalizePath(homedir()))
  ipcMain.handle('app:platform', () => process.platform)
  ipcMain.handle('app:tmpdir', () => normalizePath(tmpdir()))
  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('app:getCrashLog', () => {
    if (ctx.isE2ETest) return null
    const result = readLatestCrashLog()
    return result ? result.report : null
  })

  ipcMain.handle('app:dismissCrashLog', () => {
    if (ctx.isE2ETest) return
    deleteAllCrashLogs()
  })

  ipcMain.handle('app:getCrashReportUrl', () => {
    if (ctx.isE2ETest) return null
    const result = readLatestCrashLog()
    if (!result) return null
    return buildCrashReportUrl(result.report)
  })
}
