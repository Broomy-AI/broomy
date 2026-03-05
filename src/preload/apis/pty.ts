/**
 * Preload API for pseudo-terminal lifecycle management and data streaming.
 */
import { ipcRenderer } from 'electron'

export type DevcontainerReadyEvent = {
  sessionId: string
  postAttachCommand: string
  containerId: string
  remoteUser: string
}

export type PtyApi = {
  create: (options: { id: string; cwd: string; command?: string; sessionId?: string; env?: Record<string, string>; shell?: string; isolated?: boolean; repoRootDir?: string }) => Promise<{ id: string }>
  write: (id: string, data: string) => Promise<void>
  resize: (id: string, cols: number, rows: number) => Promise<void>
  kill: (id: string) => Promise<void>
  onData: (id: string, callback: (data: string) => void) => () => void
  onExit: (id: string, callback: (exitCode: number) => void) => () => void
  onDevcontainerReady: (callback: (event: DevcontainerReadyEvent) => void) => () => void
  onDevcontainerMissing: (callback: (event: { sessionId: string }) => void) => () => void
}

export const ptyApi: PtyApi = {
  create: (options) => ipcRenderer.invoke('pty:create', options),
  write: (id, data) => ipcRenderer.invoke('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.invoke('pty:resize', id, cols, rows),
  kill: (id) => ipcRenderer.invoke('pty:kill', id),
  onData: (id, callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data)
    ipcRenderer.on(`pty:data:${id}`, handler)
    return () => ipcRenderer.removeListener(`pty:data:${id}`, handler)
  },
  onExit: (id, callback) => {
    const handler = (_event: Electron.IpcRendererEvent, exitCode: number) => callback(exitCode)
    ipcRenderer.on(`pty:exit:${id}`, handler)
    return () => ipcRenderer.removeListener(`pty:exit:${id}`, handler)
  },
  onDevcontainerReady: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: DevcontainerReadyEvent) => callback(data)
    ipcRenderer.on('pty:devcontainer-ready', handler)
    return () => ipcRenderer.removeListener('pty:devcontainer-ready', handler)
  },
  onDevcontainerMissing: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string }) => callback(data)
    ipcRenderer.on('pty:devcontainer-missing', handler)
    return () => ipcRenderer.removeListener('pty:devcontainer-missing', handler)
  },
}
