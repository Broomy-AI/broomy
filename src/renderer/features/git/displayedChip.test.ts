import { describe, it, expect } from 'vitest'
import { deriveDisplayedChip } from './displayedChip'
import { branchStatusBadge, prStateBadge } from './explorerHelpers'

describe('deriveDisplayedChip', () => {
  it('returns null for in-progress (no badge, no PR)', () => {
    expect(deriveDisplayedChip('in-progress', 'in-progress', null)).toBeNull()
  })

  it('uses the chip badge for a PR-aware chip', () => {
    expect(deriveDisplayedChip('waiting', 'open', 'OPEN')).toEqual(branchStatusBadge.waiting)
    expect(deriveDisplayedChip('approved', 'open', 'OPEN')).toEqual(branchStatusBadge.approved)
  })

  it('falls back to the live PR state when the chip has not caught up', () => {
    // branch still "pushed", but gh already reports an OPEN PR
    expect(deriveDisplayedChip('pushed', 'pushed', 'OPEN')).toEqual(prStateBadge.OPEN)
  })

  it('returns the chip badge when there is no PR state', () => {
    expect(deriveDisplayedChip('open', 'open', undefined)).toEqual(branchStatusBadge.open)
  })
})
