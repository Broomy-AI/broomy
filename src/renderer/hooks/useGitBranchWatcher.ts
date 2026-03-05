/**
 * Watches the git directory for HEAD changes in the active session only to
 * detect branch switches without polling.
 *
 * Only one watcher is open at a time (for the active session). When the active
 * session changes, the old watcher is torn down and a new one is created. A
 * one-time getBranch() call is made on switch to catch changes that happened
 * while the session wasn't being watched.
 *
 * Handles both regular repos (.git is a directory) and worktrees (.git is a
 * file pointing to the real git dir). Silently skips sessions where the git
 * directory can't be determined or watched.
 */
import { useEffect } from 'react'
import type { Session } from '../store/sessions'

interface UseGitBranchWatcherArgs {
  sessions: Session[]
  activeSessionId: string | null
  updateSessionBranch: (id: string, branch: string) => void
}

/**
 * Resolve the actual git directory to watch.
 * - Regular repo: .git is a directory → watch it directly
 * - Worktree: .git is a file containing "gitdir: <path>" → watch that path
 * - Missing: returns null
 */
async function resolveGitDir(sessionDir: string): Promise<string | null> {
  const dotGit = `${sessionDir}/.git`

  // Check if .git exists at all
  const exists = await window.fs.exists(dotGit)
  if (!exists) return null

  // Try reading .git as a file (worktree case)
  try {
    const content = await window.fs.readFile(dotGit)
    // Worktree .git files contain: "gitdir: /absolute/path/to/.git/worktrees/name"
    const match = /^gitdir:\s*(.+)$/.exec(content.trim())
    if (match?.[1]) {
      const gitDir = match[1]
      const gitDirExists = await window.fs.exists(gitDir)
      return gitDirExists ? gitDir : null
    }
  } catch {
    // readFile failed → .git is a directory (normal repo), use it directly
  }

  return dotGit
}

export function useGitBranchWatcher({ sessions, activeSessionId, updateSessionBranch }: UseGitBranchWatcherArgs) {
  const activeSession = sessions.find(s => s.id === activeSessionId && !s.isArchived)
  const activeDir = activeSession?.directory
  const activeBranch = activeSession?.branch

  useEffect(() => {
    if (!activeSession || !activeDir || !activeSessionId) return

    const watcherId = `git-head-${activeSessionId}`
    let cancelled = false
    let removeListener: (() => void) | null = null
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    // Track the last known branch in a mutable variable to avoid stale closure
    let lastKnownBranch = activeBranch

    // One-time branch refresh to catch changes while unwatched
    void (async () => {
      try {
        const branch = await window.git.getBranch(activeDir)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- checked after await
        if (!cancelled && branch !== lastKnownBranch) {
          lastKnownBranch = branch
          updateSessionBranch(activeSessionId, branch)
        }
      } catch {
        // Ignore errors (e.g. directory deleted)
      }
    })()

    const setup = async () => {
      const gitDir = await resolveGitDir(activeDir)
      if (!gitDir || cancelled) return

      // Register listener before watching (synchronous)
      removeListener = window.fs.onChange(watcherId, (event) => {
        if (event.filename && event.filename !== 'HEAD') return

        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          void (async () => {
            try {
              const branch = await window.git.getBranch(activeDir)
              if (branch !== lastKnownBranch) {
                lastKnownBranch = branch
                updateSessionBranch(activeSessionId, branch)
              }
            } catch {
              // Ignore errors (e.g. directory deleted)
            }
          })()
        }, 300)
      })

      const result = await window.fs.watch(watcherId, gitDir)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled may change during async iteration
      if (cancelled) {
        removeListener()
        removeListener = null
        if (result.success) void window.fs.unwatch(watcherId)
        return
      }

      if (!result.success) {
        removeListener()
        removeListener = null
      }
    }

    void setup()

    return () => {
      cancelled = true
      if (removeListener) removeListener()
      void window.fs.unwatch(watcherId)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [activeSessionId, activeDir, updateSessionBranch])
}
