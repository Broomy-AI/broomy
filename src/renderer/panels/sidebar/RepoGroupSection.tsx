/**
 * One repo group in the sidebar: its collapsible header plus (when expanded) the
 * group's session cards, indented behind the vivid wayfinding rail.
 *
 * `draggable` is hardcoded on: SessionList only mounts this component for the grouped
 * (non-search) view, so drag is always allowed here. Search mode renders a separate
 * flat branch of plain SessionCards with no drag props at all — that's the real guard
 * against dragging while searching.
 */
import type { MouseEvent, KeyboardEvent } from 'react'
import PanelErrorBoundary from '../../shared/components/PanelErrorBoundary'
import SessionCard from './SessionCard'
import { RepoGroupHeader } from './RepoGroupHeader'
import type { RepoGroup } from './repoGroups'
import type { DragHandlers, DropKind, DropTarget } from './useSidebarDrag'
import type { MainSyncProps } from '../../features/git/hooks/useMainSync'

export function RepoGroupSection({
  group,
  collapsed,
  rail,
  onToggle,
  onSelect,
  onDelete,
  onArchive,
  sessionDrag,
  groupDrag,
  dropTarget,
  onSyncMain,
}: {
  group: RepoGroup
  collapsed: boolean
  rail: string | null
  onToggle: () => void
  onSelect: (id: string) => void
  onDelete: (e: MouseEvent | KeyboardEvent, id: string) => void
  onArchive: (e: MouseEvent, id: string) => void
  sessionDrag: DragHandlers
  groupDrag: DragHandlers
  dropTarget: DropTarget | null
} & MainSyncProps) {
  const edgeFor = (kind: DropKind, id: string): 'before' | 'after' | null =>
    dropTarget?.kind === kind && dropTarget.id === id
      ? (dropTarget.before ? 'before' : 'after')
      : null

  // A deleted repo keeps its id on a `kind:'unknown'` group, so only expose "Sync main" for a live repo
  // group — otherwise the item would always fail with "Unknown repository".
  const repoId = group.kind === 'repo' ? group.repoId : undefined

  return (
    <div className="mb-1">
      <RepoGroupHeader
        group={group}
        collapsed={collapsed}
        onToggle={onToggle}
        draggable
        onDragStart={groupDrag.onDragStart}
        onDragOver={groupDrag.onDragOver}
        onDragLeave={groupDrag.onDragLeave}
        onDrop={groupDrag.onDrop}
        onDragEnd={groupDrag.onDragEnd}
        dropEdge={edgeFor('group', group.key)}
      />
      {!collapsed && (
        <div className="ml-3 pl-2" style={rail ? { borderLeft: `2px solid ${rail}` } : undefined}>
          {group.sessions.map((session) => (
            <PanelErrorBoundary key={session.id} name={`Session ${session.branch}`}>
              <SessionCard
                sessionId={session.id}
                onSelect={onSelect}
                onDelete={onDelete}
                onArchive={onArchive}
                draggable
                onDragStart={sessionDrag.onDragStart}
                onDragOver={sessionDrag.onDragOver}
                onDragLeave={sessionDrag.onDragLeave}
                onDrop={sessionDrag.onDrop}
                onDragEnd={sessionDrag.onDragEnd}
                dropEdge={edgeFor('session', session.id)}
                syncRepoId={repoId}
                onSyncMain={onSyncMain}
              />
            </PanelErrorBoundary>
          ))}
        </div>
      )}
    </div>
  )
}

export default RepoGroupSection
