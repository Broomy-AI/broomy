/**
 * Shared type definitions for the explorer panel and its sub-components.
 */
import type { FileEntry, GitFileStatus, GitStatusResult, SearchResult, ManagedRepo } from '../../../preload/index'
import type { ExplorerFilter, BranchStatus, PrState, StatusChip, Session } from '../../store/sessions'
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
  onUpdatePrState?: (prState: PrState, prNumber?: number, prUrl?: string) => void
  onUpdateFeedbackStatus?: (hasFeedback: boolean) => void
  onUpdateChecksStatus?: (checksStatus: 'passed' | 'failed' | 'pending' | 'none') => void
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
