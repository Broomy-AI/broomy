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
export function truncateError(error: string, maxLength: number = 80): string {
  if (error.length <= maxLength) return error
  return error.slice(0, maxLength) + '...'
}

/**
 * Determines whether the "Push to main" button should be visible.
 */
export function shouldShowPushToMain(hasWriteAccess: boolean, allowPushToMain?: boolean): boolean {
  return hasWriteAccess && (allowPushToMain === true)
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
