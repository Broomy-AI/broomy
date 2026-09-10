/**
 * Surface a failed manual "Sync main" (#170) from the session-card right-click. The user asked for the
 * sync, so a dropped failure would read as a dead menu item; the common cause is a diverged / dirty /
 * wrong-branch `main/` clone. The automatic sync-on-merge path deliberately does NOT use this — it shows
 * the app's dismissible top banner instead, since a modal the user never asked for would interrupt them.
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
