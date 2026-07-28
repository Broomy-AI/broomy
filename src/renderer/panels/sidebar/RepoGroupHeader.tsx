/**
 * Collapsible header for a repo group: chevron + repo name + count. When collapsed,
 * it rolls the group's highest-priority status up onto the header (using the same
 * StatusIndicator), so collapsing never hides a session that needs attention.
 */
import { rollUpStatus, type RepoGroup, type RollupStatus } from './repoGroups'
import { StatusIndicator } from './StatusIndicator'
import type { SessionStatus } from '../../store/sessions'

const ROLLUP_LABEL: Record<RollupStatus, string> = {
  error: 'error',
  unread: 'needs attention',
  working: 'working',
  initializing: 'setting up',
  idle: 'idle',
}

export function rollupToIndicator(status: RollupStatus): { status: SessionStatus; isUnread: boolean } | null {
  switch (status) {
    case 'error': return { status: 'error', isUnread: false }
    case 'unread': return { status: 'idle', isUnread: true }
    case 'working': return { status: 'working', isUnread: false }
    case 'initializing': return { status: 'initializing', isUnread: false }
    case 'idle': return null
  }
}

export function RepoGroupHeader({
  group,
  collapsed,
  onToggle,
  draggable,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  dropEdge,
}: {
  group: RepoGroup
  collapsed: boolean
  onToggle: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent, groupKey: string) => void
  onDragOver?: (e: React.DragEvent, groupKey: string) => void
  onDragLeave?: () => void
  onDrop?: (e: React.DragEvent, groupKey: string) => void
  onDragEnd?: (e: React.DragEvent) => void
  dropEdge?: 'before' | 'after' | null
}) {
  const rollup = rollUpStatus(group.sessions)
  const indicator = collapsed ? rollupToIndicator(rollup.status) : null
  const n = group.sessions.length
  const attention = collapsed && rollup.status !== 'idle'
  const attentionPart = attention ? `, ${rollup.count} ${ROLLUP_LABEL[rollup.status]}` : ''
  const accessibleName = `${group.label}, ${n} session${n === 1 ? '' : 's'}${attentionPart}, ${collapsed ? 'collapsed' : 'expanded'}`

  const muted = group.kind !== 'repo'

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={accessibleName}
      draggable={!!draggable}
      onDragStart={(e) => onDragStart?.(e, group.key)}
      onDragOver={(e) => onDragOver?.(e, group.key)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop?.(e, group.key)}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-bg-tertiary/40 text-left outline-none focus:ring-1 focus:ring-accent/50 ${
        dropEdge === 'before' ? 'border-t-2 border-t-accent' : ''
      } ${dropEdge === 'after' ? 'border-b-2 border-b-accent' : ''}`}
    >
      <svg
        aria-hidden="true"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`text-text-secondary transition-transform flex-shrink-0 ${collapsed ? '' : 'rotate-90'}`}
      >
        <path d="M8 5l8 7-8 7z" />
      </svg>
      <span className={`text-xs font-semibold truncate ${muted ? 'italic text-text-secondary' : 'text-text-primary'}`}>
        {group.label}
      </span>
      <span className="text-3xs text-text-secondary flex-shrink-0">{n}</span>
      <span className="flex-1" />
      {indicator && <StatusIndicator status={indicator.status} isUnread={indicator.isUnread} small />}
    </button>
  )
}

export default RepoGroupHeader
