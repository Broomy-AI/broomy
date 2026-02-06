export type BranchStatus = 'in-progress' | 'pushed' | 'open' | 'merged' | 'closed'

export type PrState = 'OPEN' | 'MERGED' | 'CLOSED' | null

export interface BranchStatusInput {
  // From git status polling
  uncommittedFiles: number
  ahead: number
  hasTrackingBranch: boolean
  isOnMainBranch: boolean
  currentHeadCommit: string | null
  // Persisted PR state
  lastKnownPrState: PrState | undefined
  // Direct push-to-main tracking
  pushedToMainCommit: string | undefined
}

export function computeBranchStatus(input: BranchStatusInput): BranchStatus {
  const {
    uncommittedFiles,
    ahead,
    hasTrackingBranch,
    isOnMainBranch,
    currentHeadCommit,
    lastKnownPrState,
    pushedToMainCommit,
  } = input

  // 1. On main branch -> always in-progress
  if (isOnMainBranch) {
    return 'in-progress'
  }

  // 2. Has uncommitted changes or commits ahead of remote -> in-progress
  if (uncommittedFiles > 0 || ahead > 0) {
    return 'in-progress'
  }

  // 3. Pushed to main and HEAD matches -> merged
  if (pushedToMainCommit && currentHeadCommit && pushedToMainCommit === currentHeadCommit) {
    return 'merged'
  }

  // 4. Check persisted PR state
  if (lastKnownPrState === 'MERGED') return 'merged'
  if (lastKnownPrState === 'CLOSED') return 'closed'
  if (lastKnownPrState === 'OPEN') return 'open'

  // 5. Has remote tracking branch, no PR -> pushed
  if (hasTrackingBranch) {
    return 'pushed'
  }

  // 6. Default
  return 'in-progress'
}
