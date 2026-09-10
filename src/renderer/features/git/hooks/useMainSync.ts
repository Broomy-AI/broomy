/**
 * Per-repo "keep `main/` current" action (#170). Exposes the single `syncMain(repoId)` shared by the
 * auto-sync-on-merge path and the manual session-card right-click. Fast-forward-only in the main
 * process (`git:pullOriginMain`'s `--ff-only`), so it can never corrupt a clone.
 *
 * Deliberately slim: no behind-count, no polling, no React state. A stale `main/` clone is functionally
 * harmless post-#165 (new sessions branch off `origin/<default>`; diffs compare against `origin/<base>`),
 * so there's nothing to display — only an action to run. Concurrent calls for the same repo coalesce onto
 * one op (auto racing manual). It never reports failures itself: each caller decides how loudly to
 * surface one (the manual item shows a modal; the automatic path shows the non-blocking top banner).
 */
import { useCallback, useRef } from 'react'
import type { ManagedRepo } from '../../../../preload/apis/types'

export type SyncMainResult = { success: boolean; error?: string }

/** Threaded down to the sidebar section components as a stable `onSyncMain(repoId)`. */
export interface MainSyncProps {
  onSyncMain: (repoId: string) => Promise<SyncMainResult>
}

export function useMainSync(repos: ManagedRepo[]): { syncMain: (repoId: string) => Promise<SyncMainResult> } {
  // Refs, not state: read outside render, and kept current each render so `syncMain` (stable identity)
  // always sees the latest repos / in-flight map.
  const reposRef = useRef(repos)
  reposRef.current = repos
  const inFlight = useRef(new Map<string, Promise<SyncMainResult>>())

  const syncMain = useCallback((repoId: string): Promise<SyncMainResult> => {
    // Coalesce concurrent calls for the same repo onto one fast-forward (auto racing manual).
    const existing = inFlight.current.get(repoId)
    if (existing) return existing

    const repo = reposRef.current.find((r) => r.id === repoId)
    if (!repo) return Promise.resolve({ success: false, error: 'Unknown repository.' })

    const run = window.git
      .pullOriginMain(`${repo.rootDir}/main`)
      .catch((err: unknown): SyncMainResult => ({ success: false, error: String(err) }))
      .finally(() => { inFlight.current.delete(repoId) })

    inFlight.current.set(repoId, run)
    return run
  }, [])

  return { syncMain }
}
