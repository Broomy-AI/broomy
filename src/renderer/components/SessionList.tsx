import { useState } from 'react'
import type { Session, SessionStatus, WaitingType } from '../store/sessions'

interface HooksStatus {
  needsSetup: boolean
  configDir?: string
}

interface SessionListProps {
  hooksStatus?: HooksStatus
  onConfigureHooks?: (configDir?: string) => Promise<void>
  onDismissHooks?: () => void
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
}

const statusLabels: Record<SessionStatus, string> = {
  working: 'Working',
  waiting: 'Waiting',
  idle: 'Idle',
  error: 'Error',
}

const waitingTypeIcons: Record<NonNullable<WaitingType>, { icon: string; label: string }> = {
  tool: { icon: '!', label: 'Tool approval needed' },
  question: { icon: '?', label: 'Question' },
  prompt: { icon: '>', label: 'Ready for input' },
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

  if (status === 'waiting') {
    return (
      <span
        className={`w-3 h-3 rounded-full bg-status-waiting ${
          isUnread ? 'animate-pulse shadow-[0_0_8px_2px_rgba(250,204,21,0.6)]' : ''
        }`}
      />
    )
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

export default function SessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  hooksStatus,
  onConfigureHooks,
  onDismissHooks,
}: SessionListProps) {
  const [isConfiguring, setIsConfiguring] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [configSuccess, setConfigSuccess] = useState(false)

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    onDeleteSession(sessionId)
  }

  const handleConfigureHooks = async () => {
    if (!onConfigureHooks) return
    setIsConfiguring(true)
    setConfigError(null)
    try {
      await onConfigureHooks(hooksStatus?.configDir)
      setConfigSuccess(true)
      setTimeout(() => {
        setConfigSuccess(false)
      }, 2000)
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsConfiguring(false)
    }
  }

  const showPrompt = hooksStatus?.needsSetup && onConfigureHooks && onDismissHooks

  return (
    <div className="flex flex-col h-full">
      {/* Hooks setup banner */}
      {showPrompt && !configSuccess && (
        <div className="p-2 bg-yellow-500/10 border-b border-yellow-500/30">
          <div className="flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400 flex-shrink-0 mt-0.5">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-yellow-200">
                Enable hooks for reliable status tracking
                {hooksStatus?.configDir && hooksStatus.configDir !== '~/.claude' && (
                  <span className="text-yellow-400/70"> ({hooksStatus.configDir})</span>
                )}
              </p>
              {configError && (
                <p className="text-xs text-red-400 mt-1">{configError}</p>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleConfigureHooks}
                  disabled={isConfiguring}
                  className="px-2 py-1 text-xs rounded bg-yellow-500/20 text-yellow-200 hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
                >
                  {isConfiguring ? 'Setting up...' : 'Enable'}
                </button>
                <button
                  onClick={onDismissHooks}
                  className="px-2 py-1 text-xs rounded text-text-secondary hover:text-text-primary transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success message */}
      {configSuccess && (
        <div className="p-2 bg-green-500/10 border-b border-green-500/30">
          <div className="flex items-center gap-2 text-green-400 text-xs">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Hooks enabled!
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-3 border-b border-border">
        <button
          onClick={onNewSession}
          className="w-full py-2 px-3 bg-accent hover:bg-accent/80 text-white text-sm font-medium rounded transition-colors"
        >
          + New Session
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.map((session) => {
          const isUnread = session.isUnread === true
          const waitingInfo = session.waitingType ? waitingTypeIcons[session.waitingType] : null
          const needsAttention = session.status === 'waiting' && isUnread
          const hasUpdate = session.status === 'idle' && isUnread

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
                  onDeleteSession(session.id)
                }
              }}
              className={`group relative w-full text-left p-3 rounded mb-1 transition-all cursor-pointer outline-none focus:bg-accent/15 ${
                session.id === activeSessionId ? 'bg-bg-tertiary' : 'hover:bg-bg-tertiary/50'
              } ${needsAttention ? 'bg-status-waiting/10 border-l-2 border-status-waiting' : ''} ${
                hasUpdate ? 'bg-green-400/10 border-l-2 border-green-400' : ''
              } ${isUnread && !needsAttention && !hasUpdate ? 'border-l-2 border-status-waiting/50' : ''}`}
            >
              <div className="flex items-center gap-2 mb-1">
                {/* Status indicator */}
                <StatusIndicator status={session.status} isUnread={isUnread} />
                <span className={`font-medium text-sm truncate flex-1 ${
                  needsAttention ? 'text-status-waiting font-semibold' :
                  hasUpdate ? 'text-green-400 font-semibold' :
                  isUnread ? 'text-text-primary font-semibold' : 'text-text-primary'
                }`}>
                  {session.name}
                </span>
                {/* Waiting type indicator */}
                {waitingInfo && session.status === 'waiting' && (
                  <span
                    className={`flex items-center justify-center w-5 h-5 rounded text-xs font-bold ${
                      needsAttention
                        ? 'bg-status-waiting text-bg-primary animate-pulse'
                        : 'bg-status-waiting/20 text-status-waiting'
                    }`}
                    title={waitingInfo.label}
                  >
                    {waitingInfo.icon}
                  </span>
                )}
                <button
                  onClick={(e) => handleDelete(e, session.id)}
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
                <span className="truncate">{session.branch}</span>
              </div>
              {/* Last message preview */}
              {session.lastMessage ? (
                <div className={`text-xs mt-1 truncate ${
                  needsAttention ? 'text-status-waiting/80' :
                  hasUpdate ? 'text-green-400/70' :
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
