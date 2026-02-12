import type { ManagedRepo, GitHubIssue } from '../../../preload/index'

export type View =
  | { type: 'home' }
  | { type: 'clone' }
  | { type: 'add-existing-repo' }
  | { type: 'new-branch'; repo: ManagedRepo; issue?: GitHubIssue }
  | { type: 'existing-branch'; repo: ManagedRepo }
  | { type: 'repo-settings'; repo: ManagedRepo }
  | { type: 'issues'; repo: ManagedRepo }
  | { type: 'review-prs'; repo: ManagedRepo }
  | { type: 'agent-picker'; directory: string; repoId?: string; repoName?: string }

export interface NewSessionDialogProps {
  onComplete: (directory: string, agentId: string | null, extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; name?: string; sessionType?: 'default' | 'review'; prNumber?: number; prTitle?: string; prUrl?: string; prBaseBranch?: string }) => void
  onCancel: () => void
}

export type BranchInfo = {
  name: string
  hasWorktree: boolean
  worktreePath?: string
  isRemote: boolean
}
