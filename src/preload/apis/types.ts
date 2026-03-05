/**
 * Shared type definitions for all preload APIs.
 */
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
  isMerging?: boolean
  hasConflicts?: boolean
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
  isolated?: boolean         // Run sessions in this repo inside a dev container
  skipApproval?: boolean     // Auto-approve agent commands when isolated
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

export type GitHubReaction = {
  content: string
  count: number
}

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
  reactions?: GitHubReaction[]
}

export type GitHubIssueComment = {
  id: number
  body: string
  author: string
  createdAt: string
  url: string
  reactions?: GitHubReaction[]
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
  pushed?: boolean
}

export type WorktreeInfo = {
  path: string
  branch: string
  head: string
}

export type ShellOption = {
  path: string       // Executable path or name used to spawn the shell
  name: string       // Human-readable label shown in the UI
  isDefault: boolean // Whether this is the current system default
}

export type AgentData = {
  id: string
  name: string
  command: string
  color?: string
  env?: Record<string, string>  // Environment variables for this agent
  skipApprovalFlag?: string    // Free-text flag to append for auto-approval (e.g. "--dangerously-skip-permissions")
  resumeCommand?: string       // In-session command to resume previous conversation (e.g. "/resume")
}

export type DockerStatus = {
  available: boolean
  error?: string
  installUrl?: string
}

export type ContainerInfo = {
  containerId: string
  status: 'running' | 'stopped' | 'starting'
  image: string
  repoDir: string
}

export type DevcontainerStatus = {
  available: boolean
  error?: string
  version?: string
}

export type DevcontainerConfigStatus = {
  hasConfig: boolean
}

export type LayoutSizesData = {
  explorerWidth: number
  fileViewerSize: number
  userTerminalHeight: number
  diffPanelWidth: number
  tutorialPanelWidth: number
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
  issueUrl?: string
  // Review session fields
  sessionType?: 'default' | 'review'
  prNumber?: number
  prTitle?: string
  prUrl?: string
  prBaseBranch?: string
  // New generic panel visibility
  panelVisibility?: PanelVisibility
  // Legacy fields for backwards compat
  showExplorer?: boolean
  showFileViewer?: boolean
  showDiff?: boolean
  fileViewerPosition?: 'top' | 'left'
  layoutSizes?: LayoutSizesData
  explorerFilter?: 'all' | 'changed' | 'files' | 'source-control' | 'search' | 'recent' | 'review'
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
  defaultShell?: string
  profileId?: string
  tutorialProgress?: {
    completedSteps: string[]
  }
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

export type CrashReport = {
  timestamp: string
  message: string
  stack: string | null
  electronVersion: string
  appVersion: string
  platform: string
  processType: 'main' | 'renderer'
}
