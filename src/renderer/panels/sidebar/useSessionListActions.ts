/**
 * Stable, session-id-scoped click handlers for the archive/unarchive/pause
 * actions on session cards, plus selecting a session out of the archived list.
 *
 * Pulled out of SessionList so the handlers can stay readable (rather than
 * squeezed onto one line to fit under the component's max-lines-per-function
 * budget) without pushing the component itself over that budget.
 */
import { useCallback } from 'react'

interface UseSessionListActionsArgs {
  onArchiveSession: (id: string) => void
  onUnarchiveSession: (id: string) => void
  onPauseSession?: (id: string) => void
  onSelectSession: (id: string) => void
}

export function useSessionListActions({
  onArchiveSession,
  onUnarchiveSession,
  onPauseSession,
  onSelectSession,
}: UseSessionListActionsArgs) {
  const handleArchive = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    onArchiveSession(sessionId)
  }, [onArchiveSession])

  const handleUnarchive = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    onUnarchiveSession(sessionId)
  }, [onUnarchiveSession])

  const handlePause = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    onPauseSession?.(sessionId)
  }, [onPauseSession])

  const handleSelectArchived = useCallback((sessionId: string) => {
    onUnarchiveSession(sessionId)
    onSelectSession(sessionId)
  }, [onUnarchiveSession, onSelectSession])

  return { handleArchive, handleUnarchive, handlePause, handleSelectArchived }
}
