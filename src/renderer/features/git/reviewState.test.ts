import { describe, it, expect } from 'vitest'
import { computeReviewState, type PrApprovalStatus } from './reviewState'

function counts(o: Partial<PrApprovalStatus> = {}): PrApprovalStatus {
  return { approved: 0, pending: 0, otherReviews: 0, ...o }
}

describe('computeReviewState', () => {
  it('returns none when no reviewers are involved', () => {
    expect(computeReviewState(counts(), 'one')).toBe('none')
    expect(computeReviewState(counts(), 'all')).toBe('none')
  })

  it('one-policy: waiting when requested but no approval yet', () => {
    expect(computeReviewState(counts({ pending: 2 }), 'one')).toBe('waiting')
  })

  it('one-policy: approved once at least one approves', () => {
    expect(computeReviewState(counts({ approved: 1, pending: 1 }), 'one')).toBe('approved')
  })

  it('all-policy: waiting while any reviewer is still pending', () => {
    expect(computeReviewState(counts({ approved: 1, pending: 1 }), 'all')).toBe('waiting')
  })

  it('all-policy: waiting when a reviewer left a non-approving review', () => {
    expect(computeReviewState(counts({ approved: 1, otherReviews: 1 }), 'all')).toBe('waiting')
  })

  it('all-policy: approved only when everyone approved and none pending', () => {
    expect(computeReviewState(counts({ approved: 2 }), 'all')).toBe('approved')
  })
})
