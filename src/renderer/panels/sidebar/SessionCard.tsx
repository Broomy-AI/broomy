/**
 * Individual session card with status indicator, branch name, and action buttons.
 *
 * Each card subscribes to its own session slice from the store via a shallow-equality
 * selector, so it only re-renders when its own display fields change — not when
 * unrelated sessions update their agent monitor state.
 */
import { memo, useEffect, useState } from 'react'
import { useSessionStore } from '../../store/sessions'
import { useShallow } from 'zustand/react/shallow'
import type { SessionStatus, StatusChip } from '../../store/sessions'
import { formatElapsedTime } from '../../shared/utils/formatTime'
import { useElapsedSeconds } from '../../shared/hooks/useElapsedSeconds'
import { deriveDisplayedChip } from '../../features/git/displayedChip'
import { ReviewStatusChip } from '../../shared/components/ReviewStatusChip'
import { StatusIndicator } from './StatusIndicator'
import { fileManagerName } from '../../shared/utils/platform'
import { useErrorStore } from '../../store/errors'

/**
 * Surface a failed "Open in <file manager>". The user asked for something visible to happen, so a
 * dropped result would read as a broken menu item; `detail` covers the common case of a worktree
 * that no longer exists on disk.
 */
function reportOpenFailure(directory: string, error?: string): void {
  useErrorStore.getState().showErrorDetail({
    id: `open-in-file-manager-${Date.now()}`,
    message: error ?? `${directory} could not be opened`,
    displayMessage: `Could not open this session's folder in ${fileManagerName}`,
    detail: error ?? `${directory} is not a folder on disk — the worktree may have been deleted.`,
    scope: 'app',
    dismissed: false,
    timestamp: Date.now(),
  })
}

const statusLabels: Record<SessionStatus, string> = {
  working: 'Working',
  idle: 'Idle',
  error: 'Error',
  initializing: 'Setting up...',
}

function StatusChipBadge({ status }: { status: StatusChip }) {
  const badge = deriveDisplayedChip(status, undefined, undefined)
  if (!badge) return null
  return (
    <span className={`text-3xs px-1.5 py-0.5 rounded font-medium leading-none ${badge.classes}`}>
      {badge.label}
    </span>
  )
}

function PauseButton({ isPaused, onPause, sessionId }: {
  isPaused: boolean
  onPause: (e: React.MouseEvent, sessionId: string) => void
  sessionId: string
}) {
  return (
    <button
      onClick={(e) => onPause(e, sessionId)}
      className="text-text-secondary hover:text-text-primary p-1"
      title={isPaused ? 'Resume session' : 'Pause session'}
    >
      {isPaused ? (
        /* Play triangle */
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4l14 8-14 8V4z" />
        </svg>
      ) : (
        /* Pause bars */
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 4v16" />
          <path d="M15 4v16" />
        </svg>
      )}
    </button>
  )
}

export default memo(function SessionCard({
  sessionId,
  onSelect,
  onDelete,
  onArchive,
  onPause,
  repoLabel,
}: {
  sessionId: string
  onSelect: (sessionId: string) => void
  onDelete: (e: React.MouseEvent | React.KeyboardEvent, sessionId: string) => void
  onArchive?: (e: React.MouseEvent, sessionId: string) => void
  onPause?: (e: React.MouseEvent, sessionId: string) => void
  /** Search mode only: a neutral repo tag (grouped mode shows the repo on the header). */
  repoLabel?: string
}) {
  // Subscribe to only the fields this card renders, with shallow equality.
  // This prevents re-renders when unrelated session fields (or other sessions) change.
  const session = useSessionStore(
    useShallow((s) => {
      const sess = s.sessions.find(x => x.id === sessionId)
      if (!sess) return null
      return {
        status: sess.status,
        isUnread: sess.isUnread,
        branch: sess.branch,
        name: sess.name,
        lastMessage: sess.lastMessage,
        statusChip: sess.statusChip,
        prNumber: sess.prNumber,
        lastKnownPrNumber: sess.lastKnownPrNumber,
        isArchived: sess.isArchived,
        isPaused: sess.isPaused,
        sessionType: sess.sessionType,
        reviewStatus: sess.reviewStatus,
        initError: sess.initError,
        directory: sess.directory,
      }
    }),
  )
  const isActive = useSessionStore((s) => s.activeSessionId === sessionId)

  // Debounce working status: only show spinner after 1.5s of continuous working.
  // The activity detector sets idle after 1s of silence, so brief terminal output
  // (prompt redraws, SIGWINCH responses) cycles working→idle in ~1.3s and never
  // reaches this threshold. Genuine agent work produces sustained output.
  const [showWorking, setShowWorking] = useState(false)
  useEffect(() => {
    if (session?.status === 'working') {
      const timer = setTimeout(() => setShowWorking(true), 1500)
      return () => clearTimeout(timer)
    } else {
      setShowWorking(false)
    }
  }, [session?.status])

  const elapsedSeconds = useElapsedSeconds(sessionId)

  if (!session) return null

  const displayStatus: SessionStatus = session.status === 'initializing' ? 'initializing'
    : showWorking ? 'working' : (session.status === 'error' ? 'error' : 'idle')
  const isUnread = session.isUnread

  // Right-click → native context menu → open the session's worktree folder in the OS file manager.
  const directory = session.directory
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    void (async () => {
      const choice = await window.menu.popup([
        { id: 'open-in-file-manager', label: `Open in ${fileManagerName}` },
      ])
      if (choice !== 'open-in-file-manager') return
      const result = await window.shell.openInFileManager(directory)
      // 'opened'/'revealed' are both successes. Report the rest: 'failed' is an OS error, and
      // 'none' means the folder is gone (common on an archived session whose worktree was
      // deleted). Staying silent would make the menu item look dead.
      if (result.action !== 'opened' && result.action !== 'revealed') {
        reportOpenFailure(directory, result.error)
      }
    })().catch((err: unknown) => reportOpenFailure(directory, String(err)))
  }

  return (
    <div
      data-session-card
      data-session-id={sessionId}
      tabIndex={0}
      onClick={() => onSelect(sessionId)}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onSelect(sessionId)
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          // Traverse ALL cards across groups (siblings break once cards nest in groups).
          e.preventDefault()
          const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-session-card]'))
          const idx = cards.indexOf(e.currentTarget as HTMLElement)
          cards[e.key === 'ArrowDown' ? idx + 1 : idx - 1]?.focus()
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          onDelete(e, sessionId)
        }
      }}
      className={`group relative w-full text-left p-3 rounded mb-1 transition-all cursor-pointer outline-none focus:ring-1 focus:ring-accent/50 ${
        isActive ? 'bg-accent/15' : 'hover:bg-bg-tertiary/50'
      } ${session.isPaused ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <StatusIndicator status={displayStatus} isUnread={isUnread} />
        <span className={`text-sm truncate flex-1 text-text-primary ${
          isUnread ? 'font-bold' : 'font-medium'
        }`}>
          {session.branch}
        </span>
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
          {onPause && (
            <PauseButton isPaused={session.isPaused} onPause={onPause} sessionId={sessionId} />
          )}
          {onArchive && (
            <button
              onClick={(e) => onArchive(e, sessionId)}
              className="text-text-secondary hover:text-text-primary p-1"
              title={session.isArchived ? 'Unarchive session' : 'Archive session'}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="3" width="20" height="5" rx="1" />
                <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                <path d="M10 12h4" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => onDelete(e, sessionId)}
            className="text-text-secondary hover:text-status-error p-1"
            title="Delete session"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        {repoLabel && (
          <span className="text-3xs px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary font-medium leading-none flex-shrink-0">
            {repoLabel}
          </span>
        )}
        <span className="truncate flex-1">{session.name}</span>
        {session.sessionType === 'review' ? (
          <ReviewStatusChip status={session.reviewStatus ?? 'pending'} />
        ) : (
          <StatusChipBadge status={session.statusChip} />
        )}
        {(session.prNumber || session.lastKnownPrNumber) && (
          <span className="text-review-fg flex-shrink-0">PR #{session.prNumber || session.lastKnownPrNumber}</span>
        )}
      </div>
      {session.initError ? (
        <div className="text-xs mt-1 truncate text-status-error">
          {session.initError}
        </div>
      ) : session.lastMessage ? (
        <div className={`text-xs mt-1 flex items-center gap-1.5 ${
          isUnread ? 'text-text-secondary' : 'text-text-secondary/60'
        }`}>
          <span className="truncate">"{session.lastMessage}"</span>
          {showWorking && elapsedSeconds > 0 && (
            <span className="flex-shrink-0 text-text-secondary/40">{formatElapsedTime(elapsedSeconds)}</span>
          )}
        </div>
      ) : (
        <div className="text-xs text-text-secondary/60 mt-1 flex items-center gap-1.5">
          <span className="truncate">{statusLabels[displayStatus]}</span>
          {showWorking && elapsedSeconds > 0 && (
            <span className="flex-shrink-0 text-text-secondary/40">{formatElapsedTime(elapsedSeconds)}</span>
          )}
        </div>
      )}
    </div>
  )
})
