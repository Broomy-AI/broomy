/**
 * Branch status computation from git state and persisted PR information.
 *
 * Implements a priority-based rule chain that maps a combination of local git
 * state (uncommitted files, ahead count, tracking branch, merge status) and
 * persisted PR state into one of six statuses: in-progress, pushed, empty, open,
 * merged, or closed. Persisted PR state is checked before the empty-branch
 * heuristic so that a known merged/closed/open PR is never misclassified when
 * the `hasHadCommits` sticky flag was missed (e.g. session was inactive during
 * the commit-and-merge cycle).
 */
export type BranchStatus = 'in-progress' | 'pushed' | 'empty' | 'open' | 'merged' | 'closed'

export type PrState = 'OPEN' | 'MERGED' | 'CLOSED' | null

/**
 * Status chip value displayed in both the sidebar and source control panel.
 * This is the single source of truth for the session's visual status.
 *
 * - 'in-progress' | 'pushed' | 'empty' | 'merged' | 'closed': from branch status
 * - 'open': PR is open with no actionable feedback or CI failure
 * - 'feedback': PR has requested changes or new comments since last push
 * - 'failed': PR's CI checks have failed
 */
export type StatusChip = BranchStatus | 'feedback' | 'failed'

export interface BranchStatusInput {
  // From git status polling
  uncommittedFiles: number
  ahead: number
  hasTrackingBranch: boolean
  isOnMainBranch: boolean
  // Git-native merge detection
  isMergedToMain: boolean
  // Persisted session state
  hasHadCommits: boolean
  lastKnownPrState: PrState | undefined
}

export function computeBranchStatus(input: BranchStatusInput): BranchStatus {
  const {
    uncommittedFiles,
    ahead,
    hasTrackingBranch,
    isOnMainBranch,
    isMergedToMain,
    hasHadCommits,
    lastKnownPrState,
  } = input

  const hasLocalWork = uncommittedFiles > 0 || ahead > 0

  // 1. On main branch -> always in-progress
  if (isOnMainBranch) {
    return 'in-progress'
  }

  // 2. Git-native merge check — authoritative, but only when the branch is
  //    currently clean. If the user has resumed work on a merged branch,
  //    that work takes priority (handled below in rule 4).
  if (isMergedToMain && hasHadCommits && hasTrackingBranch && !hasLocalWork) {
    return 'merged'
  }

  // 3. Open PR dominates local "in-progress" state: while the user iterates on
  //    their branch with unpushed commits, they still want to see that the PR
  //    exists. The PR is the shared artifact; local uncommitted work is private.
  if (lastKnownPrState === 'OPEN') return 'open'

  // 4. Has uncommitted changes or commits ahead of remote -> in-progress
  if (hasLocalWork) {
    return 'in-progress'
  }

  // 5. Persisted PR state for terminal states (OPEN already handled above).
  //    Checked before empty-branch so a merged PR isn't misclassified as "empty"
  //    when hasHadCommits was missed (e.g. session inactive during the cycle).
  if (lastKnownPrState === 'MERGED') return 'merged'
  if (lastKnownPrState === 'CLOSED') return 'closed'

  // 6. Fresh branch with tracking: isMergedToMain is true because there are 0 commits
  // ahead of main, but there were never any commits — this is an empty/fresh branch.
  if (isMergedToMain && !hasHadCommits && hasTrackingBranch) {
    return 'empty'
  }

  // 7. Has remote tracking branch, no PR -> pushed
  if (hasTrackingBranch) {
    return 'pushed'
  }

  // 8. Default
  return 'in-progress'
}

/**
 * Single function that computes the status chip value from branch status + PR metadata.
 * Used by both the sidebar and the source control panel to guarantee consistency.
 *
 * Priority: feedback > failed > base branch status
 * (feedback and failed only apply when the PR is open)
 */
export function computeStatusChip(
  branchStatus: BranchStatus,
  hasFeedback: boolean,
  checksStatus: 'passed' | 'failed' | 'pending' | 'none',
): StatusChip {
  if (branchStatus === 'open') {
    if (hasFeedback) return 'feedback'
    if (checksStatus === 'failed') return 'failed'
  }
  return branchStatus
}
