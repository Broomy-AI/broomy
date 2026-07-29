/**
 * Surface a failed manual "Sync main" (#170). Both callers of the sync coordinator's `syncMain`
 * (the repo-group header chip and the session-card right-click) share this: `syncMain` deliberately
 * returns its result without touching the UI, so the caller reports the failure. A silent no-op after
 * a visible click reads as a broken control — the common cause is a diverged / wrong-branch `main/`.
 */
import { useErrorStore } from '../../store/errors'

export function reportMainSyncFailure(error?: string): void {
  useErrorStore.getState().showErrorDetail({
    id: `sync-main-${Date.now()}`,
    message: error ?? 'Failed to sync main',
    displayMessage: 'Could not sync the main clone',
    detail:
      error ??
      'The fast-forward could not be completed. The main/ clone may have diverged from origin or be on another branch.',
    scope: 'app',
    dismissed: false,
    timestamp: Date.now(),
  })
}
