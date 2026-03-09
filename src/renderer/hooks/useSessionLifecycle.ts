/**
 * Manages session lifecycle including initial data loading, profile switching, session read marking, and window focus behavior.
 */
import { useEffect, useCallback, useState, useMemo, useRef } from 'react'
import type { Session } from '../store/sessions'
import type { ProfileData } from '../store/profiles'
import { terminalBufferRegistry } from '../utils/terminalBufferRegistry'
import { loadMonacoProjectContext } from '../utils/monacoProjectContext'
import { focusActiveTerminal } from '../utils/focusHelpers'

export function useSessionLifecycle({
  sessions,
  activeSession,
  activeSessionId,
  currentProfileId,
  currentProfile,
  profiles,
  loadProfiles,
  loadSessions,
  loadAgents,
  loadRepos,
  checkGhAvailability,
  checkGitAvailability,
  switchProfile,
  markSessionRead,
  updateReviewStatus,
}: {
  sessions: Session[]
  activeSession: Session | undefined
  activeSessionId: string | null
  currentProfileId: string
  currentProfile: ProfileData | undefined
  profiles: ProfileData[]
  loadProfiles: () => Promise<void>
  loadSessions: (profileId: string) => Promise<void>
  loadAgents: (profileId: string) => Promise<void>
  loadRepos: (profileId: string) => Promise<void>
  checkGhAvailability: () => Promise<void>
  checkGitAvailability: () => Promise<void>
  switchProfile: (profileId: string) => Promise<void>
  markSessionRead: (sessionId: string) => void
  updateReviewStatus: (sessionId: string, status: 'pending' | 'reviewed') => void
}) {
  const [directoryExists, setDirectoryExists] = useState<Record<string, boolean>>({})

  // Stable key that only changes when session IDs/directories change (not on status updates)
  const sessionDirKey = useMemo(
    () => sessions.filter(s => !s.isArchived).map(s => `${s.id}:${s.directory}`).join(','),
    [sessions],
  )
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  // Check if session directories exist
  useEffect(() => {
    const activeSessions = sessionsRef.current.filter(s => !s.isArchived)
    const checkDirectories = async () => {
      const results: Record<string, boolean> = {}
      for (const session of activeSessions) {
        results[session.id] = await window.fs.exists(session.directory)
      }
      setDirectoryExists(results)
    }

    if (activeSessions.length > 0) {
      void checkDirectories()
    }
  }, [sessionDirKey])

  // Load profiles, then sessions/agents/repos for the current profile
  useEffect(() => {
    void loadProfiles().then(() => {
      void loadSessions(currentProfileId).catch((err: unknown) => console.error('[startup] Failed to load sessions:', err))
      void loadAgents(currentProfileId).catch((err: unknown) => console.error('[startup] Failed to load agents:', err))
      void loadRepos(currentProfileId).catch((err: unknown) => console.error('[startup] Failed to load repos:', err))
      void checkGhAvailability().catch((err: unknown) => console.error('[startup] Failed to check gh:', err))
      void checkGitAvailability().catch((err: unknown) => console.error('[startup] Failed to check git:', err))
    }).catch((err: unknown) => console.error('[startup] Failed to load profiles:', err))
  }, [])

  // Handle profile switching: open the profile in a new window
  const handleSwitchProfile = useCallback(async (profileId: string) => {
    await switchProfile(profileId)
  }, [switchProfile])

  // Update window title to show active session name and profile
  useEffect(() => {
    const profileLabel = currentProfile && profiles.length > 1 ? ` [${currentProfile.name}]` : ''
    document.title = activeSession ? `${activeSession.name}${profileLabel} — Broomy` : `Broomy${profileLabel}`
  }, [activeSession?.name, activeSession?.id, currentProfile?.name, profiles.length])

  // Load TypeScript project context when active session changes
  useEffect(() => {
    if (activeSession?.directory) {
      void loadMonacoProjectContext(activeSession.directory)
    }
  }, [activeSession?.directory])

  // Mark session as read when it becomes active, and focus the active terminal tab
  useEffect(() => {
    if (activeSessionId) {
      markSessionRead(activeSessionId)
      // Focus the active terminal after a short delay to let it render
      const timeout = setTimeout(() => {
        focusActiveTerminal()
      }, 100)
      return () => clearTimeout(timeout)
    }
  }, [activeSessionId, markSessionRead])

  // Check review status when switching to a review session
  useEffect(() => {
    if (activeSession?.sessionType !== 'review' || !activeSession.prNumber) return

    let cancelled = false
    void window.gh.myReviewStatus(activeSession.directory, activeSession.prNumber).then((status) => {
      if (cancelled || !status) return
      updateReviewStatus(activeSession.id, status)
    }).catch(() => {
      // Ignore errors
    })
    return () => { cancelled = true }
  }, [activeSessionId])

  // Branch changes are detected via .git/HEAD file watchers (useGitBranchWatcher)
  // refreshAllBranches is called explicitly after push operations

  // Keyboard shortcut to copy terminal content + summary (Cmd+Shift+C)
  useEffect(() => {
    const handleCopyTerminal = (e: KeyboardEvent) => {
      // Cmd+Shift+C (Mac) or Ctrl+Shift+C (other)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
        if (!activeSession) return
        e.preventDefault()

        // Get terminal buffer (last 200 lines to keep it manageable)
        const buffer = terminalBufferRegistry.getLastLines(activeSession.id, 200)

        // Build the copy content with summary
        let content = '=== Agent Session Debug Info ===\n\n'
        content += `Session: ${activeSession.name}\n`
        content += `Directory: ${activeSession.directory}\n`
        content += `Status: ${activeSession.status}\n`
        content += `Last Message: ${activeSession.lastMessage || '(none)'}\n`
        content += '\n=== Terminal Output (last 200 lines) ===\n\n'
        content += buffer || '(no content)'

        void navigator.clipboard.writeText(content).catch((err: unknown) => {
          console.error('Failed to copy to clipboard:', err)
        })
      }
    }

    window.addEventListener('keydown', handleCopyTerminal)
    return () => window.removeEventListener('keydown', handleCopyTerminal)
  }, [activeSession])

  const activeDirectoryExists = activeSession ? (directoryExists[activeSession.id] ?? true) : true

  return {
    directoryExists,
    activeDirectoryExists,
    handleSwitchProfile,
  }
}
