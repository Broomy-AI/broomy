/**
 * Preload script: context bridge API definitions and IPC wiring.
 *
 * Defines TypeScript types for every API surface the renderer can access
 * (PTY, filesystem, git, GitHub CLI, config, profiles, shell, dialog, menu,
 * agents, and TypeScript project context), then creates implementation objects
 * that delegate each call to `ipcRenderer.invoke()` or `ipcRenderer.on()`.
 * These objects are exposed on the global `window` via
 * `contextBridge.exposeInMainWorld()`, and the file ends with a `declare global`
 * block that augments the Window interface so the renderer gets full type
 * safety without importing anything from this file.
 */
import { contextBridge, ipcRenderer } from 'electron'

// Re-export all types so existing imports from '../../preload/index' still work
export type { FileEntry, GitFileStatus, GitStatusResult, SearchResult, ManagedRepo, GitHubIssue, GitHubPrStatus, GitHubPrComment, GitHubPrForReview, GitHubReaction, GitCommitInfo, WorktreeInfo, AgentData, LayoutSizesData, PanelVisibility, SessionData, ConfigData, ProfileData, ProfilesData, MenuItemDef, TsProjectContext, ShellOption, CrashReport, DockerStatus, ContainerInfo, DevcontainerStatus, DevcontainerConfigStatus } from './apis/types'
export type { PtyApi, DevcontainerReadyEvent } from './apis/pty'
export type { FsApi } from './apis/fs'
export type { GitApi } from './apis/git'
export type { GhApi } from './apis/gh'
export type { ConfigApi, ProfilesApi, AgentsApi, ReposApi } from './apis/config'
export type { ShellApi, DialogApi, AppApi, UpdateApi, UpdateCheckResult, WindowControlsApi } from './apis/shell'
export type { MenuApi, TsApi } from './apis/menu'
export type { DevcontainerApi } from './apis/devcontainer'

export type HelpMenuEvent = 'getting-started' | 'shortcuts' | 'reset-tutorial'

export type HelpApi = {
  onHelpMenu: (callback: (event: HelpMenuEvent) => void) => () => void
}

const helpApi: HelpApi = {
  onHelpMenu: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, menuEvent: HelpMenuEvent) => callback(menuEvent)
    ipcRenderer.on('help:menu', handler)
    return () => ipcRenderer.removeListener('help:menu', handler)
  },
}

// Import types for Window interface augmentation
import type { PtyApi } from './apis/pty'
import type { FsApi } from './apis/fs'
import type { GitApi } from './apis/git'
import type { GhApi } from './apis/gh'
import type { ConfigApi, ProfilesApi, AgentsApi, ReposApi } from './apis/config'
import type { ShellApi, DialogApi, AppApi, UpdateApi, WindowControlsApi } from './apis/shell'
import type { MenuApi, TsApi } from './apis/menu'
import type { DevcontainerApi } from './apis/devcontainer'

// Import API implementations
import { ptyApi } from './apis/pty'
import { fsApi } from './apis/fs'
import { gitApi } from './apis/git'
import { ghApi } from './apis/gh'
import { configApi, profilesApi, agentsApi, reposApi } from './apis/config'
import { shellApi, dialogApi, appApi, updateApi, windowControlsApi } from './apis/shell'
import { menuApi, tsApi } from './apis/menu'
import { devcontainerApi } from './apis/devcontainer'

// Forward menu:select-all from main process to a DOM CustomEvent
ipcRenderer.on('menu:select-all', () => {
  window.dispatchEvent(new CustomEvent('app:select-all'))
})

// Expose all APIs to the renderer process via context bridge
contextBridge.exposeInMainWorld('pty', ptyApi)
contextBridge.exposeInMainWorld('dialog', dialogApi)
contextBridge.exposeInMainWorld('fs', fsApi)
contextBridge.exposeInMainWorld('git', gitApi)
contextBridge.exposeInMainWorld('config', configApi)
contextBridge.exposeInMainWorld('app', appApi)

contextBridge.exposeInMainWorld('menu', menuApi)
contextBridge.exposeInMainWorld('gh', ghApi)
contextBridge.exposeInMainWorld('repos', reposApi)
contextBridge.exposeInMainWorld('shell', shellApi)
contextBridge.exposeInMainWorld('profiles', profilesApi)
contextBridge.exposeInMainWorld('agents', agentsApi)
contextBridge.exposeInMainWorld('ts', tsApi)
contextBridge.exposeInMainWorld('help', helpApi)
contextBridge.exposeInMainWorld('update', updateApi)
contextBridge.exposeInMainWorld('devcontainer', devcontainerApi)
contextBridge.exposeInMainWorld('windowControls', windowControlsApi)

declare global {
  interface Window {
    pty: PtyApi
    dialog: DialogApi
    fs: FsApi
    git: GitApi
    config: ConfigApi
    app: AppApi

    menu: MenuApi
    gh: GhApi
    repos: ReposApi
    shell: ShellApi
    profiles: ProfilesApi
    agents: AgentsApi
    ts: TsApi
    help: HelpApi
    update: UpdateApi
    devcontainer: DevcontainerApi
    windowControls: WindowControlsApi
  }
}
