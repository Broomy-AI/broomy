/**
 * One repo group in the sidebar: its collapsible header plus (when expanded) the
 * group's session cards, indented behind the vivid wayfinding rail.
 */
import type { MouseEvent, KeyboardEvent } from 'react'
import PanelErrorBoundary from '../../shared/components/PanelErrorBoundary'
import SessionCard from './SessionCard'
import { RepoGroupHeader } from './RepoGroupHeader'
import type { RepoGroup } from './repoGroups'
import type { DragHandlers, DropKind, DropTarget } from './useSidebarDrag'

export function RepoGroupSection({
  group,
  collapsed,
  rail,
  onToggle,
  onSelect,
  onDelete,
  onArchive,
  dragEnabled,
  sessionDrag,
  groupDrag,
  dropTarget,
}: {
  group: RepoGroup
  collapsed: boolean
  rail: string | null
  onToggle: () => void
  onSelect: (id: string) => void
  onDelete: (e: MouseEvent | KeyboardEvent, id: string) => void
  onArchive: (e: MouseEvent, id: string) => void
  dragEnabled: boolean
  sessionDrag: DragHandlers
  groupDrag: DragHandlers
  dropTarget: DropTarget | null
}) {
  const edgeFor = (kind: DropKind, id: string): 'before' | 'after' | null =>
    dropTarget && dropTarget.kind === kind && dropTarget.id === id
      ? (dropTarget.before ? 'before' : 'after')
      : null

  return (
    <div className="mb-1">
      <RepoGroupHeader
        group={group}
        collapsed={collapsed}
        onToggle={onToggle}
        draggable={dragEnabled}
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
                draggable={dragEnabled}
                onDragStart={sessionDrag.onDragStart}
                onDragOver={sessionDrag.onDragOver}
                onDragLeave={sessionDrag.onDragLeave}
                onDrop={sessionDrag.onDrop}
                onDragEnd={sessionDrag.onDragEnd}
                dropEdge={edgeFor('session', session.id)}
              />
            </PanelErrorBoundary>
          ))}
        </div>
      )}
    </div>
  )
}

export default RepoGroupSection
