/**
 * Shared type definitions for the explorer panel and its sub-components.
 */
import type { FileEntry, GitFileStatus, GitStatusResult, SearchResult, ManagedRepo } from '../../../preload/index'
import type { ExplorerFilter, BranchStatus, PrState, Session } from '../../store/sessions'
import type { NavigationTarget } from '../../utils/fileNavigation'

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
