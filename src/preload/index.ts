import { contextBridge, ipcRenderer } from 'electron'

export type PtyApi = {
  create: (options: { id: string; cwd: string; command?: string; sessionId?: string; env?: Record<string, string> }) => Promise<{ id: string }>
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
  staged: boolean
  indexStatus: string
  workingDirStatus: string
}

export type GitStatusResult = {
  files: GitFileStatus[]
  ahead: number
  behind: number
  tracking: string | null
  current: string | null
}

export type SearchResult = {
  path: string
  name: string
  relativePath: string
  matchType: 'filename' | 'content'
  contentMatches: { line: number; text: string }[]
}

export type FsApi = {
  readDir: (path: string) => Promise<FileEntry[]>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
  appendFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
  readFileBase64: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
  mkdir: (path: string) => Promise<{ success: boolean; error?: string }>
  createFile: (path: string) => Promise<{ success: boolean; error?: string }>
  search: (directory: string, query: string) => Promise<SearchResult[]>
  watch: (id: string, path: string) => Promise<{ success: boolean; error?: string }>
  unwatch: (id: string) => Promise<{ success: boolean }>
  onChange: (id: string, callback: (event: { eventType: string; filename: string | null }) => void) => () => void
}

export type ManagedRepo = {
  id: string
  name: string
  remoteUrl: string
  rootDir: string
  defaultBranch: string
  defaultAgentId?: string  // Default agent for sessions in this repo
  reviewInstructions?: string  // Custom instructions for AI review generation
  allowPushToMain?: boolean  // Whether "Push to main" button is shown for this repo
}

export type GitHubIssue = {
  number: number
  title: string
  labels: string[]
  url: string
}

export type GitHubPrStatus = {
  number: number
  title: string
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  url: string
  headRefName: string
  baseRefName: string
} | null

export type GitHubPrComment = {
  id: number
  body: string
  path: string
  line: number | null
  side: 'LEFT' | 'RIGHT'
  author: string
  createdAt: string
  url: string
  inReplyToId?: number
}

export type GitHubPrForReview = {
  number: number
  title: string
  author: string
  url: string
  headRefName: string
  baseRefName: string
  labels: string[]
}

export type GitCommitInfo = {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
}

export type WorktreeInfo = {
  path: string
  branch: string
  head: string
}

export type GitApi = {
  getBranch: (path: string) => Promise<string>
  isGitRepo: (path: string) => Promise<boolean>
  status: (path: string) => Promise<GitStatusResult>
  diff: (repoPath: string, filePath?: string) => Promise<string>
  show: (repoPath: string, filePath: string, ref?: string) => Promise<string>
  stage: (repoPath: string, filePath: string) => Promise<{ success: boolean; error?: string }>
  stageAll: (repoPath: string) => Promise<{ success: boolean; error?: string }>
  unstage: (repoPath: string, filePath: string) => Promise<{ success: boolean; error?: string }>
  commit: (repoPath: string, message: string) => Promise<{ success: boolean; error?: string }>
  push: (repoPath: string) => Promise<{ success: boolean; error?: string }>
  pull: (repoPath: string) => Promise<{ success: boolean; error?: string }>
  clone: (url: string, targetDir: string) => Promise<{ success: boolean; error?: string }>
  worktreeAdd: (repoPath: string, worktreePath: string, branchName: string, baseBranch: string) => Promise<{ success: boolean; error?: string }>
  worktreeList: (repoPath: string) => Promise<WorktreeInfo[]>
  pushNewBranch: (repoPath: string, branchName: string) => Promise<{ success: boolean; error?: string }>
  defaultBranch: (repoPath: string) => Promise<string>
  remoteUrl: (repoPath: string) => Promise<string | null>
  branchChanges: (repoPath: string, baseBranch?: string) => Promise<{ files: { path: string; status: string }[]; baseBranch: string }>
  branchCommits: (repoPath: string, baseBranch?: string) => Promise<{ commits: GitCommitInfo[]; baseBranch: string }>
  commitFiles: (repoPath: string, commitHash: string) => Promise<{ path: string; status: string }[]>
  headCommit: (repoPath: string) => Promise<string | null>
  listBranches: (repoPath: string) => Promise<{ name: string; isRemote: boolean; current: boolean }[]>
  fetchBranch: (repoPath: string, branchName: string) => Promise<{ success: boolean; error?: string }>
  fetchPrHead: (repoPath: string, prNumber: number) => Promise<{ success: boolean; error?: string }>
  isMergedInto: (repoPath: string, ref: string) => Promise<boolean>
}

export type GhApi = {
  isInstalled: () => Promise<boolean>
  issues: (repoDir: string) => Promise<GitHubIssue[]>
  repoSlug: (repoDir: string) => Promise<string | null>
  prStatus: (repoDir: string) => Promise<GitHubPrStatus>
  hasWriteAccess: (repoDir: string) => Promise<boolean>
  mergeBranchToMain: (repoDir: string) => Promise<{ success: boolean; error?: string }>
  getPrCreateUrl: (repoDir: string) => Promise<string | null>
  prComments: (repoDir: string, prNumber: number) => Promise<GitHubPrComment[]>
  replyToComment: (repoDir: string, prNumber: number, commentId: number, body: string) => Promise<{ success: boolean; error?: string }>
  prsToReview: (repoDir: string) => Promise<GitHubPrForReview[]>
  submitDraftReview: (repoDir: string, prNumber: number, comments: { path: string; line: number; body: string }[]) => Promise<{ success: boolean; reviewId?: number; error?: string }>
}

export type ReposApi = {
  getInitScript: (repoId: string, profileId?: string) => Promise<string | null>
  saveInitScript: (repoId: string, script: string, profileId?: string) => Promise<{ success: boolean; error?: string }>
}

export type ShellApi = {
  exec: (command: string, cwd: string) => Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>
  openExternal: (url: string) => Promise<void>
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
  reviewPanelWidth: number
}

export type PanelVisibility = Record<string, boolean>

export type SessionData = {
  id: string
  name: string
  directory: string
  agentId?: string | null
  repoId?: string
  issueNumber?: number
  issueTitle?: string
  // Review session fields
  sessionType?: 'default' | 'review'
  prNumber?: number
  prTitle?: string
  prUrl?: string
  prBaseBranch?: string
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
  explorerFilter?: 'all' | 'changed' | 'files' | 'source-control' | 'search' | 'recent'
  terminalTabs?: unknown
  // Push to main tracking
  pushedToMainAt?: number
  pushedToMainCommit?: string
  // Branch status PR tracking
  lastKnownPrState?: 'OPEN' | 'MERGED' | 'CLOSED' | null
  lastKnownPrNumber?: number
  lastKnownPrUrl?: string
}

export type ConfigData = {
  agents: AgentData[]
  sessions: SessionData[]
  showSidebar?: boolean
  sidebarWidth?: number
  toolbarPanels?: string[]
  repos?: ManagedRepo[]
  defaultCloneDir?: string
  profileId?: string
}

export type ConfigApi = {
  load: (profileId?: string) => Promise<ConfigData>
  save: (config: ConfigData) => Promise<{ success: boolean; error?: string }>
}

export type ProfileData = {
  id: string
  name: string
  color: string
}

export type ProfilesData = {
  profiles: ProfileData[]
  lastProfileId: string
}

export type ProfilesApi = {
  list: () => Promise<ProfilesData>
  save: (data: ProfilesData) => Promise<{ success: boolean; error?: string }>
  openWindow: (profileId: string) => Promise<{ success: boolean; alreadyOpen: boolean }>
  getOpenProfiles: () => Promise<string[]>
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
  mkdir: (path) => ipcRenderer.invoke('fs:mkdir', path),
  createFile: (path) => ipcRenderer.invoke('fs:createFile', path),
  search: (directory, query) => ipcRenderer.invoke('fs:search', directory, query),
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
  stage: (repoPath, filePath) => ipcRenderer.invoke('git:stage', repoPath, filePath),
  stageAll: (repoPath) => ipcRenderer.invoke('git:stageAll', repoPath),
  unstage: (repoPath, filePath) => ipcRenderer.invoke('git:unstage', repoPath, filePath),
  commit: (repoPath, message) => ipcRenderer.invoke('git:commit', repoPath, message),
  push: (repoPath) => ipcRenderer.invoke('git:push', repoPath),
  pull: (repoPath) => ipcRenderer.invoke('git:pull', repoPath),
  clone: (url, targetDir) => ipcRenderer.invoke('git:clone', url, targetDir),
  worktreeAdd: (repoPath, worktreePath, branchName, baseBranch) => ipcRenderer.invoke('git:worktreeAdd', repoPath, worktreePath, branchName, baseBranch),
  worktreeList: (repoPath) => ipcRenderer.invoke('git:worktreeList', repoPath),
  pushNewBranch: (repoPath, branchName) => ipcRenderer.invoke('git:pushNewBranch', repoPath, branchName),
  defaultBranch: (repoPath) => ipcRenderer.invoke('git:defaultBranch', repoPath),
  remoteUrl: (repoPath) => ipcRenderer.invoke('git:remoteUrl', repoPath),
  branchChanges: (repoPath, baseBranch) => ipcRenderer.invoke('git:branchChanges', repoPath, baseBranch),
  branchCommits: (repoPath, baseBranch) => ipcRenderer.invoke('git:branchCommits', repoPath, baseBranch),
  commitFiles: (repoPath, commitHash) => ipcRenderer.invoke('git:commitFiles', repoPath, commitHash),
  headCommit: (repoPath) => ipcRenderer.invoke('git:headCommit', repoPath),
  listBranches: (repoPath) => ipcRenderer.invoke('git:listBranches', repoPath),
  fetchBranch: (repoPath, branchName) => ipcRenderer.invoke('git:fetchBranch', repoPath, branchName),
  fetchPrHead: (repoPath, prNumber) => ipcRenderer.invoke('git:fetchPrHead', repoPath, prNumber),
  isMergedInto: (repoPath, ref) => ipcRenderer.invoke('git:isMergedInto', repoPath, ref),
}

const ghApi: GhApi = {
  isInstalled: () => ipcRenderer.invoke('gh:isInstalled'),
  issues: (repoDir) => ipcRenderer.invoke('gh:issues', repoDir),
  repoSlug: (repoDir) => ipcRenderer.invoke('gh:repoSlug', repoDir),
  prStatus: (repoDir) => ipcRenderer.invoke('gh:prStatus', repoDir),
  hasWriteAccess: (repoDir) => ipcRenderer.invoke('gh:hasWriteAccess', repoDir),
  mergeBranchToMain: (repoDir) => ipcRenderer.invoke('gh:mergeBranchToMain', repoDir),
  getPrCreateUrl: (repoDir) => ipcRenderer.invoke('gh:getPrCreateUrl', repoDir),
  prComments: (repoDir, prNumber) => ipcRenderer.invoke('gh:prComments', repoDir, prNumber),
  replyToComment: (repoDir, prNumber, commentId, body) => ipcRenderer.invoke('gh:replyToComment', repoDir, prNumber, commentId, body),
  prsToReview: (repoDir) => ipcRenderer.invoke('gh:prsToReview', repoDir),
  submitDraftReview: (repoDir, prNumber, comments) => ipcRenderer.invoke('gh:submitDraftReview', repoDir, prNumber, comments),
}

const reposApi: ReposApi = {
  getInitScript: (repoId, profileId?) => ipcRenderer.invoke('repos:getInitScript', repoId, profileId),
  saveInitScript: (repoId, script, profileId?) => ipcRenderer.invoke('repos:saveInitScript', repoId, script, profileId),
}

const shellApi: ShellApi = {
  exec: (command, cwd) => ipcRenderer.invoke('shell:exec', command, cwd),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
}

const configApi: ConfigApi = {
  load: (profileId?) => ipcRenderer.invoke('config:load', profileId),
  save: (config) => ipcRenderer.invoke('config:save', config),
}

const profilesApi: ProfilesApi = {
  list: () => ipcRenderer.invoke('profiles:list'),
  save: (data) => ipcRenderer.invoke('profiles:save', data),
  openWindow: (profileId) => ipcRenderer.invoke('profiles:openWindow', profileId),
  getOpenProfiles: () => ipcRenderer.invoke('profiles:getOpenProfiles'),
}

export type AppApi = {
  isDev: () => Promise<boolean>
  homedir: () => Promise<string>
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
  homedir: () => ipcRenderer.invoke('app:homedir'),
}

const menuApi: MenuApi = {
  popup: (items) => ipcRenderer.invoke('menu:popup', items),
}


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
  }
}
