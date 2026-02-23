import type { FileEntry, GitFileStatus, GitStatusResult, SearchResult, ManagedRepo } from '../../../preload/index'
import type { ExplorerFilter, BranchStatus, PrState, Session } from '../../store/sessions'
import type { NavigationTarget } from '../../utils/fileNavigation'

// PR comment type from GitHub API
export type PrComment = {
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

export interface ExplorerProps {
  directory?: string
  onFileSelect?: (target: NavigationTarget) => void
  selectedFilePath?: string | null
  gitStatus?: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  filter: ExplorerFilter
  onFilterChange: (filter: ExplorerFilter) => void
  onGitStatusRefresh?: () => void
  recentFiles?: string[]
  // Push to main tracking
  sessionId?: string
  pushedToMainAt?: number
  pushedToMainCommit?: string
  onRecordPushToMain?: (commitHash: string) => void
  onClearPushToMain?: () => void
  // Plan file
  planFilePath?: string | null
  // Branch status
  branchStatus?: BranchStatus
  onUpdatePrState?: (prState: PrState, prNumber?: number, prUrl?: string) => void
  repoId?: string
  agentPtyId?: string
  // Review tab data
  session?: Session
  repo?: ManagedRepo
  // Issue plan
  issueNumber?: number
  issueTitle?: string
  issueUrl?: string
  issuePlanExists?: boolean
}

export interface TreeNode extends FileEntry {
  children?: TreeNode[]
  isExpanded?: boolean
}

export interface SearchTreeNode {
  name: string
  path: string
  children: SearchTreeNode[]
  results: SearchResult[]
}
