/**
 * Individual session card with status indicator, branch name, and action buttons.
 */
import { memo } from 'react'
import { useSessionStore } from '../../store/sessions'
import type { Session, SessionStatus, BranchStatus } from '../../store/sessions'

const statusLabels: Record<SessionStatus, string> = {
  working: 'Working',
  idle: 'Idle',
  error: 'Error',
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

function StatusIndicator({ status, isUnread }: { status: SessionStatus; isUnread: boolean }) {
  if (status === 'working') {
    return <Spinner className="text-status-working" />
  }

  if (status === 'error') {
    return <span className="w-2 h-2 rounded-full bg-status-error" />
  }

  // idle
  if (isUnread) {
    return (
      <span className="w-3 h-3 rounded-full bg-green-400 shadow-[0_0_6px_1px_rgba(74,222,128,0.5)]" />
    )
  }
  return <span className="w-2 h-2 rounded-full bg-status-idle" />
}

function BranchStatusChip({ status }: { status: BranchStatus }) {
  if (status === 'in-progress') return null

  const config: Record<string, { label: string; classes: string }> = {
    pushed: { label: 'PUSHED', classes: 'bg-blue-500/20 text-blue-400' },
    empty: { label: 'EMPTY', classes: 'bg-gray-500/20 text-gray-400' },
    open: { label: 'PR OPEN', classes: 'bg-green-500/20 text-green-400' },
    merged: { label: 'MERGED', classes: 'bg-purple-500/20 text-purple-400' },
    closed: { label: 'CLOSED', classes: 'bg-red-500/20 text-red-400' },
  }

  const { label, classes } = config[status]
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium leading-none ${classes}`}>
      {label}
    </span>
  )
}

export default memo(function SessionCard({
  session,
  onSelect,
  onDelete,
  onArchive,
}: {
  session: Session
  onSelect: (sessionId: string) => void
  onDelete: (e: React.MouseEvent | React.KeyboardEvent, sessionId: string) => void
  onArchive?: (e: React.MouseEvent, sessionId: string) => void
}) {
  const isActive = useSessionStore((s) => s.activeSessionId === session.id)
  const isUnread = session.isUnread

  return (
    <div
      tabIndex={0}
      onClick={() => onSelect(session.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onSelect(session.id)
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          const next = (e.currentTarget as HTMLElement).nextElementSibling as HTMLElement | null
          if (next && next.tabIndex >= 0) next.focus()
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          const prev = (e.currentTarget as HTMLElement).previousElementSibling as HTMLElement | null
          if (prev && prev.tabIndex >= 0) prev.focus()
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          onDelete(e, session.id)
        }
      }}
      className={`group relative w-full text-left p-3 rounded mb-1 transition-all cursor-pointer outline-none focus:ring-1 focus:ring-accent/50 ${
        isActive ? 'bg-accent/15' : 'hover:bg-bg-tertiary/50'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <StatusIndicator status={session.status} isUnread={isUnread} />
        <span className={`text-sm truncate flex-1 text-text-primary ${
          isUnread ? 'font-bold' : 'font-medium'
        }`}>
          {session.branch}
        </span>
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
          {onArchive && (
            <button
              onClick={(e) => onArchive(e, session.id)}
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
            onClick={(e) => onDelete(e, session.id)}
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
        <span className="truncate flex-1">{session.name}</span>
        {session.sessionType === 'review' ? (
          session.reviewStatus === 'reviewed' ? (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-green-500/20 text-green-400 flex-shrink-0">
              Reviewed
            </span>
          ) : (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-cyan-500/20 text-cyan-400 flex-shrink-0">
              Review
            </span>
          )
        ) : (
          <BranchStatusChip status={session.branchStatus} />
        )}
        {session.prNumber && (
          <span className="text-purple-400 flex-shrink-0">PR #{session.prNumber}</span>
        )}
      </div>
      {session.lastMessage ? (
        <div className={`text-xs mt-1 truncate ${
          isUnread ? 'text-text-secondary' : 'text-text-secondary/60'
        }`}>
          "{session.lastMessage}"
        </div>
      ) : (
        <div className="text-xs text-text-secondary/60 mt-1 truncate">
          {statusLabels[session.status]}
        </div>
      )}
    </div>
  )
})
