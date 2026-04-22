/**
 * Preload API for shell execution, native dialogs, app metadata, and auto-updates.
 */
import { ipcRenderer } from 'electron'
import type { ShellOption, CrashReport } from './types'

export type ShellApi = {
  exec: (command: string, cwd: string) => Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>
  openExternal: (url: string) => Promise<void>
  listShells: () => Promise<ShellOption[]>
}

export type DialogApi = {
  openFolder: () => Promise<string | null>
}

export type AppApi = {
  isDev: () => Promise<boolean>
  homedir: () => Promise<string>
  platform: () => Promise<string>
  tmpdir: () => Promise<string>
  getVersion: () => Promise<string>
  getBuildInfo: () => Promise<{ commit: string; buildTime: string }>
  getCrashLog: () => Promise<CrashReport | null>
  dismissCrashLog: () => Promise<void>
  getCrashReportUrl: () => Promise<string | null>
}

export type UpdateCheckResult = {
  updateAvailable: boolean
  version?: string
  checkFailed?: boolean
}

export type UpdateApi = {
  checkForUpdates: () => Promise<UpdateCheckResult>
  downloadUpdate: () => Promise<void>
  installUpdate: () => void
  onDownloadProgress: (callback: (percent: number) => void) => () => void
  onUpdateDownloaded: (callback: () => void) => () => void
  onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void
}

export type WindowControlsApi = {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
}

export const windowControlsApi: WindowControlsApi = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
}

export const shellApi: ShellApi = {
  exec: (command, cwd) => ipcRenderer.invoke('shell:exec', command, cwd),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  listShells: () => ipcRenderer.invoke('shells:list'),
}

export const dialogApi: DialogApi = {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
}

export const appApi: AppApi = {
  isDev: () => ipcRenderer.invoke('app:isDev'),
  homedir: () => ipcRenderer.invoke('app:homedir'),
  platform: () => ipcRenderer.invoke('app:platform'),
  tmpdir: () => ipcRenderer.invoke('app:tmpdir'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getBuildInfo: () => ipcRenderer.invoke('app:getBuildInfo'),
  getCrashLog: () => ipcRenderer.invoke('app:getCrashLog'),
  dismissCrashLog: () => ipcRenderer.invoke('app:dismissCrashLog'),
  getCrashReportUrl: () => ipcRenderer.invoke('app:getCrashReportUrl'),
}

export const updateApi: UpdateApi = {
  checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
  downloadUpdate: () => ipcRenderer.invoke('updater:downloadUpdate'),
  installUpdate: () => { void ipcRenderer.invoke('updater:installUpdate') },
  onDownloadProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, percent: number) => callback(percent)
    ipcRenderer.on('updater:downloadProgress', handler)
    return () => ipcRenderer.removeListener('updater:downloadProgress', handler)
  },
  onUpdateDownloaded: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('updater:updateDownloaded', handler)
    return () => ipcRenderer.removeListener('updater:updateDownloaded', handler)
  },
  onUpdateAvailable: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info)
    ipcRenderer.on('updater:updateAvailable', handler)
    return () => ipcRenderer.removeListener('updater:updateAvailable', handler)
  },
}
