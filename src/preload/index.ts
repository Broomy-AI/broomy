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

export type FileEntry = {
  name: string
  path: string
  isDirectory: boolean
}

export type GitFileStatus = {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
}

export type FsApi = {
  readDir: (path: string) => Promise<FileEntry[]>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
  readFileBase64: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
}

export type GitApi = {
  getBranch: (path: string) => Promise<string>
  isGitRepo: (path: string) => Promise<boolean>
  status: (path: string) => Promise<GitFileStatus[]>
  diff: (repoPath: string, filePath?: string) => Promise<string>
  show: (repoPath: string, filePath: string, ref?: string) => Promise<string>
}

export type AgentData = {
  id: string
  name: string
  command: string
  color?: string
}

export type LayoutSizesData = {
  explorerWidth: number
  fileViewerSize: number
  userTerminalHeight: number
  diffPanelWidth: number
}

export type SessionData = {
  id: string
  name: string
  directory: string
  agentId?: string | null
  showAgentTerminal?: boolean
  showUserTerminal?: boolean
  showExplorer?: boolean
  showFileViewer?: boolean
  showDiff?: boolean
  fileViewerPosition?: 'top' | 'left'
  layoutSizes?: LayoutSizesData
  explorerFilter?: 'all' | 'changed'
}

export type ConfigData = {
  agents: AgentData[]
  sessions: SessionData[]
  showSidebar?: boolean
  sidebarWidth?: number
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

const fsApi: FsApi = {
  readDir: (path) => ipcRenderer.invoke('fs:readDir', path),
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
  writeFile: (path, content) => ipcRenderer.invoke('fs:writeFile', path, content),
  readFileBase64: (path) => ipcRenderer.invoke('fs:readFileBase64', path),
  exists: (path) => ipcRenderer.invoke('fs:exists', path),
}

const gitApi: GitApi = {
  getBranch: (path) => ipcRenderer.invoke('git:getBranch', path),
  isGitRepo: (path) => ipcRenderer.invoke('git:isGitRepo', path),
  status: (path) => ipcRenderer.invoke('git:status', path),
  diff: (repoPath, filePath) => ipcRenderer.invoke('git:diff', repoPath, filePath),
  show: (repoPath, filePath, ref) => ipcRenderer.invoke('git:show', repoPath, filePath, ref),
}

const configApi: ConfigApi = {
  load: () => ipcRenderer.invoke('config:load'),
  save: (config) => ipcRenderer.invoke('config:save', config),
}

contextBridge.exposeInMainWorld('pty', ptyApi)
contextBridge.exposeInMainWorld('dialog', dialogApi)
contextBridge.exposeInMainWorld('fs', fsApi)
contextBridge.exposeInMainWorld('git', gitApi)
contextBridge.exposeInMainWorld('config', configApi)

declare global {
  interface Window {
    pty: PtyApi
    dialog: DialogApi
    fs: FsApi
    git: GitApi
    config: ConfigApi
  }
}
