import { contextBridge, ipcRenderer } from 'electron'

export type PtyApi = {
  create: (options: { id: string; cwd: string; command?: string; sessionId?: string; env?: Record<string, string> }) => Promise<{ id: string }>
  write: (id: string, data: string) => Promise<void>
  resize: (id: string, cols: number, rows: number) => Promise<void>
  kill: (id: string) => Promise<void>
  onData: (id: string, callback: (data: string) => void) => () => void
  onExit: (id: string, callback: (exitCode: number) => void) => () => void
}

export type HookEvent = {
  type: 'PreToolUse' | 'PostToolUse' | 'PermissionRequest' | 'Stop' | 'Notification' | string
  timestamp: number
  sessionId: string
  data?: {
    tool?: string
    message?: string
    [key: string]: unknown
  }
}

export type HooksSetupStatus = {
  configured: boolean
  reason?: 'no-claude-settings' | 'no-hooks-section' | 'hooks-incomplete' | 'error'
  error?: string
  configDir?: string
}

export type HooksApi = {
  watch: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  unwatch: (sessionId: string) => Promise<{ success: boolean }>
  clear: (sessionId: string) => Promise<{ success: boolean }>
  onEvent: (sessionId: string, callback: (event: HookEvent) => void) => () => void
  checkSetup: (configDir?: string) => Promise<HooksSetupStatus>
  configure: (configDir?: string) => Promise<{ success: boolean; error?: string; backupPath?: string }>
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
  appendFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
  readFileBase64: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
  watch: (id: string, path: string) => Promise<{ success: boolean; error?: string }>
  unwatch: (id: string) => Promise<{ success: boolean }>
  onChange: (id: string, callback: (event: { eventType: string; filename: string | null }) => void) => () => void
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
  env?: Record<string, string>  // Environment variables for this agent
}

export type LayoutSizesData = {
  explorerWidth: number
  fileViewerSize: number
  userTerminalHeight: number
  diffPanelWidth: number
}

export type PanelVisibility = Record<string, boolean>

export type SessionData = {
  id: string
  name: string
  directory: string
  agentId?: string | null
  // New generic panel visibility
  panelVisibility?: PanelVisibility
  // Legacy fields for backwards compat
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
  toolbarPanels?: string[]
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
  appendFile: (path, content) => ipcRenderer.invoke('fs:appendFile', path, content),
  readFileBase64: (path) => ipcRenderer.invoke('fs:readFileBase64', path),
  exists: (path) => ipcRenderer.invoke('fs:exists', path),
  watch: (id, path) => ipcRenderer.invoke('fs:watch', id, path),
  unwatch: (id) => ipcRenderer.invoke('fs:unwatch', id),
  onChange: (id, callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { eventType: string; filename: string | null }) => callback(data)
    ipcRenderer.on(`fs:change:${id}`, handler)
    return () => ipcRenderer.removeListener(`fs:change:${id}`, handler)
  },
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

export type AppApi = {
  isDev: () => Promise<boolean>
}

export type MenuItemDef = {
  id: string
  label: string
  enabled?: boolean
  type?: 'separator'
}

export type MenuApi = {
  popup: (items: MenuItemDef[]) => Promise<string | null>
}

const appApi: AppApi = {
  isDev: () => ipcRenderer.invoke('app:isDev'),
}

const menuApi: MenuApi = {
  popup: (items) => ipcRenderer.invoke('menu:popup', items),
}

const hooksApi: HooksApi = {
  watch: (sessionId) => ipcRenderer.invoke('hooks:watch', sessionId),
  unwatch: (sessionId) => ipcRenderer.invoke('hooks:unwatch', sessionId),
  clear: (sessionId) => ipcRenderer.invoke('hooks:clear', sessionId),
  onEvent: (sessionId, callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: HookEvent) => callback(data)
    ipcRenderer.on(`hooks:event:${sessionId}`, handler)
    return () => ipcRenderer.removeListener(`hooks:event:${sessionId}`, handler)
  },
  checkSetup: (configDir) => ipcRenderer.invoke('hooks:checkSetup', configDir),
  configure: (configDir) => ipcRenderer.invoke('hooks:configure', configDir),
}

contextBridge.exposeInMainWorld('pty', ptyApi)
contextBridge.exposeInMainWorld('dialog', dialogApi)
contextBridge.exposeInMainWorld('fs', fsApi)
contextBridge.exposeInMainWorld('git', gitApi)
contextBridge.exposeInMainWorld('config', configApi)
contextBridge.exposeInMainWorld('app', appApi)
contextBridge.exposeInMainWorld('hooks', hooksApi)
contextBridge.exposeInMainWorld('menu', menuApi)

declare global {
  interface Window {
    pty: PtyApi
    dialog: DialogApi
    fs: FsApi
    git: GitApi
    config: ConfigApi
    app: AppApi
    hooks: HooksApi
    menu: MenuApi
  }
}
