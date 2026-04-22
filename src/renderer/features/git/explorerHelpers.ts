/**
 * Display helpers for git file statuses in the Explorer panel.
 *
 * Provides pure functions that map git status strings (modified, added, deleted,
 * untracked, renamed) to human-readable labels, Tailwind CSS color classes, and
 * single-letter badges. Also includes helpers for splitting staged/unstaged files,
 * PR state badge styling, and error message truncation.
 */

/**
 * Returns a human-readable label for a git file status.
 */
export function statusLabel(status: string): string {
  switch (status) {
    case 'modified': return 'Modified'
    case 'added': return 'Added'
    case 'deleted': return 'Deleted'
    case 'untracked': return 'Untracked'
    case 'renamed': return 'Renamed'
    default: return status
  }
}

/**
 * Returns a CSS color class for a git file status.
 */
export function getStatusColor(status?: string): string {
  switch (status) {
    case 'modified': return 'text-yellow-400'
    case 'added': return 'text-green-400'
    case 'deleted': return 'text-red-400'
    case 'untracked': return 'text-gray-400'
    case 'renamed': return 'text-blue-400'
    default: return 'text-text-primary'
  }
}

/**
 * Returns the first letter of a status, uppercased, for use as a badge.
 */
export function statusBadgeLetter(status: string): string {
  return status.charAt(0).toUpperCase()
}

/**
 * Returns the CSS color class for a status badge.
 */
export function statusBadgeColor(status: string): string {
  switch (status) {
    case 'modified': return 'text-yellow-400'
    case 'added': return 'text-green-400'
    case 'deleted': return 'text-red-400'
    case 'untracked': return 'text-gray-400'
    case 'renamed': return 'text-blue-400'
    default: return 'text-text-secondary'
  }
}

/**
 * Truncates a commit error message for display, with optional expansion.
 */
export function truncateError(error: string, maxLength = 80): string {
  if (error.length <= maxLength) return error
  return `${error.slice(0, maxLength)  }...`
}

/**
 * Splits git file statuses into staged and unstaged lists.
 */
export function splitStagedFiles<T extends { staged: boolean }>(files: T[]): { staged: T[]; unstaged: T[] } {
  return {
    staged: files.filter(f => f.staged),
    unstaged: files.filter(f => !f.staged),
  }
}

/**
 * Determines if a PR status represents an open PR that can receive comments.
 */
export function isPrOpen(prState?: string): boolean {
  return prState === 'OPEN'
}

/**
 * Gets the display CSS classes for a PR state badge.
 */
export function prStateBadgeClass(state: string): string {
  switch (state) {
    case 'OPEN': return 'bg-green-500/20 text-green-400'
    case 'MERGED': return 'bg-purple-500/20 text-purple-400'
    default: return 'bg-red-500/20 text-red-400'
  }
}

/**
 * Canonical label and CSS classes for a BranchStatus value.
 * Used by both the sidebar chip and the source control banner so they
 * always display the same text and color for a given status.
 */
export const branchStatusBadge: Record<string, { label: string; classes: string }> = {
  pushed: { label: 'PUSHED', classes: 'bg-blue-500/20 text-blue-400' },
  empty: { label: 'EMPTY', classes: 'bg-gray-500/20 text-gray-400' },
  open: { label: 'PR OPEN', classes: 'bg-green-500/20 text-green-400' },
  feedback: { label: 'FEEDBACK', classes: 'bg-orange-500/20 text-orange-400' },
  failed: { label: 'FAILED', classes: 'bg-red-500/20 text-red-400' },
  merged: { label: 'MERGED', classes: 'bg-purple-500/20 text-purple-400' },
  closed: { label: 'CLOSED', classes: 'bg-red-500/20 text-red-400' },
}

/**
 * Badge derived directly from the GitHub PR state (OPEN/MERGED/CLOSED).
 * Used as a fallback when branchStatus hasn't caught up with the live PR data
 * (e.g. branch is still 'pushed' or 'in-progress' while gh pr view already
 * reports the PR).
 */
export const prStateBadge: Record<'OPEN' | 'MERGED' | 'CLOSED', { label: string; classes: string }> = {
  OPEN: { label: 'PR OPEN', classes: 'bg-green-500/20 text-green-400' },
  MERGED: { label: 'MERGED', classes: 'bg-purple-500/20 text-purple-400' },
  CLOSED: { label: 'CLOSED', classes: 'bg-red-500/20 text-red-400' },
}
