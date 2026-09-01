/**
 * The collapsible Archived section. Like a repo group, when collapsed it rolls the
 * highest-priority status of its archived sessions onto the header, so nothing is hidden.
 */
import type { MouseEvent, KeyboardEvent } from 'react'
import PanelErrorBoundary from '../../shared/components/PanelErrorBoundary'
import SessionCard from './SessionCard'
import { StatusIndicator } from './StatusIndicator'
import { rollupToIndicator } from './RepoGroupHeader'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import { resolveRepoId, type Rollup } from './repoGroups'
import type { MainSyncProps } from '../../features/git/hooks/useMainSync'

export function ArchivedSection({
  sessions,
  rollup,
  show,
  searching = false,
  repoLabel,
  repos,
  onToggle,
  onSelect,
  onDelete,
  onArchive,
  onSyncMain,
}: {
  sessions: Session[]
  rollup: Rollup
  show: boolean
  /** While searching, the section is forced open and its cards carry a repo tag. */
  searching?: boolean
  repoLabel?: (s: Session) => string
  /** Needed to resolve each archived session's repo (an archived list spans repos). */
  repos: ManagedRepo[]
  onToggle: () => void
  onSelect: (id: string) => void
  onDelete: (e: MouseEvent | KeyboardEvent, id: string) => void
  onArchive: (e: MouseEvent, id: string) => void
} & MainSyncProps) {
  if (sessions.length === 0) return null
  const open = show || searching
  const ind = !open ? rollupToIndicator(rollup.status) : null
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={searching}
        aria-expanded={open}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:cursor-default disabled:hover:text-text-secondary"
      >
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path d="M8 5l8 7-8 7z" />
        </svg>
        Archived ({sessions.length})
        {ind && (
          <span className="ml-auto flex items-center">
            <StatusIndicator status={ind.status} isUnread={ind.isUnread} small />
          </span>
        )}
      </button>
      {open && (
        <div className="mt-1">
          {sessions.map((session) => {
            // A deleted repo keeps its id on the session, so only offer "Sync main" for a live repo.
            const rid = resolveRepoId(session, repos)
            const syncRepoId = rid && repos.some((r) => r.id === rid) ? rid : undefined
            return (
              <PanelErrorBoundary key={session.id} name={`Session ${session.branch}`}>
                <SessionCard
                  sessionId={session.id}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onArchive={onArchive}
                  repoLabel={searching && repoLabel ? repoLabel(session) : undefined}
                  syncRepoId={syncRepoId}
                  onSyncMain={onSyncMain}
                />
              </PanelErrorBoundary>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ArchivedSection
