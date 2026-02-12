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
  // Commit tracking
  hasHadCommits?: boolean
  // Archive state
  isArchived?: boolean
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

export type ProfileData = {
  id: string
  name: string
  color: string
}

export type ProfilesData = {
  profiles: ProfileData[]
  lastProfileId: string
}

export type MenuItemDef = {
  id: string
  label: string
  enabled?: boolean
  type?: 'separator'
}

export type TsProjectContext = {
  projectRoot: string
  compilerOptions: Record<string, unknown>
  files: { path: string; content: string }[]
}
