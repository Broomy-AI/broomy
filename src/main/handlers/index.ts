/**
 * Entry point that registers all IPC handler modules with the main process.
 */
import { IpcMain } from 'electron'
import { HandlerContext } from './types'
import * as ptyHandlers from './pty'
import * as configHandlers from './config'
import * as gitHandlers from './git'
import * as fsHandlers from './fs'
import * as ghHandlers from './gh'
import * as shellHandlers from './shell'
import * as appHandlers from './app'
import * as typescriptHandlers from './typescript'
import * as updaterHandlers from './updater'
import * as devcontainerHandlers from './devcontainer'
import * as agentSdkHandlers from './agentSdk'

export function registerAllHandlers(ipcMain: IpcMain, ctx: HandlerContext): void {
  ptyHandlers.register(ipcMain, ctx)
  configHandlers.register(ipcMain, ctx)
  gitHandlers.register(ipcMain, ctx)
  fsHandlers.register(ipcMain, ctx)
  ghHandlers.register(ipcMain, ctx)
  shellHandlers.register(ipcMain, ctx)
  appHandlers.register(ipcMain, ctx)
  typescriptHandlers.register(ipcMain, ctx)
  updaterHandlers.register(ipcMain, ctx)
  devcontainerHandlers.register(ipcMain, ctx)
  agentSdkHandlers.register(ipcMain, ctx)
}

export type { HandlerContext } from './types'
export { PROFILES_FILE } from './types'
