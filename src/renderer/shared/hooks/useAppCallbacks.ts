/**
 * Provides memoized callback functions for top-level app actions such as session management, panel toggling, and layout updates.
 */
import { useCallback } from 'react'
import { type Session, type LayoutSizes } from '../../store/sessions'
import { PANEL_IDS } from '../../panels'
import type { AgentConfig } from '../../store/agents'
import type { PrState } from '../../features/git/branchStatus'
import type { DuplicateSessionResult } from '../../store/sessionCoreActions'
import { restoreSessionFocus } from '../utils/focusHelpers'
import { fetchReviewStatus } from '../utils/reviewStatus'
import { useBackgroundInit } from '../../panels/settings/useBackgroundInit'


interface AppCallbacksDeps {
  sessions: Session[]
  activeSessionId: string | null
  agents: AgentConfig[]
  repos: { id: string; rootDir: string; defaultBranch: string; isolated?: boolean; skipApproval?: boolean; name?: string; defaultAgentId?: string }[]
  addSession: (directory: string, agentId: string | null, extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; issueUrl?: string; name?: string; sessionType?: 'default' | 'review'; prNumber?: number; prTitle?: string; prUrl?: string; prBaseBranch?: string }) => Promise<DuplicateSessionResult | undefined>
  addInitializingSession: (params: { directory: string; branch: string; agentId: string | null; extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; issueUrl?: string; name?: string } }) => string
  finalizeSession: (id: string) => void
  failSession: (id: string, error: string) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  togglePanel: (sessionId: string, panelId: string) => void
  updateLayoutSize: (id: string, key: keyof LayoutSizes, value: number) => void
  setFileViewerPosition: (id: string, position: 'top' | 'left') => void
  updatePrState: (sessionId: string, prState: PrState, prNumber?: number, prUrl?: string) => void
  updateFeedbackStatus: (sessionId: string, hasFeedback: boolean) => void
  updateChecksStatus: (sessionId: string, checksStatus: 'passed' | 'failed' | 'pending' | 'none') => void
  updateReviewStatus: (sessionId: string, reviewStatus: 'pending' | 'reviewed') => void
  setShowNewSessionDialog: (show: boolean) => void
  onSessionAlreadyExists?: (info: { name: string; wasArchived: boolean }) => void
  onError: (msg: string) => void
}

export function useAppCallbacks({
  sessions,
  activeSessionId,
  agents,
  repos,
  addSession,
  addInitializingSession,
  finalizeSession,
  failSession,
  removeSession,
  setActiveSession,
  togglePanel,
  updateLayoutSize,
  setFileViewerPosition,
  updatePrState,
  updateFeedbackStatus,
  updateChecksStatus,
  updateReviewStatus,
  setShowNewSessionDialog,
  onSessionAlreadyExists,
  onError,
}: AppCallbacksDeps) {

  const handleNewSession = useCallback(() => {
    setShowNewSessionDialog(true)
  }, [setShowNewSessionDialog])

  const handleNewSessionComplete = useCallback(async (
    directory: string,
    agentId: string | null,
    extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; issueUrl?: string; name?: string; sessionType?: 'default' | 'review'; prNumber?: number; prTitle?: string; prUrl?: string; prBaseBranch?: string }
  ) => {
    try {
      const result = await addSession(directory, agentId, extra)
      if (result) {
        onSessionAlreadyExists?.({ name: result.existingSessionName, wasArchived: result.wasArchived })
      }
    } catch (error) {
      onError(`Failed to add session: ${error instanceof Error ? error.message : String(error)}`)
    }
    setShowNewSessionDialog(false)
  }, [addSession, onError, setShowNewSessionDialog, onSessionAlreadyExists])

  const handleCancelNewSession = useCallback(() => {
    setShowNewSessionDialog(false)
  }, [setShowNewSessionDialog])

  const refreshPrStatus = useCallback(async () => {
    await Promise.allSettled(sessions.map(async (session) => {
      const prResult = await window.gh.prStatus(session.directory)
      if (prResult) {
        updatePrState(session.id, prResult.state, prResult.number, prResult.url)
        // Fetch feedback and checks in parallel for open PRs
        if (prResult.state === 'OPEN') {
          const [checks, feedback] = await Promise.all([
            window.gh.prChecksStatus(session.directory).catch(() => 'none' as const),
            window.gh.prFeedbackStatus(session.directory, prResult.number).catch(() => false),
          ])
          updateChecksStatus(session.id, checks)
          updateFeedbackStatus(session.id, feedback)
        } else {
          updateChecksStatus(session.id, 'none')
          updateFeedbackStatus(session.id, false)
        }
      } else {
        updatePrState(session.id, null)
        updateChecksStatus(session.id, 'none')
        updateFeedbackStatus(session.id, false)
      }
      await fetchReviewStatus(session, updateReviewStatus)
    }))
  }, [sessions, updatePrState, updateFeedbackStatus, updateChecksStatus, updateReviewStatus])

  const getAgentCommand = useCallback((session: Session) => {
    if (!session.agentId) return undefined
    const agent = agents.find((a) => a.id === session.agentId)
    if (!agent?.command) return undefined
    // If the session is linked to a repo, wait until repo data is available
    // before returning a command. This prevents spawning the agent without
    // repo-level flags (e.g. skipApproval) that get appended to the command.
    if (session.repoId && !repos.find((r) => r.id === session.repoId)) {
      return undefined
    }
    // Find repo by ID, or fall back to directory matching for sessions
    // that predate the repo system (no repoId set).
    const repo = session.repoId
      ? repos.find((r) => r.id === session.repoId)
      : repos.find((r) => session.directory.startsWith(`${r.rootDir}/`) || session.directory === r.rootDir)
    const command = (repo?.skipApproval && agent.skipApprovalFlag && !agent.command.includes(agent.skipApprovalFlag))
      ? `${agent.command} ${agent.skipApprovalFlag}`
      : agent.command
    return command
  }, [agents, repos])

  const getAgentEnv = useCallback((session: Session) => {
    if (!session.agentId) return undefined
    const agent = agents.find((a) => a.id === session.agentId)
    return agent?.env
  }, [agents])

  const getRepoIsolation = useCallback((session: Session) => {
    if (!session.repoId) return undefined
    const repo = repos.find((r) => r.id === session.repoId)
    if (!repo?.isolated) return undefined
    return { isolated: true, repoRootDir: repo.rootDir }
  }, [repos])

  const getAgentConnectionMode = useCallback((session: Session): 'terminal' | 'api' | undefined => {
    if (!session.agentId) return undefined
    const agent = agents.find((a) => a.id === session.agentId)
    return agent?.connectionMode
  }, [agents])

  const getAgentModel = useCallback((session: Session): string | undefined => {
    if (!session.agentId) return undefined
    const agent = agents.find((a) => a.id === session.agentId)
    return agent?.model
  }, [agents])

  const getAgentEffort = useCallback((session: Session): 'low' | 'medium' | 'high' | 'max' | undefined => {
    if (!session.agentId) return undefined
    const agent = agents.find((a) => a.id === session.agentId)
    return agent?.effort
  }, [agents])

  const getAgentSkipApproval = useCallback((session: Session): boolean => {
    // Match repo by ID, or fall back to directory matching (same as getAgentCommand)
    const repo = session.repoId
      ? repos.find((r) => r.id === session.repoId)
      : repos.find((r) => session.directory.startsWith(`${r.rootDir}/`) || session.directory === r.rootDir)
    return repo?.skipApproval ?? false
  }, [repos])

  const { handleStartBranchSession, handleStartExistingBranchSession, abortInit } = useBackgroundInit({
    addInitializingSession,
    finalizeSession,
    failSession,
    setShowNewSessionDialog,
  })

  const handleLayoutSizeChange = useCallback((key: keyof LayoutSizes, value: number) => {
    if (activeSessionId) {
      updateLayoutSize(activeSessionId, key, value)
    }
  }, [activeSessionId, updateLayoutSize])

  const handleFileViewerPositionChange = useCallback((position: 'top' | 'left') => {
    if (activeSessionId) {
      setFileViewerPosition(activeSessionId, position)
    }
  }, [activeSessionId, setFileViewerPosition])

  const handleSelectSession = useCallback((id: string) => {
    setActiveSession(id)
    restoreSessionFocus(id)
  }, [setActiveSession])

  const handleDeleteSession = useCallback((id: string, deleteWorktree: boolean) => {
    // Abort any in-flight background init for this session
    abortInit(id)

    // Remove session immediately for responsive UI
    const session = sessions.find(s => s.id === id)
    removeSession(id)

    // Clean up worktree and branch in background (non-blocking)
    if (deleteWorktree && session?.repoId) {
      const repo = repos.find(r => r.id === session.repoId)
      if (repo) {
        const mainDir = `${repo.rootDir}/main`
        void (async () => {
          try {
            const removeResult = await window.git.worktreeRemove(mainDir, session.directory)
            if (!removeResult.success) {
              onError(`Failed to remove worktree: ${removeResult.error}`)
            }
          } catch (error) {
            onError(`Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`)
          }
          try {
            const branchResult = await window.git.deleteBranch(mainDir, session.branch)
            if (!branchResult.success) {
              onError(`Failed to delete branch: ${branchResult.error}`)
            }
          } catch (error) {
            onError(`Failed to delete branch: ${error instanceof Error ? error.message : String(error)}`)
          }
        })()
      }
    }
  }, [sessions, repos, removeSession, onError, abortInit])

  const handleTogglePanel = useCallback((panelId: string) => {
    if (activeSessionId) {
      togglePanel(activeSessionId, panelId)
    }
  }, [activeSessionId, togglePanel])

  const handleToggleFileViewer = useCallback(() => {
    if (activeSessionId) {
      togglePanel(activeSessionId, PANEL_IDS.FILE_VIEWER)
    }
  }, [activeSessionId, togglePanel])

  return {
    handleNewSession,
    handleNewSessionComplete,
    handleCancelNewSession,
    handleDeleteSession,
    handleStartBranchSession,
    handleStartExistingBranchSession,
    refreshPrStatus,
    getAgentCommand,
    getAgentEnv,
    getRepoIsolation,
    getAgentConnectionMode,
    getAgentModel,
    getAgentEffort,
    getAgentSkipApproval,
    handleLayoutSizeChange,
    handleFileViewerPositionChange,
    handleSelectSession,
    handleTogglePanel,
    handleToggleFileViewer,
  }
}
