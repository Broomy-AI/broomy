/**
 * Derives a session's PR review state from GitHub review counts and the repo's
 * approval policy. Kept separate from branchStatus so the counts→state mapping is
 * unit-testable and free of git-state concerns.
 *
 * - 'one': the threshold is met once at least one requested reviewer approves.
 * - 'all': the threshold is met only when every requested reviewer has approved
 *   (no reviewer still pending, no non-approving submitted review).
 */
export type ReviewState = 'none' | 'waiting' | 'approved'

export interface PrApprovalStatus {
  /** Reviewers whose latest submitted review is APPROVED (and not re-requested). */
  approved: number
  /** Requested reviewers who have not yet submitted a review. */
  pending: number
  /** Reviewers whose latest submitted review is not APPROVED (changes/comments). */
  otherReviews: number
}

export function computeReviewState(a: PrApprovalStatus, policy: 'one' | 'all'): ReviewState {
  const total = a.approved + a.pending + a.otherReviews
  if (total === 0) return 'none'
  if (policy === 'all') {
    return a.approved >= 1 && a.pending === 0 && a.otherReviews === 0 ? 'approved' : 'waiting'
  }
  return a.approved >= 1 ? 'approved' : 'waiting'
}
