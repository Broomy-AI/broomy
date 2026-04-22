/**
 * Sidebar list of sessions with status indicators, branch chips, and archive support.
 *
 * Renders each session as a card showing agent activity status (spinner for working,
 * glow dot for unread idle, plain dot for read idle), the branch name, repository name,
 * branch status chip (pushed, PR open, merged, etc.), and the last agent message preview.
 * Sessions can be archived to collapse them into a toggleable section. Keyboard navigation
 * with arrow keys, Enter to select, and Delete to remove is supported.
 */
import { useState, useMemo, useCallback } from 'react'
import { useSessionStore } from '../../store/sessions'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import PanelErrorBoundary from '../../shared/components/PanelErrorBoundary'
import SessionCard from './SessionCard'
import DeleteSessionDialog from './DeleteSessionDialog'
import UpdateBanner from './UpdateBanner'

interface SessionListProps {
  repos: ManagedRepo[]
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string, deleteWorktree: boolean) => void
  onRefreshPrStatus?: () => Promise<void>
  onArchiveSession: (id: string) => void
  onUnarchiveSession: (id: string) => void
}

export default function SessionList({
  repos,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRefreshPrStatus,
  onArchiveSession,
  onUnarchiveSession,
}: SessionListProps) {
  const sessions = useSessionStore((s) => s.sessions)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const matchesSearch = useCallback((session: Session) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    // Match PR/issue numbers with or without '#' prefix
    const numericQ = q.startsWith('#') ? q.slice(1) : q
    const numMatch = (n: number | undefined) => n !== undefined && `${n}`.includes(numericQ)
    return (
      session.branch.toLowerCase().includes(q) ||
      session.name.toLowerCase().includes(q) ||
      (session.prTitle?.toLowerCase().includes(q) ?? false) ||
      (session.issueTitle?.toLowerCase().includes(q) ?? false) ||
      numMatch(session.prNumber) ||
      numMatch(session.issueNumber) ||
      (session.lastMessage?.toLowerCase().includes(q) ?? false)
    )
  }, [searchQuery])

  const activeSessions = useMemo(() => sessions.filter((s) => !s.isArchived && matchesSearch(s)), [sessions, matchesSearch])
  const archivedSessions = useMemo(() => sessions.filter((s) => s.isArchived && matchesSearch(s)), [sessions, matchesSearch])

  const handleRefresh = async () => {
    if (!onRefreshPrStatus || isRefreshing) return
    setIsRefreshing(true)
    try {
      await onRefreshPrStatus()
    } finally {
      setIsRefreshing(false)
    }
  }

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const pendingDeleteSession = useMemo(() => pendingDeleteId ? sessions.find(s => s.id === pendingDeleteId) ?? null : null, [sessions, pendingDeleteId])
  const [deleteWorktree, setDeleteWorktree] = useState(true)

  // Stable callbacks that accept session ID — prevents defeating SessionCard's memo
  const handleDelete = useCallback((e: React.MouseEvent | React.KeyboardEvent, sessionId: string) => {
    e.stopPropagation()
    setDeleteWorktree(true)
    setPendingDeleteId(sessionId)
  }, [])

  const handleArchive = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    onArchiveSession(sessionId)
  }, [onArchiveSession])

  const handleUnarchive = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    onUnarchiveSession(sessionId)
  }, [onUnarchiveSession])

  const handleSelectArchived = useCallback((sessionId: string) => {
    onUnarchiveSession(sessionId)
    onSelectSession(sessionId)
  }, [onUnarchiveSession, onSelectSession])

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

      {/* Search */}
      <div className="px-2 pt-2 relative">
        <input
          data-session-search
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearchQuery('')
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          placeholder="Search sessions..."
          className="w-full px-2 py-1.5 text-xs rounded bg-bg-primary border border-border text-text-primary placeholder-text-secondary/50 outline-none focus:border-accent/50 pr-6"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary leading-none"
            tabIndex={-1}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <UpdateBanner />

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeSessions.map((session) => (
          <PanelErrorBoundary key={session.id} name={`Session ${session.branch}`}>
            <SessionCard
              sessionId={session.id}
              onSelect={onSelectSession}
              onDelete={handleDelete}
              onArchive={handleArchive}
            />
          </PanelErrorBoundary>
        ))}

        {activeSessions.length === 0 && archivedSessions.length === 0 && !searchQuery && (
          <div className="text-center text-text-secondary text-sm py-8">
            No sessions yet.
            <br />
            Click "+ New Session" to start.
          </div>
        )}

        {activeSessions.length === 0 && archivedSessions.length === 0 && searchQuery && (
          <div className="text-center text-text-secondary text-sm py-8">
            No matching sessions.
          </div>
        )}

        {/* Archived section */}
        {archivedSessions.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="currentColor"
                className={`transition-transform ${showArchived ? 'rotate-90' : ''}`}
              >
                <path d="M8 5l8 7-8 7z" />
              </svg>
              Archived ({archivedSessions.length})
            </button>
            {showArchived && (
              <div className="mt-1">
                {archivedSessions.map((session) => (
                  <PanelErrorBoundary key={session.id} name={`Session ${session.branch}`}>
                    <SessionCard
                      sessionId={session.id}
                      onSelect={handleSelectArchived}
                      onDelete={handleDelete}
                      onArchive={handleUnarchive}
                    />
                  </PanelErrorBoundary>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {pendingDeleteSession && (
        <DeleteSessionDialog
          session={pendingDeleteSession}
          repos={repos}
          deleteWorktree={deleteWorktree}
          setDeleteWorktree={setDeleteWorktree}
          onConfirm={() => {
            const repo = repos.find(r => r.id === pendingDeleteSession.repoId)
            const isManagedWorktree = !!pendingDeleteSession.repoId && !!repo && pendingDeleteSession.branch !== repo.defaultBranch
            onDeleteSession(pendingDeleteSession.id, isManagedWorktree && deleteWorktree)
            setPendingDeleteId(null)
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  )
}
