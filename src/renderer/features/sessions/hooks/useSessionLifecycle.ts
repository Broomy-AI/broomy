/**
 * Manages session lifecycle including initial data loading, profile switching, session read marking, and window focus behavior.
 */
import { useEffect, useCallback, useState } from 'react'
import type { Session } from '../../../store/sessions'
import type { ProfileData } from '../../../store/profiles'
import { terminalBufferRegistry } from '../../../shared/utils/terminalBufferRegistry'
import { ptyCaptureRegistry } from '../../../shared/utils/ptyCaptureRegistry'
import { scrollLogRegistry } from '../../../panels/agent/utils/scrollLog'
import { loadMonacoProjectContext } from '../../../shared/utils/monacoProjectContext'
import { restoreSessionFocus } from '../../../shared/utils/focusHelpers'
import { fetchReviewStatus } from '../../../shared/utils/reviewStatus'

function fileSafeSlug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'session'
}

async function saveCapture(activeSession: Session): Promise<void> {
  const sessionId = activeSession.id
  const cast = ptyCaptureRegistry.serializeAsciinema(sessionId)
  if (!cast) {
    console.warn('[capture] No PTY capture available for session', sessionId)
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
  const defaultName = `broomy-capture-${fileSafeSlug(activeSession.name)}-${stamp}.cast`

  const chosenPath = await window.dialog.saveFile({
    defaultPath: defaultName,
    title: 'Save terminal capture',
    filters: [{ name: 'Asciinema cast', extensions: ['cast'] }, { name: 'All files', extensions: ['*'] }],
  })
  if (!chosenPath) return

  const metaPath = chosenPath.endsWith('.cast') ? `${chosenPath.slice(0, -5)}.meta.json` : `${chosenPath}.meta.json`
  const sidecar = {
    session: {
      id: activeSession.id,
      name: activeSession.name,
      directory: activeSession.directory,
      status: activeSession.status,
      lastMessage: activeSession.lastMessage ?? null,
    },
    renderedBufferTail: terminalBufferRegistry.getLastLines(activeSession.id, 200) ?? null,
    scrollLog: scrollLogRegistry.format(activeSession.id),
    capturedAt: new Date().toISOString(),
    buildCommit: typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'unknown',
  }

  const castResult = await window.fs.writeFile(chosenPath, cast)
  if (!castResult.success) {
    console.error('[capture] Failed to write cast file:', castResult.error)
    return
  }
  const metaResult = await window.fs.writeFile(metaPath, JSON.stringify(sidecar, null, 2))
  if (!metaResult.success) {
    console.error('[capture] Failed to write sidecar:', metaResult.error)
  }
}

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

  // Keyboard shortcut to save a terminal-rendering capture (Cmd+Shift+C).
  // Writes an asciinema v2 .cast file (raw PTY byte stream) plus a sidecar
  // .meta.json with session metadata and scroll log. The .cast can be replayed
  // through the terminal harness to reproduce rendering bugs deterministically.
  useEffect(() => {
    const handleCaptureShortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
        if (!activeSession) return
        e.preventDefault()
        void saveCapture(activeSession)
      }
    }

    window.addEventListener('keydown', handleCaptureShortcut)
    return () => window.removeEventListener('keydown', handleCaptureShortcut)
  }, [activeSession])

  return {
    activeDirectoryExists,
    handleSwitchProfile,
  }
}
