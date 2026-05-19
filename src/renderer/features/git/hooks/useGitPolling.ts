/**
 * Drives refresh of the active session's git status.
 *
 * Refresh triggers:
 *  - Session becomes active / transitions out of initializing: one-shot refresh.
 *  - Agent is actively working (PTY output arriving): poll every 2s. The
 *    `session.status` field flips to `'working'` on PTY data and back to
 *    `'idle'` after ~1s of silence (see `updateAgentMonitor` in sessions.ts).
 *    No polling while idle — we trust the last refresh and rely on events.
 *  - `broomy:agent-finished` (working → idle transition): full refresh with
 *    `includePr: true` to pick up any PR changes the agent pushed.
 *
 * All fetch/compute/write logic lives in `refreshSession`; this hook just
 * owns the triggers.
 *
 * Consumers read the resulting git status from the session itself
 * (`session.gitStatus`) rather than through this hook's return value — these
 * fields are exposed only for backwards compatibility with existing panels.
 */
import { useEffect, useMemo } from 'react'
import type { Session } from '../../../store/sessions'

export function useGitPolling({
  activeSession,
  refreshSession,
}: {
  activeSession: Session | undefined
  refreshSession: (sessionId: string, opts?: { includePr?: boolean }) => Promise<void>
}) {
  const activeId = activeSession?.id
  const activeStatus = activeSession?.status
  const isReady = activeSession && activeStatus !== 'initializing'

  useEffect(() => {
    if (!isReady || !activeId) return
    void refreshSession(activeId)
    if (activeStatus !== 'working') return
    const interval = setInterval(() => { void refreshSession(activeId) }, 2000)
    return () => clearInterval(interval)
  }, [activeId, activeStatus, isReady, refreshSession])

  useEffect(() => {
    if (!activeId) return
    const handler = () => { void refreshSession(activeId, { includePr: true }) }
    document.addEventListener('broomy:agent-finished', handler)
    return () => document.removeEventListener('broomy:agent-finished', handler)
  }, [activeId, refreshSession])

  const activeSessionGitStatusResult = activeSession?.gitStatus ?? null
  const activeSessionGitStatus = useMemo(() =>
    activeSessionGitStatusResult?.files ?? [],
    [activeSessionGitStatusResult]
  )

  const selectedFileStatus = useMemo(() => {
    if (!activeSession?.selectedFilePath || !activeSession.directory) return null
    const files = activeSessionGitStatusResult?.files ?? []
    const relativePath = activeSession.selectedFilePath.replace(`${activeSession.directory}/`, '')
    return files.find(f => f.path === relativePath)?.status ?? null
  }, [activeSession?.selectedFilePath, activeSession?.directory, activeSessionGitStatusResult])

  const fetchGitStatus = useMemo(() =>
    activeId ? () => refreshSession(activeId) : () => Promise.resolve(),
    [activeId, refreshSession]
  )

  return {
    activeSessionGitStatus,
    activeSessionGitStatusResult,
    selectedFileStatus,
    fetchGitStatus,
  }
}
