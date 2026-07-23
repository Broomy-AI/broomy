/**
 * One repo group in the sidebar: its collapsible header plus (when expanded) the
 * group's session cards, indented behind the vivid wayfinding rail.
 */
import type { MouseEvent, KeyboardEvent } from 'react'
import PanelErrorBoundary from '../../shared/components/PanelErrorBoundary'
import SessionCard from './SessionCard'
import { RepoGroupHeader } from './RepoGroupHeader'
import type { RepoGroup } from './repoGroups'

export function RepoGroupSection({
  group,
  collapsed,
  rail,
  onToggle,
  onSelect,
  onDelete,
  onArchive,
}: {
  group: RepoGroup
  collapsed: boolean
  rail: string | null
  onToggle: () => void
  onSelect: (id: string) => void
  onDelete: (e: MouseEvent | KeyboardEvent, id: string) => void
  onArchive: (e: MouseEvent, id: string) => void
}) {
  return (
    <div className="mb-1">
      <RepoGroupHeader group={group} collapsed={collapsed} onToggle={onToggle} />
      {!collapsed && (
        <div className="ml-3 pl-2" style={rail ? { borderLeft: `2px solid ${rail}` } : undefined}>
          {group.sessions.map((session) => (
            <PanelErrorBoundary key={session.id} name={`Session ${session.branch}`}>
              <SessionCard sessionId={session.id} onSelect={onSelect} onDelete={onDelete} onArchive={onArchive} />
            </PanelErrorBoundary>
          ))}
        </div>
      )}
    </div>
  )
}

export default RepoGroupSection
