import { IpcMain } from 'electron'
import { HandlerContext } from './types'
import * as fsCore from './fsCore'
import * as fsSearch from './fsSearch'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  fsCore.register(ipcMain, ctx)
  fsSearch.register(ipcMain, ctx)
}
