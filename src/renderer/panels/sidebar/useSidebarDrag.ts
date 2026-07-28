/**
 * Drag-and-drop state for the sidebar: session cards within their repo group, and repo
 * group headers among themselves.
 *
 * Sessions and groups are two separate drags that must never cross — the hook tracks
 * which kind is in flight and ignores drop targets of the other kind, so dragging a
 * card over a header (or vice versa) shows nothing and drops nowhere. The cross-repo
 * rejection itself lives in the store action, which owns the session data needed to
 * judge it.
 *
 * Drop position is "before or after this item", decided by which vertical half of the
 * target the cursor is in — in a vertical list the meaningful position is the gap
 * between two items, not the item itself.
 */
import { useState, useCallback } from 'react'
import { useSessionStore } from '../../store/sessions'

export type DropKind = 'session' | 'group'

export interface DropTarget {
  id: string
  kind: DropKind
  before: boolean
}

export interface DragHandlers {
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, id: string) => void
  onDragEnd: (e: React.DragEvent) => void
}

/** True when the cursor sits in the top half of the event's target element. */
function isBefore(e: React.DragEvent): boolean {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return e.clientY < rect.top + rect.height / 2
}

/**
 * Not curried by kind: a curried factory (`useCallback((kind) => (e, id) => {...})`)
 * only memoizes the outer function — calling it per-render to build `sessionDrag` /
 * `groupDrag` still returns a fresh inner closure every time, which defeats
 * `React.memo` on consumers like `SessionCard`. Defining each handler directly with
 * its own `useCallback` (mirroring the `TabbedTerminal.tsx` precedent) keeps them
 * genuinely stable across renders where their dependencies haven't changed.
 */
export function useSidebarDrag(enabled: boolean, renderedGroupKeys: string[]) {
  const reorderSession = useSessionStore((s) => s.reorderSession)
  const reorderRepoGroup = useSessionStore((s) => s.reorderRepoGroup)
  const [dragging, setDragging] = useState<{ id: string; kind: DropKind } | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const startDrag = useCallback((kind: DropKind, e: React.DragEvent, id: string) => {
    if (!enabled) { e.preventDefault(); return }
    setDragging({ id, kind })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }, [enabled])

  const dragOver = useCallback((kind: DropKind, e: React.DragEvent, id: string) => {
    if (!enabled || !dragging || dragging.kind !== kind) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragging.id === id) { setDropTarget(null); return }
    setDropTarget({ id, kind, before: isBefore(e) })
  }, [enabled, dragging])

  const leave = useCallback(() => setDropTarget(null), [])

  const performDrop = useCallback((kind: DropKind, e: React.DragEvent, id: string) => {
    if (!enabled || !dragging || dragging.kind !== kind) return
    e.preventDefault()
    e.stopPropagation()
    const before = isBefore(e)
    setDropTarget(null)
    setDragging(null)
    if (dragging.id === id) return
    if (kind === 'session') reorderSession(dragging.id, id, before)
    else reorderRepoGroup(dragging.id, id, renderedGroupKeys, before)
  }, [enabled, dragging, reorderSession, reorderRepoGroup, renderedGroupKeys])

  const end = useCallback(() => {
    setDragging(null)
    setDropTarget(null)
  }, [])

  const handleSessionDragStart = useCallback((e: React.DragEvent, id: string) => startDrag('session', e, id), [startDrag])
  const handleSessionDragOver = useCallback((e: React.DragEvent, id: string) => dragOver('session', e, id), [dragOver])
  const handleSessionDrop = useCallback((e: React.DragEvent, id: string) => performDrop('session', e, id), [performDrop])

  const handleGroupDragStart = useCallback((e: React.DragEvent, id: string) => startDrag('group', e, id), [startDrag])
  const handleGroupDragOver = useCallback((e: React.DragEvent, id: string) => dragOver('group', e, id), [dragOver])
  const handleGroupDrop = useCallback((e: React.DragEvent, id: string) => performDrop('group', e, id), [performDrop])

  const sessionDrag: DragHandlers = {
    onDragStart: handleSessionDragStart,
    onDragOver: handleSessionDragOver,
    onDragLeave: leave,
    onDrop: handleSessionDrop,
    onDragEnd: end,
  }

  const groupDrag: DragHandlers = {
    onDragStart: handleGroupDragStart,
    onDragOver: handleGroupDragOver,
    onDragLeave: leave,
    onDrop: handleGroupDrop,
    onDragEnd: end,
  }

  return { dropTarget, sessionDrag, groupDrag }
}
