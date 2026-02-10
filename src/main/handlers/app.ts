import { IpcMain } from 'electron'
import { homedir } from 'os'
import { HandlerContext } from './types'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('app:isDev', () => ctx.isDev)
  ipcMain.handle('app:homedir', () => homedir())
  ipcMain.handle('app:platform', () => process.platform)
}
