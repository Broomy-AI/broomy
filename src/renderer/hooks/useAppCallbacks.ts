/**
 * Provides memoized callback functions for top-level app actions such as session management, panel toggling, and layout updates.
 */
import { useCallback } from 'react'
import { type Session, type LayoutSizes } from '../store/sessions'
import { PANEL_IDS } from '../panels'
import type { AgentConfig } from '../store/agents'
import type { PrState } from '../utils/branchStatus'
import type { DuplicateSessionResult } from '../store/sessionCoreActions'
import { focusAgentTerminal } from '../utils/focusHelpers'


interface AppCallbacksDeps {
  sessions: Session[]
  activeSessionId: string | null
  agents: AgentConfig[]
  repos: { id: string; rootDir: string; defaultBranch: string; isolated?: boolean; skipApproval?: boolean }[]
  addSession: (directory: string, agentId: string | null, extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; issueUrl?: string; name?: string; sessionType?: 'default' | 'review'; prNumber?: number; prTitle?: string; prUrl?: string; prBaseBranch?: string }) => Promise<DuplicateSessionResult | undefined>
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  togglePanel: (sessionId: string, panelId: string) => void
  updateLayoutSize: (id: string, key: keyof LayoutSizes, value: number) => void
  setFileViewerPosition: (id: string, position: 'top' | 'left') => void
  updatePrState: (sessionId: string, prState: PrState, prNumber?: number, prUrl?: string) => void
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
  removeSession,
  setActiveSession,
  togglePanel,
  updateLayoutSize,
  setFileViewerPosition,
  updatePrState,
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
    for (const session of sessions) {
      try {
        const prResult = await window.gh.prStatus(session.directory)
        if (prResult) {
          updatePrState(session.id, prResult.state, prResult.number, prResult.url)
        } else {
          updatePrState(session.id, null)
        }
      } catch {
        // Ignore errors for individual sessions
      }
    }
  }, [sessions, updatePrState])

  const getAgentCommand = useCallback((session: Session) => {
    if (!session.agentId) return undefined
    const agent = agents.find((a) => a.id === session.agentId)
    if (!agent?.command) return undefined
    const repo = session.repoId ? repos.find((r) => r.id === session.repoId) : undefined
    if (repo?.skipApproval && agent.skipApprovalFlag) {
      const flag = agent.skipApprovalFlag
      if (!agent.command.includes(flag)) {
        return `${agent.command} ${flag}`
      }
    }
    return agent.command
  }, [agents, repos])

  const getAgentEnv = useCallback((session: Session) => {
    if (!session.agentId) return undefined
    const agent = agents.find((a) => a.id === session.agentId)
    return agent?.env
  }, [agents])

  const getAgentResumeCommand = useCallback((session: Session) => {
    if (!session.agentId) return undefined
    return agents.find((a) => a.id === session.agentId)?.resumeCommand
  }, [agents])

  const getRepoIsolation = useCallback((session: Session) => {
    if (!session.repoId) return undefined
    const repo = repos.find((r) => r.id === session.repoId)
    if (!repo?.isolated) return undefined
    return { isolated: true, repoRootDir: repo.rootDir }
  }, [repos])

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
    focusAgentTerminal()
  }, [setActiveSession])

  const handleDeleteSession = useCallback((id: string, deleteWorktree: boolean) => {
    // Remove session immediately for responsive UI
    const session = sessions.find(s => s.id === id)
    removeSession(id)

    // Clean up worktree and branch in background (non-blocking)
    if (deleteWorktree && session?.repoId) {
      const repo = repos.find(r => r.id === session.repoId)
      if (repo) {
        const mainDir = `${repo.rootDir}/${repo.defaultBranch}`
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
  }, [sessions, repos, removeSession, onError])

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
    refreshPrStatus,
    getAgentCommand,
    getAgentEnv,
    getAgentResumeCommand,
    getRepoIsolation,
    handleLayoutSizeChange,
    handleFileViewerPositionChange,
    handleSelectSession,
    handleTogglePanel,
    handleToggleFileViewer,
  }
}
