export type BranchStatus = 'in-progress' | 'pushed' | 'open' | 'merged' | 'closed'

export type PrState = 'OPEN' | 'MERGED' | 'CLOSED' | null

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

  // 1. On main branch -> always in-progress
  if (isOnMainBranch) {
    return 'in-progress'
  }

  // 2. Has uncommitted changes or commits ahead of remote -> in-progress
  if (uncommittedFiles > 0 || ahead > 0) {
    return 'in-progress'
  }

  // 3. Git-native merge check (works for UI push, terminal push, and GitHub PR merge)
  // Require both hasHadCommits and hasTrackingBranch to avoid false positives:
  // a fresh branch with no commits also has 0 commits ahead of main, which the git
  // check interprets as "merged". The app pushes branches upstream on creation,
  // so hasTrackingBranch alone is insufficient.
  if (isMergedToMain && hasHadCommits && hasTrackingBranch) {
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
