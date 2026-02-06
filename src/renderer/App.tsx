import React, { useEffect, useState, useCallback, useMemo } from 'react'
import type { GitFileStatus, GitStatusResult } from '../preload/index'
import Layout from './components/Layout'
import SessionList from './components/SessionList'
import Terminal from './components/Terminal'
import TabbedTerminal from './components/TabbedTerminal'
import Explorer from './components/Explorer'
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
import { terminalBufferRegistry } from './utils/terminalBufferRegistry'
import { computeBranchStatus } from './utils/branchStatus'

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
    updateBranchStatus,
    updatePrState,
  } = useSessionStore()

  const { agents, loadAgents } = useAgentStore()
  const { repos, loadRepos, checkGhAvailability } = useRepoStore()
  const { currentProfileId, profiles, loadProfiles, switchProfile } = useProfileStore()
  const { addError } = useErrorStore()
  const currentProfile = profiles.find((p) => p.id === currentProfileId)

  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false)
  const [gitStatusBySession, setGitStatusBySession] = useState<Record<string, GitStatusResult>>({})
  const [directoryExists, setDirectoryExists] = useState<Record<string, boolean>>({})
  const [openFileInDiffMode, setOpenFileInDiffMode] = useState(false)
  const [scrollToLine, setScrollToLine] = useState<number | undefined>(undefined)
  const [searchHighlight, setSearchHighlight] = useState<string | undefined>(undefined)
  const [diffBaseRef, setDiffBaseRef] = useState<string | undefined>(undefined)
  const [showPanelPicker, setShowPanelPicker] = useState(false)
  const [isFileViewerDirty, setIsFileViewerDirty] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<{
    filePath: string
    openInDiffMode: boolean
    scrollToLine?: number
    searchHighlight?: string
    diffBaseRef?: string
  } | null>(null)
  const saveCurrentFileRef = React.useRef<(() => Promise<void>) | null>(null)

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const activeDirectoryExists = activeSession ? (directoryExists[activeSession.id] ?? true) : true

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
      checkDirectories()
    }
  }, [sessions])

  // Normalize git status response - handles both old array format and new object format
  const normalizeGitStatus = useCallback((status: unknown): GitStatusResult => {
    // New format: object with files array
    if (status && typeof status === 'object' && !Array.isArray(status) && 'files' in status) {
      const s = status as GitStatusResult
      return {
        files: (s.files || []).map(f => ({
          ...f,
          staged: f.staged ?? false,
          indexStatus: f.indexStatus ?? ' ',
          workingDirStatus: f.workingDirStatus ?? ' ',
        })),
        ahead: s.ahead ?? 0,
        behind: s.behind ?? 0,
        tracking: s.tracking ?? null,
        current: s.current ?? null,
      }
    }
    // Old format: flat array of {path, status}
    if (Array.isArray(status)) {
      return {
        files: status.map((f: GitFileStatus) => ({
          path: f.path,
          status: f.status,
          staged: f.staged ?? false,
          indexStatus: f.indexStatus ?? ' ',
          workingDirStatus: f.workingDirStatus ?? ' ',
        })),
        ahead: 0,
        behind: 0,
        tracking: null,
        current: null,
      }
    }
    return { files: [], ahead: 0, behind: 0, tracking: null, current: null }
  }, [])

  // Fetch git status for active session
  const fetchGitStatus = useCallback(async () => {
    if (!activeSession) return
    try {
      const status = await window.git.status(activeSession.directory)
      const normalized = normalizeGitStatus(status)
      setGitStatusBySession(prev => ({
        ...prev,
        [activeSession.id]: normalized
      }))
    } catch {
      // Ignore errors
    }
  }, [activeSession?.id, activeSession?.directory, normalizeGitStatus])

  // Poll git status every 2 seconds
  useEffect(() => {
    if (activeSession) {
      fetchGitStatus()
      const interval = setInterval(fetchGitStatus, 2000)
      return () => clearInterval(interval)
    }
  }, [activeSession?.id, fetchGitStatus])

  // Compute branch status whenever git status changes
  useEffect(() => {
    for (const session of sessions) {
      const gitStatus = gitStatusBySession[session.id]
      if (!gitStatus) continue

      const status = computeBranchStatus({
        uncommittedFiles: gitStatus.files.length,
        ahead: gitStatus.ahead,
        hasTrackingBranch: !!gitStatus.tracking,
        isOnMainBranch: gitStatus.current === 'main' || gitStatus.current === 'master',
        currentHeadCommit: null, // Not available from gitStatus, but not needed for most cases
        lastKnownPrState: session.lastKnownPrState,
        pushedToMainCommit: session.pushedToMainCommit,
      })

      if (status !== session.branchStatus) {
        updateBranchStatus(session.id, status)
      }
    }
  }, [gitStatusBySession, sessions, updateBranchStatus])

  // Get git status for the selected file
  const selectedFileStatus = React.useMemo(() => {
    if (!activeSession?.selectedFilePath || !activeSession?.directory) return null
    const statusResult = gitStatusBySession[activeSession.id]
    const files = statusResult?.files || []
    const relativePath = activeSession.selectedFilePath.replace(activeSession.directory + '/', '')
    const fileStatus = files.find(s => s.path === relativePath)
    return fileStatus?.status ?? null
  }, [activeSession?.selectedFilePath, activeSession?.directory, activeSession?.id, gitStatusBySession])

  // Get current git status for the active session
  const activeSessionGitStatusResult = activeSession ? (gitStatusBySession[activeSession.id] || null) : null
  const activeSessionGitStatus = activeSessionGitStatusResult?.files || []

  // Load profiles, then sessions/agents/repos for the current profile
  useEffect(() => {
    loadProfiles().then(() => {
      loadSessions(currentProfileId)
      loadAgents(currentProfileId)
      loadRepos(currentProfileId)
      checkGhAvailability()
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle profile switching: open the profile in a new window
  const handleSwitchProfile = useCallback(async (profileId: string) => {
    await switchProfile(profileId)
  }, [switchProfile])

  // Update window title to show active session name and profile
  useEffect(() => {
    const profileLabel = currentProfile && profiles.length > 1 ? ` [${currentProfile.name}]` : ''
    document.title = activeSession ? `${activeSession.name}${profileLabel} — Broomer` : `Broomer${profileLabel}`
  }, [activeSession?.name, activeSession?.id, currentProfile?.name, profiles.length])

  // Mark session as read when it becomes active, and focus agent terminal
  useEffect(() => {
    if (activeSessionId) {
      markSessionRead(activeSessionId)
      // Focus the agent terminal after a short delay to let it render
      const timeout = setTimeout(() => {
        const container = document.querySelector(`[data-panel-id="${PANEL_IDS.AGENT_TERMINAL}"]`)
        if (!container) return
        const xtermTextarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
        if (xtermTextarea) xtermTextarea.focus()
      }, 100)
      return () => clearTimeout(timeout)
    }
  }, [activeSessionId, markSessionRead])

  // Poll for branch changes every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (sessions.length > 0) {
        refreshAllBranches()
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [sessions.length, refreshAllBranches])

  // Keyboard shortcut to copy terminal content + summary (Cmd+Shift+C)
  useEffect(() => {
    const handleCopyTerminal = async (e: KeyboardEvent) => {
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

        try {
          await navigator.clipboard.writeText(content)
          // Could show a toast here, but keeping it simple
        } catch (err) {
          console.error('Failed to copy to clipboard:', err)
        }
      }
    }

    window.addEventListener('keydown', handleCopyTerminal)
    return () => window.removeEventListener('keydown', handleCopyTerminal)
  }, [activeSession])

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

  // Navigate to a file, checking for unsaved changes first
  const navigateToFile = useCallback((filePath: string, openInDiffMode: boolean, scrollToLine?: number, searchHighlight?: string, diffBaseRef?: string) => {
    if (!activeSessionId) return
    // If same file, just update scroll/highlight
    if (filePath === activeSession?.selectedFilePath) {
      setOpenFileInDiffMode(openInDiffMode)
      setScrollToLine(scrollToLine)
      setSearchHighlight(searchHighlight)
      setDiffBaseRef(diffBaseRef)
      return
    }
    if (isFileViewerDirty) {
      setPendingNavigation({ filePath, openInDiffMode, scrollToLine, searchHighlight, diffBaseRef })
      return
    }
    setOpenFileInDiffMode(openInDiffMode)
    setScrollToLine(scrollToLine)
    setSearchHighlight(searchHighlight)
    setDiffBaseRef(diffBaseRef)
    selectFile(activeSessionId, filePath)
  }, [activeSessionId, activeSession?.selectedFilePath, isFileViewerDirty, selectFile])

  const handlePendingSave = useCallback(async () => {
    if (saveCurrentFileRef.current) {
      await saveCurrentFileRef.current()
    }
    if (pendingNavigation && activeSessionId) {
      setOpenFileInDiffMode(pendingNavigation.openInDiffMode)
      setScrollToLine(pendingNavigation.scrollToLine)
      setSearchHighlight(pendingNavigation.searchHighlight)
      setDiffBaseRef(pendingNavigation.diffBaseRef)
      selectFile(activeSessionId, pendingNavigation.filePath)
    }
    setPendingNavigation(null)
    setIsFileViewerDirty(false)
  }, [pendingNavigation, activeSessionId, selectFile])

  const handlePendingDiscard = useCallback(() => {
    if (pendingNavigation && activeSessionId) {
      setOpenFileInDiffMode(pendingNavigation.openInDiffMode)
      setScrollToLine(pendingNavigation.scrollToLine)
      setSearchHighlight(pendingNavigation.searchHighlight)
      setDiffBaseRef(pendingNavigation.diffBaseRef)
      setIsFileViewerDirty(false)
      selectFile(activeSessionId, pendingNavigation.filePath)
    }
    setPendingNavigation(null)
  }, [pendingNavigation, activeSessionId, selectFile])

  const handlePendingCancel = useCallback(() => {
    setPendingNavigation(null)
  }, [])

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

  // Build panels map - terminals use stable memoized components
  const panelsMap = useMemo(() => ({
    [PANEL_IDS.SIDEBAR]: (
      <SessionList
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSession}
        onNewSession={handleNewSession}
        onDeleteSession={removeSession}
        onRefreshPrStatus={refreshPrStatus}
      />
    ),
    [PANEL_IDS.AGENT_TERMINAL]: agentTerminalPanel,
    [PANEL_IDS.USER_TERMINAL]: userTerminalPanel,
    [PANEL_IDS.EXPLORER]: activeSession?.showExplorer ? (
      <Explorer
        directory={activeSession?.directory}
        onFileSelect={(filePath, openInDiffMode, scrollToLine, searchHighlight, diffBaseRef) => {
          navigateToFile(filePath, openInDiffMode, scrollToLine, searchHighlight, diffBaseRef)
        }}
        selectedFilePath={activeSession?.selectedFilePath}
        gitStatus={activeSessionGitStatus}
        syncStatus={activeSessionGitStatusResult}
        filter={activeSession?.explorerFilter ?? 'files'}
        onFilterChange={(filter) => activeSessionId && setExplorerFilter(activeSessionId, filter)}
        onGitStatusRefresh={fetchGitStatus}
        recentFiles={activeSession?.recentFiles}
        sessionId={activeSessionId ?? undefined}
        pushedToMainAt={activeSession?.pushedToMainAt}
        pushedToMainCommit={activeSession?.pushedToMainCommit}
        onRecordPushToMain={(commitHash) => activeSessionId && recordPushToMain(activeSessionId, commitHash)}
        onClearPushToMain={() => activeSessionId && clearPushToMain(activeSessionId)}
        branchStatus={activeSession?.branchStatus ?? 'in-progress'}
        onUpdatePrState={(prState, prNumber, prUrl) => activeSessionId && updatePrState(activeSessionId, prState, prNumber, prUrl)}
        repoId={activeSession?.repoId}
      />
    ) : null,
    [PANEL_IDS.FILE_VIEWER]: activeSession?.showFileViewer ? (
      <FileViewer
        filePath={activeSession?.selectedFilePath ?? null}
        position={activeSession?.fileViewerPosition ?? 'top'}
        onPositionChange={handleFileViewerPositionChange}
        onClose={handleToggleFileViewer}
        fileStatus={selectedFileStatus}
        directory={activeSession?.directory}
        onSaveComplete={fetchGitStatus}
        initialViewMode={openFileInDiffMode ? 'diff' : 'latest'}
        scrollToLine={scrollToLine}
        searchHighlight={searchHighlight}
        onDirtyStateChange={setIsFileViewerDirty}
        saveRef={saveCurrentFileRef}
        diffBaseRef={diffBaseRef}
        reviewContext={activeSession?.sessionType === 'review' ? {
          sessionDirectory: activeSession.directory,
          commentsFilePath: `${activeSession.directory}/.broomer-review/comments.json`,
        } : undefined}
      />
    ) : null,
    [PANEL_IDS.REVIEW]: activeSession?.sessionType === 'review' && activeSession?.panelVisibility?.[PANEL_IDS.REVIEW] ? (
      <ReviewPanel
        session={activeSession}
        repo={repos.find(r => r.id === activeSession.repoId)}
        onSelectFile={(filePath) => {
          if (activeSessionId) {
            selectFile(activeSessionId, filePath)
          }
        }}
      />
    ) : null,
    [PANEL_IDS.SETTINGS]: globalPanelVisibility[PANEL_IDS.SETTINGS] ? (
      <AgentSettings onClose={() => toggleGlobalPanel(PANEL_IDS.SETTINGS)} />
    ) : null,
  }), [
    sessions,
    activeSessionId,
    activeSession,
    activeSessionGitStatus,
    activeSessionGitStatusResult,
    selectedFileStatus,
    openFileInDiffMode,
    scrollToLine,
    searchHighlight,
    diffBaseRef,
    globalPanelVisibility,
    fetchGitStatus,
    agentTerminalPanel,
    userTerminalPanel,
    handleToggleFileViewer,
    repos,
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
