import { contextBridge, ipcRenderer } from 'electron'

export type PtyApi = {
  create: (options: { id: string; cwd: string; command?: string }) => Promise<{ id: string }>
  write: (id: string, data: string) => Promise<void>
  resize: (id: string, cols: number, rows: number) => Promise<void>
  kill: (id: string) => Promise<void>
  onData: (id: string, callback: (data: string) => void) => () => void
  onExit: (id: string, callback: (exitCode: number) => void) => () => void
}

export type DialogApi = {
  openFolder: () => Promise<string | null>
}

export type GitApi = {
  getBranch: (path: string) => Promise<string>
  isGitRepo: (path: string) => Promise<boolean>
}

export type AgentData = {
  id: string
  name: string
  command: string
  color?: string
}

export type SessionData = {
  id: string
  name: string
  directory: string
  agentId?: string | null
}

export type ConfigData = {
  agents: AgentData[]
  sessions: SessionData[]
}

export type ConfigApi = {
  load: () => Promise<ConfigData>
  save: (config: ConfigData) => Promise<{ success: boolean; error?: string }>
}

const ptyApi: PtyApi = {
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
}

const dialogApi: DialogApi = {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
}

const gitApi: GitApi = {
  getBranch: (path) => ipcRenderer.invoke('git:getBranch', path),
  isGitRepo: (path) => ipcRenderer.invoke('git:isGitRepo', path),
}

const configApi: ConfigApi = {
  load: () => ipcRenderer.invoke('config:load'),
  save: (config) => ipcRenderer.invoke('config:save', config),
}

contextBridge.exposeInMainWorld('pty', ptyApi)
contextBridge.exposeInMainWorld('dialog', dialogApi)
contextBridge.exposeInMainWorld('git', gitApi)
contextBridge.exposeInMainWorld('config', configApi)

declare global {
  interface Window {
    pty: PtyApi
    dialog: DialogApi
    git: GitApi
    config: ConfigApi
  }
}
