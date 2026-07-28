/**
 * Single source of truth for the badge shown for a session's PR/branch status.
 * Both the sidebar SessionCard and the source-control banner call this so they can
 * never disagree. Prefers the derived statusChip when it is PR-aware; otherwise
 * falls back to the live PR state (used before git polling recomputes the chip).
 */
import type { BranchStatus, StatusChip, PrState } from './branchStatus'
import { branchStatusBadge, prStateBadge } from './explorerHelpers'

const PR_AWARE_CHIPS: StatusChip[] = [
  'open', 'merged', 'closed', 'feedback', 'failed', 'waiting', 'approved',
]

export function deriveDisplayedChip(
  statusChip: StatusChip | undefined,
  branchStatus: BranchStatus | undefined,
  prState?: PrState,
): { label: string; classes: string } | null {
  const chipKey = statusChip ?? branchStatus
  const chipBadge = chipKey ? branchStatusBadge[chipKey] : undefined
  const isPrAware = chipKey !== undefined && PR_AWARE_CHIPS.includes(chipKey as StatusChip)
  if (isPrAware && chipBadge) return chipBadge
  if (prState) return prStateBadge[prState]
  return chipBadge ?? null
}
