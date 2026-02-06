import { useState } from 'react'
import type { Session, SessionStatus, BranchStatus } from '../store/sessions'

interface SessionListProps {
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
  onRefreshPrStatus?: () => Promise<void>
}

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

export default function SessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRefreshPrStatus,
}: SessionListProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    if (!onRefreshPrStatus || isRefreshing) return
    setIsRefreshing(true)
    try {
      await onRefreshPrStatus()
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleDelete = (e: React.MouseEvent, session: Session) => {
    e.stopPropagation()
    if (window.confirm(`Close session "${session.name}"?`)) {
      onDeleteSession(session.id)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center gap-2">
        <button
          onClick={onNewSession}
          className="flex-1 py-2 px-3 bg-accent hover:bg-accent/80 text-white text-sm font-medium rounded transition-colors"
        >
          + New Session
        </button>
        {onRefreshPrStatus && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors disabled:opacity-50"
            title="Refresh PR status for all sessions"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </button>
        )}
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.map((session) => {
          const isUnread = session.isUnread === true

          return (
            <div
              key={session.id}
              tabIndex={0}
              onClick={() => onSelectSession(session.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSelectSession(session.id)
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  const next = (e.currentTarget as HTMLElement).nextElementSibling as HTMLElement
                  if (next?.tabIndex >= 0) next.focus()
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  const prev = (e.currentTarget as HTMLElement).previousElementSibling as HTMLElement
                  if (prev?.tabIndex >= 0) prev.focus()
                } else if (e.key === 'Delete' || e.key === 'Backspace') {
                  if (window.confirm(`Close session "${session.name}"?`)) {
                    onDeleteSession(session.id)
                  }
                }
              }}
              className={`group relative w-full text-left p-3 rounded mb-1 transition-all cursor-pointer outline-none focus:ring-1 focus:ring-accent/50 ${
                session.id === activeSessionId ? 'bg-accent/15' : 'hover:bg-bg-tertiary/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {/* Status indicator */}
                <StatusIndicator status={session.status} isUnread={isUnread} />
                <span className={`text-sm truncate flex-1 text-text-primary ${
                  isUnread ? 'font-bold' : 'font-medium'
                }`}>
                  {session.branch}
                </span>
                <BranchStatusChip status={session.branchStatus} />
                {session.sessionType === 'review' && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-purple-500/20 text-purple-400 flex-shrink-0">
                    Review
                  </span>
                )}
                <button
                  onClick={(e) => handleDelete(e, session)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-text-secondary hover:text-status-error transition-opacity p-1"
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
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="truncate">{session.name}</span>
                {session.prNumber && (
                  <span className="text-purple-400 flex-shrink-0">PR #{session.prNumber}</span>
                )}
              </div>
              {/* Last message preview */}
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
        })}

        {sessions.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-8">
            No sessions yet.
            <br />
            Click "+ New Session" to start.
          </div>
        )}
      </div>
    </div>
  )
}
