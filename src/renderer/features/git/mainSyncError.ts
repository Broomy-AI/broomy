/**
 * Surface a failed "Sync main" (#170). Called once inside `useMainSync`'s `syncMain`, so a single
 * (coalesced) fast-forward reports one modal no matter how many callers awaited it — whether the sync
 * was triggered manually (the session-card right-click) or automatically (`useMainAutoSync` on a PR
 * merge). A silent failure would leave `main/` stale with no trace; the common cause is a diverged /
 * dirty / wrong-branch `main/` clone.
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
