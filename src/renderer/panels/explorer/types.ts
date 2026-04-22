/**
 * Shared type definitions for the explorer panel and its sub-components.
 */
import type { FileEntry, GitFileStatus, GitStatusResult, SearchResult, ManagedRepo } from '../../../preload/index'
import type { ExplorerFilter, BranchStatus, StatusChip, Session } from '../../store/sessions'
import type { NavigationTarget } from '../../shared/utils/fileNavigation'

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
  sessionId?: string
  // Plan file
  planFilePath?: string | null
  // Branch status
  branchStatus?: BranchStatus
  statusChip?: StatusChip
  /** Trigger a PR-inclusive refresh of the active session's status. */
  onRefreshPr?: () => void
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
  suggestGitignore: boolean
  onDismissGitignore: () => void
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
