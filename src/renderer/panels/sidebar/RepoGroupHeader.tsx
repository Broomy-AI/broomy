/**
 * Collapsible header for a repo group: chevron + repo name + count. When collapsed,
 * it rolls the group's highest-priority status up onto the header (using the same
 * StatusIndicator), so collapsing never hides a session that needs attention.
 *
 * Layout is a wrapper `<div>` holding two siblings: a full-width toggle `<button>` (the
 * drag source + collapse control) and an optional `main/` sync chip `<button>` (#170).
 * The wrapper — not the toggle — is the drop target and carries the row focus ring, so
 * the chip area stays a valid drop zone and a drag can't be started from the chip.
 */
import { rollUpStatus, type RepoGroup, type RollupStatus } from './repoGroups'
import { StatusIndicator } from './StatusIndicator'
import { dropEdgeClasses } from './useSidebarDrag'
import { reportMainSyncFailure } from '../../features/git/mainSyncError'
import type { MainBehind } from '../../features/git/hooks/useMainSync'
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

/**
 * The `main/`-behind sync chip. Renders one of three states, or nothing:
 * - **syncing** → a plain (non-`StatusIndicator`) spinner, `aria-busy`, non-interactive.
 * - **available & behind > 0** → a neutral `↓N` button; click fast-forwards `main/`.
 * - **unavailable** → a muted dot with a tooltip (never hidden, so a failed check is visible).
 * - **available & 0 behind** (current) → nothing.
 */
function MainSyncChip({
  repoId, mainBehind, isSyncing, onSyncMain,
}: {
  repoId: string
  mainBehind: MainBehind | undefined
  isSyncing: boolean
  onSyncMain: (repoId: string) => Promise<{ success: boolean; error?: string }>
}) {
  if (isSyncing) {
    return (
      <span
        className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-text-secondary"
        aria-busy="true"
        aria-label="Syncing main"
        title="Syncing main…"
      >
        <svg aria-hidden="true" className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
        </svg>
      </span>
    )
  }

  if (mainBehind?.status === 'available' && mainBehind.behind > 0) {
    const n = mainBehind.behind
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation() // sibling of the toggle button, but keep the row from reacting
      void onSyncMain(repoId).then((r) => { if (!r.success) reportMainSyncFailure(r.error) })
    }
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Sync main — ${n} commit${n === 1 ? '' : 's'} behind`}
        title="Fast-forward only — never rewrites history"
        className="flex-shrink-0 flex items-center gap-0.5 min-w-6 h-6 px-1.5 rounded text-3xs font-medium text-text-secondary hover:bg-bg-tertiary hover:text-text-primary outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
      >
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14" />
          <path d="M19 12l-7 7-7-7" />
        </svg>
        {n}
      </button>
    )
  }

  if (mainBehind?.status === 'unavailable') {
    return (
      <span
        className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-text-secondary/40"
        aria-label="Main sync status unavailable"
        title={mainBehind.error ? `Couldn't check main: ${mainBehind.error}` : "Couldn't check whether main is behind origin"}
      >
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current" />
      </span>
    )
  }

  return null
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
  mainBehind,
  isSyncing = false,
  onSyncMain,
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
  /** #170: this repo's `main/` behind-count. Undefined for non-repo groups (no chip). */
  mainBehind?: MainBehind
  isSyncing?: boolean
  onSyncMain?: (repoId: string) => Promise<{ success: boolean; error?: string }>
}) {
  const rollup = rollUpStatus(group.sessions)
  const indicator = collapsed ? rollupToIndicator(rollup.status) : null
  const n = group.sessions.length
  const attention = collapsed && rollup.status !== 'idle'
  const attentionPart = attention ? `, ${rollup.count} ${ROLLUP_LABEL[rollup.status]}` : ''
  const accessibleName = `${group.label}, ${n} session${n === 1 ? '' : 's'}${attentionPart}, ${collapsed ? 'collapsed' : 'expanded'}`

  const muted = group.kind !== 'repo'

  return (
    // Wrapper is the drop target + row focus ring, so the chip stays a valid drop zone.
    <div
      onDragOver={(e) => onDragOver?.(e, group.key)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop?.(e, group.key)}
      className={`flex items-center rounded outline-none focus-within:ring-1 focus-within:ring-accent/50 ${dropEdgeClasses(dropEdge)}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={accessibleName}
        draggable={!!draggable}
        onDragStart={(e) => onDragStart?.(e, group.key)}
        onDragEnd={onDragEnd}
        className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5 rounded hover:bg-bg-tertiary/40 text-left outline-none"
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
      {group.repoId && onSyncMain && (
        <MainSyncChip repoId={group.repoId} mainBehind={mainBehind} isSyncing={isSyncing} onSyncMain={onSyncMain} />
      )}
    </div>
  )
}

export default RepoGroupHeader
