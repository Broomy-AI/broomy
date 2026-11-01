/**
 * Whether a modal dialog (e.g. New Session) is open. Deferred focus calls check this so that
 * background work (a session restore, a terminal activating) never pulls focus behind the modal,
 * where its keys would reach the panel instead of the dialog.
 */
export function isModalDialogOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null
}
