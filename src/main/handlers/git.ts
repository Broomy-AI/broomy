import { IpcMain } from 'electron'
import { HandlerContext } from './types'
import * as gitBasic from './gitBasic'
import * as gitBranch from './gitBranch'
import * as gitSync from './gitSync'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  gitBasic.register(ipcMain, ctx)
  gitBranch.register(ipcMain, ctx)
  gitSync.register(ipcMain, ctx)
}
