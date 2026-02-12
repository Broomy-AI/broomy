/**
 * Root application component that orchestrates all stores, effects, and panel wiring.
 *
 * AppContent initializes the four Zustand stores (sessions, agents, repos, profiles) on mount,
 * polls git status every 2 seconds for the active session, computes derived branch status,
 * and builds a memoized panel map that Layout renders into the drag-to-resize shell. It also
 * manages file navigation with unsaved-changes guards and global keyboard shortcuts.
 * The outer App component wraps AppContent in the PanelProvider context.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import Layout from './components/Layout'
import SessionList from './components/SessionList'
import Terminal from './components/Terminal'
import TabbedTerminal from './components/TabbedTerminal'
import Explorer from './components/explorer'
import FileViewer from './components/FileViewer'
import ReviewPanel from './components/ReviewPanel'
import AgentSettings from './components/AgentSettings'
import NewSessionDialog from './components/NewSessionDialog'
import PanelPicker from './components/PanelPicker'
import ProfileChip from './components/ProfileChip'
import { useSessionStore, type Session, type SessionStatus, type LayoutSizes } from './store/sessions'
import { useAgentStore } from './store/agents'
import { useRepoStore } from './store/repos'
import { useProfileStore } from './store/profiles'
import { useErrorStore } from './store/errors'
import { PanelProvider, PANEL_IDS } from './panels'
import { useGitPolling } from './hooks/useGitPolling'
import { useFileNavigation } from './hooks/useFileNavigation'
import { useSessionLifecycle } from './hooks/useSessionLifecycle'

// Re-export types for backwards compatibility
export type { Session, SessionStatus }

// Default layout sizes for when there's no active session
const DEFAULT_LAYOUT_SIZES: LayoutSizes = {
  explorerWidth: 256,
  fileViewerSize: 300,
  userTerminalHeight: 192,
  diffPanelWidth: 320,
  reviewPanelWidth: 320,
}

function AppContent() {
  const {
    sessions,
    activeSessionId,
    isLoading,
    sidebarWidth,
    toolbarPanels,
    globalPanelVisibility,
    loadSessions,
    addSession,
    removeSession,
    setActiveSession,
    refreshAllBranches,
    togglePanel,
    toggleGlobalPanel,
    setSidebarWidth,
    setToolbarPanels,
    selectFile,
    setExplorerFilter,
    setFileViewerPosition,
    updateLayoutSize,
    markSessionRead,
    recordPushToMain,
    clearPushToMain,
    markHasHadCommits,
    updateBranchStatus,
    updatePrState,
    archiveSession,
    unarchiveSession,
  } = useSessionStore()

  const { agents, loadAgents } = useAgentStore()
  const { repos, loadRepos, checkGhAvailability } = useRepoStore()
  const { currentProfileId, profiles, loadProfiles, switchProfile } = useProfileStore()
  const { addError } = useErrorStore()
  const currentProfile = profiles.find((p) => p.id === currentProfileId)

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false)
  const [showPanelPicker, setShowPanelPicker] = useState(false)

  // Git polling hook
  const {
    gitStatusBySession,
    activeSessionGitStatus,
    activeSessionGitStatusResult,
    selectedFileStatus,
    fetchGitStatus,
  } = useGitPolling({
    sessions,
    activeSession,
    repos,
    markHasHadCommits,
    updateBranchStatus,
  })

  // File navigation hook
  const {
    openFileInDiffMode,
    scrollToLine,
    searchHighlight,
    diffBaseRef,
    diffCurrentRef,
    diffLabel,
    isFileViewerDirty,
    setIsFileViewerDirty,
    pendingNavigation,
    saveCurrentFileRef,
    navigateToFile,
    handlePendingSave,
    handlePendingDiscard,
    handlePendingCancel,
  } = useFileNavigation({
    activeSessionId: activeSessionId ?? null,
    activeSessionSelectedFilePath: activeSession?.selectedFilePath ?? null,
    selectFile,
  })

  // Session lifecycle hook
  const {
    activeDirectoryExists,
    handleSwitchProfile,
  } = useSessionLifecycle({
    sessions,
    activeSession,
    activeSessionId: activeSessionId ?? null,
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
  })

  const handleNewSession = () => {
    setShowNewSessionDialog(true)
  }

  const handleNewSessionComplete = async (
    directory: string,
    agentId: string | null,
    extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; name?: string; sessionType?: 'default' | 'review'; prNumber?: number; prTitle?: string; prUrl?: string; prBaseBranch?: string }
  ) => {
    try {
      await addSession(directory, agentId, extra)
    } catch (error) {
      addError(`Failed to add session: ${error instanceof Error ? error.message : error}`)
    }
    setShowNewSessionDialog(false)
  }

  const handleCancelNewSession = () => {
    setShowNewSessionDialog(false)
  }

  // Refresh PR status for all sessions
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

  // Memoize getAgentCommand to ensure stable values
  const getAgentCommand = useCallback((session: Session) => {
    if (!session.agentId) return undefined
    const agent = agents.find((a) => a.id === session.agentId)
    return agent?.command
  }, [agents])

  // Get agent env vars
  const getAgentEnv = useCallback((session: Session) => {
    if (!session.agentId) return undefined
    const agent = agents.find((a) => a.id === session.agentId)
    return agent?.env
  }, [agents])

  const handleLayoutSizeChange = (key: keyof LayoutSizes, value: number) => {
    if (activeSessionId) {
      updateLayoutSize(activeSessionId, key, value)
    }
  }

  const handleFileViewerPositionChange = (position: 'top' | 'left') => {
    if (activeSessionId) {
      setFileViewerPosition(activeSessionId, position)
    }
  }

  const handleDeleteSession = useCallback(async (id: string, deleteWorktree: boolean) => {
    if (deleteWorktree) {
      const session = sessions.find(s => s.id === id)
      if (session?.repoId) {
        const repo = repos.find(r => r.id === session.repoId)
        if (repo) {
          const mainDir = `${repo.rootDir}/${repo.defaultBranch}`
          const removeResult = await window.git.worktreeRemove(mainDir, session.directory)
          if (!removeResult.success) {
            addError(`Failed to remove worktree: ${removeResult.error}`)
          }
          const branchResult = await window.git.deleteBranch(mainDir, session.branch)
          if (!branchResult.success) {
            addError(`Failed to delete branch: ${branchResult.error}`)
          }
        }
      }
    }
    removeSession(id)
  }, [sessions, repos, removeSession, addError])

  const handleSelectSession = useCallback((id: string) => {
    setActiveSession(id)
    // After React re-renders with the new session, focus the agent terminal panel
    requestAnimationFrame(() => {
      const container = document.querySelector(`[data-panel-id="${PANEL_IDS.AGENT_TERMINAL}"]`)
      if (!container) return
      const xtermTextarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
      if (xtermTextarea) {
        xtermTextarea.focus()
      }
    })
  }, [setActiveSession])

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

  // Memoize terminal panels separately to ensure stability
  // Only depends on sessions and agents (for command), not on activeSessionId
  const agentTerminalPanel = useMemo(() => (
    <div className="h-full w-full relative">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`absolute inset-0 ${session.id === activeSessionId ? '' : 'hidden'}`}
        >
          <Terminal
            sessionId={session.id}
            cwd={session.directory}
            command={getAgentCommand(session)}
            env={getAgentEnv(session)}
            isAgentTerminal={!!getAgentCommand(session)}
            isActive={session.id === activeSessionId}
          />
        </div>
      ))}
      {sessions.length === 0 && (
        <div className="h-full w-full flex items-center justify-center text-text-secondary">
          <div className="text-center">
            <p>No sessions yet.</p>
            <p className="text-sm mt-2">Click "+ New Session" to add a git repository.</p>
          </div>
        </div>
      )}
    </div>
  ), [sessions, activeSessionId, getAgentCommand, getAgentEnv])

  const userTerminalPanel = useMemo(() => (
    <div className="h-full w-full relative">
      {sessions.map((session) => (
        <div
          key={`user-${session.id}`}
          className={`absolute inset-0 ${session.id === activeSessionId ? '' : 'hidden'}`}
        >
          <TabbedTerminal
            sessionId={session.id}
            cwd={session.directory}
            isActive={session.id === activeSessionId}
          />
        </div>
      ))}
    </div>
  ), [sessions, activeSessionId])

  // Memoize Explorer panel per-session to preserve tree/expanded state across session switches
  const explorerPanel = useMemo(() => (
    <div className="h-full w-full relative">
      {sessions.map((session) => (
        <div
          key={`explorer-${session.id}`}
          className={`absolute inset-0 ${session.id === activeSessionId ? '' : 'hidden'}`}
        >
          <Explorer
            directory={session.directory}
            onFileSelect={(filePath, openInDiffMode, scrollToLine, searchHighlight, diffBaseRef, diffCurrentRef, diffLabel) => {
              navigateToFile(filePath, openInDiffMode, scrollToLine, searchHighlight, diffBaseRef, diffCurrentRef, diffLabel)
            }}
            selectedFilePath={session.selectedFilePath}
            gitStatus={gitStatusBySession[session.id]?.files || []}
            syncStatus={gitStatusBySession[session.id] || null}
            filter={session.explorerFilter ?? 'files'}
            onFilterChange={(filter) => setExplorerFilter(session.id, filter)}
            onGitStatusRefresh={fetchGitStatus}
            recentFiles={session.recentFiles}
            sessionId={session.id}
            pushedToMainAt={session.pushedToMainAt}
            pushedToMainCommit={session.pushedToMainCommit}
            onRecordPushToMain={(commitHash) => recordPushToMain(session.id, commitHash)}
            onClearPushToMain={() => clearPushToMain(session.id)}
            planFilePath={session.planFilePath}
            branchStatus={session.branchStatus ?? 'in-progress'}
            onUpdatePrState={(prState, prNumber, prUrl) => updatePrState(session.id, prState, prNumber, prUrl)}
            repoId={session.repoId}
            agentPtyId={session.agentPtyId}
          />
        </div>
      ))}
    </div>
  ), [sessions, activeSessionId, gitStatusBySession, fetchGitStatus, navigateToFile, setExplorerFilter, recordPushToMain, clearPushToMain, updatePrState])

  // Memoize FileViewer panel per-session to preserve editor state across session switches
  const fileViewerPanel = useMemo(() => (
    <div className="h-full w-full relative">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId
        // Compute per-session file status from git data
        const sessionGitFiles = gitStatusBySession[session.id]?.files || []
        const relativePath = session.selectedFilePath && session.directory
          ? session.selectedFilePath.replace(session.directory + '/', '')
          : null
        const fileStatus = relativePath
          ? (sessionGitFiles.find(s => s.path === relativePath)?.status ?? null)
          : null
        return (
          <div
            key={`fv-${session.id}`}
            className={`absolute inset-0 ${isActive ? '' : 'hidden'}`}
          >
            {session.selectedFilePath ? (
              <FileViewer
                filePath={session.selectedFilePath}
                position={session.fileViewerPosition ?? 'top'}
                onPositionChange={isActive ? handleFileViewerPositionChange : undefined}
                onClose={isActive ? handleToggleFileViewer : undefined}
                fileStatus={fileStatus}
                directory={session.directory}
                onSaveComplete={isActive ? fetchGitStatus : undefined}
                initialViewMode={isActive ? (openFileInDiffMode ? 'diff' : 'latest') : undefined}
                scrollToLine={isActive ? scrollToLine : undefined}
                searchHighlight={isActive ? searchHighlight : undefined}
                onDirtyStateChange={isActive ? setIsFileViewerDirty : undefined}
                saveRef={isActive ? saveCurrentFileRef : undefined}
                diffBaseRef={isActive ? diffBaseRef : undefined}
                diffCurrentRef={isActive ? diffCurrentRef : undefined}
                diffLabel={isActive ? diffLabel : undefined}
                reviewContext={session.sessionType === 'review' ? {
                  sessionDirectory: session.directory,
                  commentsFilePath: `/tmp/broomy-review-${session.id}/comments.json`,
                } : undefined}
                onOpenFile={isActive ? (targetPath, line) => navigateToFile(targetPath, false, line) : undefined}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  ), [sessions, activeSessionId, gitStatusBySession, openFileInDiffMode, scrollToLine, searchHighlight, diffBaseRef, diffCurrentRef, diffLabel, fetchGitStatus, handleFileViewerPositionChange, handleToggleFileViewer, navigateToFile])

  // Memoize ReviewPanel per-session to preserve expanded sections across session switches
  const reviewPanel = useMemo(() => (
    <div className="h-full w-full relative">
      {sessions.map((session) => (
        <div
          key={`review-${session.id}`}
          className={`absolute inset-0 ${session.id === activeSessionId ? '' : 'hidden'}`}
        >
          <ReviewPanel
            session={session}
            repo={repos.find(r => r.id === session.repoId)}
            onSelectFile={(filePath, openInDiffMode, scrollToLine, diffBaseRef) => {
              navigateToFile(filePath, openInDiffMode, scrollToLine, undefined, diffBaseRef)
            }}
          />
        </div>
      ))}
    </div>
  ), [sessions, activeSessionId, repos, navigateToFile])

  // Build panels map - all per-session panels use stable memoized components
  const panelsMap = useMemo(() => ({
    [PANEL_IDS.SIDEBAR]: (
      <SessionList
        sessions={sessions}
        activeSessionId={activeSessionId}
        repos={repos}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRefreshPrStatus={refreshPrStatus}
        onArchiveSession={archiveSession}
        onUnarchiveSession={unarchiveSession}
      />
    ),
    [PANEL_IDS.AGENT_TERMINAL]: agentTerminalPanel,
    [PANEL_IDS.USER_TERMINAL]: userTerminalPanel,
    [PANEL_IDS.EXPLORER]: explorerPanel,
    [PANEL_IDS.FILE_VIEWER]: fileViewerPanel,
    [PANEL_IDS.REVIEW]: reviewPanel,
    [PANEL_IDS.SETTINGS]: globalPanelVisibility[PANEL_IDS.SETTINGS] ? (
      <AgentSettings onClose={() => toggleGlobalPanel(PANEL_IDS.SETTINGS)} />
    ) : null,
  }), [
    sessions,
    activeSessionId,
    globalPanelVisibility,
    agentTerminalPanel,
    userTerminalPanel,
    explorerPanel,
    fileViewerPanel,
    reviewPanel,
  ])

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-bg-primary flex items-center justify-center">
        <div className="text-text-secondary">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <Layout
        panels={panelsMap}
        panelVisibility={activeSession?.panelVisibility ?? {}}
        globalPanelVisibility={globalPanelVisibility}
        fileViewerPosition={activeSession?.fileViewerPosition ?? 'top'}
        sidebarWidth={sidebarWidth}
        layoutSizes={activeSession?.layoutSizes ?? DEFAULT_LAYOUT_SIZES}
        onSidebarWidthChange={setSidebarWidth}
        onLayoutSizeChange={handleLayoutSizeChange}
        errorMessage={activeSession && !activeDirectoryExists ? `Folder not found: ${activeSession.directory}` : null}
        title={activeSession ? activeSession.name : undefined}
        profileChip={<ProfileChip onSwitchProfile={handleSwitchProfile} />}
        onTogglePanel={handleTogglePanel}
        onToggleGlobalPanel={toggleGlobalPanel}
        onOpenPanelPicker={() => setShowPanelPicker(true)}
      />

      {/* New Session Dialog */}
      {showNewSessionDialog && (
        <NewSessionDialog
          onComplete={handleNewSessionComplete}
          onCancel={handleCancelNewSession}
        />
      )}

      {/* Panel Picker */}
      {showPanelPicker && (
        <PanelPicker
          toolbarPanels={toolbarPanels}
          onToolbarPanelsChange={setToolbarPanels}
          onClose={() => setShowPanelPicker(false)}
        />
      )}

      {/* Unsaved changes confirmation dialog */}
      {pendingNavigation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-bg-secondary border border-border rounded-lg shadow-xl p-4 max-w-sm mx-4">
            <h3 className="text-sm font-medium text-text-primary mb-2">Unsaved Changes</h3>
            <p className="text-xs text-text-secondary mb-4">
              You have unsaved changes. What would you like to do?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handlePendingCancel}
                className="px-3 py-1.5 text-xs rounded bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePendingDiscard}
                className="px-3 py-1.5 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handlePendingSave}
                className="px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function App() {
  const { toolbarPanels, setToolbarPanels } = useSessionStore()

  // Expose store for Playwright screenshot manipulation
  useEffect(() => {
    (window as Record<string, unknown>).__sessionStore = useSessionStore
  }, [])

  return (
    <PanelProvider
      toolbarPanels={toolbarPanels}
      onToolbarPanelsChange={setToolbarPanels}
    >
      <AppContent />
    </PanelProvider>
  )
}

export default App
