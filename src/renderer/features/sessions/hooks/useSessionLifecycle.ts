/**
 * Manages session lifecycle including initial data loading, profile switching, session read marking, and window focus behavior.
 */
import { useEffect, useCallback, useState } from 'react'
import type { Session } from '../../../store/sessions'
import type { ProfileData } from '../../../store/profiles'
import { terminalBufferRegistry } from '../../../shared/utils/terminalBufferRegistry'
import { scrollLogRegistry } from '../../../panels/agent/utils/scrollLog'
import { loadMonacoProjectContext } from '../../../shared/utils/monacoProjectContext'
import { restoreSessionFocus } from '../../../shared/utils/focusHelpers'
import { fetchReviewStatus } from '../../../shared/utils/reviewStatus'

export function useSessionLifecycle({
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
  const [activeDirectoryExists, setActiveDirectoryExists] = useState(true)

  // Check if the active session's directory exists (only the active one, to avoid
  // triggering macOS file-access permission prompts for every session on startup)
  useEffect(() => {
    if (!activeSession || activeSession.status === 'initializing') {
      setActiveDirectoryExists(true)
      return
    }
    let cancelled = false
    void window.fs.exists(activeSession.directory).then((exists) => {
      if (!cancelled) setActiveDirectoryExists(exists)
    })
    return () => { cancelled = true }
  }, [activeSession?.id, activeSession?.directory, activeSession?.status])

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
    if (activeSession?.directory && activeSession.status !== 'initializing') {
      void loadMonacoProjectContext(activeSession.directory)
    }
  }, [activeSession?.directory, activeSession?.status])

  // Mark session as read when it becomes active, and focus the active terminal tab
  useEffect(() => {
    if (activeSessionId) {
      markSessionRead(activeSessionId)
      // Restore focus to the last focused panel after a short delay to let it render
      const timeout = setTimeout(() => {
        restoreSessionFocus(activeSessionId)
      }, 100)
      return () => clearTimeout(timeout)
    }
  }, [activeSessionId, markSessionRead])

  // Check review status when switching to a review session
  useEffect(() => {
    if (!activeSession) return
    let cancelled = false
    void fetchReviewStatus(activeSession, (id, status) => {
      if (!cancelled) updateReviewStatus(id, status)
    })
    return () => { cancelled = true }
  }, [activeSessionId])

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
        // Scroll event log for debugging viewport jump issues
        const scrollLogContent = scrollLogRegistry.format(activeSession.id)
        content += '\n=== Scroll Event Log ===\n\n'
        content += scrollLogContent
        content += '\n\n=== Terminal Output (last 200 lines) ===\n\n'
        content += buffer || '(no content)'

        void navigator.clipboard.writeText(content).catch((err: unknown) => {
          console.error('Failed to copy to clipboard:', err)
        })
      }
    }

    window.addEventListener('keydown', handleCopyTerminal)
    return () => window.removeEventListener('keydown', handleCopyTerminal)
  }, [activeSession])

  return {
    activeDirectoryExists,
    handleSwitchProfile,
  }
}
