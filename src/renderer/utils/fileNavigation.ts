/**
 * File navigation state machine for handling dirty-file checks and pending navigation.
 *
 * When the user navigates to a file, this module determines the correct action:
 * update scroll/highlight if it is the same file, navigate immediately if the file
 * viewer is clean, or queue a pending navigation if the viewer has unsaved changes
 * (prompting the user to save, discard, or cancel). Supports diff-mode parameters
 * including base/current refs and labels.
 */

export interface NavigationTarget {
  filePath: string
  openInDiffMode: boolean
  scrollToLine?: number
  searchHighlight?: string
  diffBaseRef?: string
  diffCurrentRef?: string
  diffLabel?: string
}

export interface NavigationState {
  openFileInDiffMode: boolean
  scrollToLine?: number
  searchHighlight?: string
  diffBaseRef?: string
  diffCurrentRef?: string
  diffLabel?: string
}

export type NavigationResult =
  | { action: 'update-scroll'; state: NavigationState }
  | { action: 'navigate'; state: NavigationState; filePath: string }
  | { action: 'pending'; target: NavigationTarget }

/**
 * Determine what action to take when navigating to a file.
 *
 * - Same file: update scroll/highlight only
 * - Clean file viewer: navigate immediately
 * - Dirty file viewer: set pending navigation (user must save/discard/cancel)
 */
export function resolveNavigation(
  target: NavigationTarget,
  currentFilePath: string | null,
  isFileViewerDirty: boolean,
): NavigationResult {
  const state: NavigationState = {
    openFileInDiffMode: target.openInDiffMode,
    scrollToLine: target.scrollToLine,
    searchHighlight: target.searchHighlight,
    diffBaseRef: target.diffBaseRef,
    diffCurrentRef: target.diffCurrentRef,
    diffLabel: target.diffLabel,
  }

  // Same file — just update scroll/highlight
  if (target.filePath === currentFilePath) {
    return { action: 'update-scroll', state }
  }

  // Dirty file viewer — queue pending navigation
  if (isFileViewerDirty) {
    return { action: 'pending', target }
  }

  // Clean — navigate immediately
  return { action: 'navigate', state, filePath: target.filePath }
}

/**
 * Apply a pending navigation after save or discard.
 */
export function applyPendingNavigation(
  pending: NavigationTarget,
): { state: NavigationState; filePath: string } {
  return {
    state: {
      openFileInDiffMode: pending.openInDiffMode,
      scrollToLine: pending.scrollToLine,
      searchHighlight: pending.searchHighlight,
      diffBaseRef: pending.diffBaseRef,
      diffCurrentRef: pending.diffCurrentRef,
      diffLabel: pending.diffLabel,
    },
    filePath: pending.filePath,
  }
}
