/**
 * Ordering for the sidebar's Archived section: most recently archived first.
 *
 * Archived sessions are never manually ordered — unlike active sessions, whose order
 * is the user-dragged order of the persisted array. Sessions archived before
 * `archivedAt` existed carry no timestamp; they sort below every timestamped session
 * and keep their relative array order among themselves (the sort is stable).
 */
import type { Session } from '../../store/sessions'

export function sortArchived(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const at = a.archivedAt
    const bt = b.archivedAt
    if (at === undefined && bt === undefined) return 0
    if (at === undefined) return 1
    if (bt === undefined) return -1
    return bt - at
  })
}
