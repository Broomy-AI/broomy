import { useEffect, useCallback, useState } from 'react'
import type { Session } from '../store/sessions'
import type { ProfileData } from '../store/profiles'
import { PANEL_IDS } from '../panels'
import { terminalBufferRegistry } from '../utils/terminalBufferRegistry'
import { loadMonacoProjectContext } from '../utils/monacoProjectContext'

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
  switchProfile,
  markSessionRead,
  refreshAllBranches,
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
  switchProfile: (profileId: string) => Promise<void>
  markSessionRead: (sessionId: string) => void
  refreshAllBranches: () => void | Promise<void>
}) {
  const [directoryExists, setDirectoryExists] = useState<Record<string, boolean>>({})

  // Check if session directories exist
  useEffect(() => {
    const checkDirectories = async () => {
      const results: Record<string, boolean> = {}
      for (const session of sessions) {
        results[session.id] = await window.fs.exists(session.directory)
      }
      setDirectoryExists(results)
    }

    if (sessions.length > 0) {
      void checkDirectories()
    }
  }, [sessions])

  // Load profiles, then sessions/agents/repos for the current profile
  useEffect(() => {
    void loadProfiles().then(() => {
      void loadSessions(currentProfileId)
      void loadAgents(currentProfileId)
      void loadRepos(currentProfileId)
      void checkGhAvailability()
    })
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

  // Mark session as read when it becomes active, and focus agent terminal
  useEffect(() => {
    if (activeSessionId) {
      markSessionRead(activeSessionId)
      // Focus the agent terminal after a short delay to let it render
      const timeout = setTimeout(() => {
        const container = document.querySelector(`[data-panel-id="${PANEL_IDS.AGENT_TERMINAL}"]`)
        if (!container) return
        const xtermTextarea = container.querySelector<HTMLElement>('.xterm-helper-textarea')
        if (xtermTextarea) xtermTextarea.focus()
      }, 100)
      return () => clearTimeout(timeout)
    }
  }, [activeSessionId, markSessionRead])

  // Poll for branch changes every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (sessions.length > 0) {
        void refreshAllBranches()
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [sessions.length, refreshAllBranches])

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
