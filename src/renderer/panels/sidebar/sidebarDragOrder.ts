/**
 * Pure order arithmetic for sidebar drag-and-drop. No React, no store.
 *
 * Active session order IS the order of the persisted `sessions` array, so moving a
 * session means splicing it to sit next to its drop target in that global array. A
 * session may only move within its own repo group: group membership is derived from
 * the session's repo, so a cross-group drop has no meaning and is rejected here rather
 * than being silently coerced.
 *
 * Group order is a separate list of group keys. It is sparse by design — it holds only
 * the groups the user has actually dragged, and unlisted groups fall back to the
 * computed order in `groupSessionsByRepo`.
 */
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import { groupKeyForSession } from './repoGroups'

/**
 * Move `draggedId` adjacent to `targetId` in the global session array.
 * Returns the input array unchanged if either id is unknown, they are the same
 * session, or the two sessions live in different repo groups.
 */
export function moveSessionWithinGroup(
  sessions: Session[],
  repos: ManagedRepo[],
  draggedId: string,
  targetId: string,
  before: boolean,
): Session[] {
  if (draggedId === targetId) return sessions
  const dragged = sessions.find((s) => s.id === draggedId)
  const target = sessions.find((s) => s.id === targetId)
  if (!dragged || !target) return sessions
  if (groupKeyForSession(dragged, repos) !== groupKeyForSession(target, repos)) return sessions

  const next = sessions.filter((s) => s.id !== draggedId)
  // Index is recomputed AFTER the removal — using the pre-removal index would be
  // off by one for every downward move.
  const targetIndex = next.findIndex((s) => s.id === targetId)
  next.splice(before ? targetIndex : targetIndex + 1, 0, dragged)
  return next
}

/**
 * Move `draggedKey` adjacent to `targetKey` in the persisted group order.
 * Seeds from `renderedKeys` (the order the groups are currently displayed in) so the
 * first-ever drag produces a complete list, and prunes stored keys whose group no
 * longer renders. Returns `order` unchanged if either key is not currently rendered.
 */
export function moveGroupKey(
  order: string[],
  renderedKeys: string[],
  draggedKey: string,
  targetKey: string,
  before: boolean,
): string[] {
  if (draggedKey === targetKey) return order
  if (!renderedKeys.includes(draggedKey) || !renderedKeys.includes(targetKey)) return order

  // Stored order first (pruned of vanished groups), then anything rendered but unstored.
  const seeded = [
    ...order.filter((k) => renderedKeys.includes(k)),
    ...renderedKeys.filter((k) => !order.includes(k)),
  ]

  const next = seeded.filter((k) => k !== draggedKey)
  const targetIndex = next.indexOf(targetKey)
  next.splice(before ? targetIndex : targetIndex + 1, 0, draggedKey)
  return next
}
