/**
 * Root application component that orchestrates all stores, effects, and panel wiring.
 *
 * AppContent initializes the four Zustand stores (sessions, agents, repos, profiles) on mount,
 * polls git status every 2 seconds for the active session, computes derived branch status,
 * and builds a memoized panel map that Layout renders into the drag-to-resize shell. It also
 * manages file navigation with unsaved-changes guards and global keyboard shortcuts.
 * The outer App component wraps AppContent in the PanelProvider context.
 */
import { useEffect, useState, useCallback } from 'react'
import Layout from './components/Layout'
import NewSessionDialog from './components/NewSessionDialog'
import PanelPicker from './components/PanelPicker'
import ProfileChip from './components/ProfileChip'
import HelpModal from './components/HelpModal'
import ShortcutsModal from './components/ShortcutsModal'
import { useSessionStore, type Session, type SessionStatus, type LayoutSizes } from './store/sessions'
import { useAgentStore } from './store/agents'
import { useRepoStore } from './store/repos'
import { useProfileStore } from './store/profiles'
import { PanelProvider, PANEL_IDS } from './panels'
import ErrorBoundary from './components/ErrorBoundary'
import ErrorDetailModal from './components/ErrorDetailModal'
import { useGitPolling } from './hooks/useGitPolling'
import { useFileNavigation } from './hooks/useFileNavigation'
import { useSessionLifecycle } from './hooks/useSessionLifecycle'
import { useAppCallbacks } from './hooks/useAppCallbacks'
import { usePanelsMap } from './hooks/usePanelsMap'
import { useHelpMenu } from './hooks/useHelpMenu'

// Re-export types for backwards compatibility
export type { Session, SessionStatus }

const DEFAULT_LAYOUT_SIZES: LayoutSizes = {
  explorerWidth: 256,
  fileViewerSize: 300,
  userTerminalHeight: 192,
  diffPanelWidth: 320,
  reviewPanelWidth: 320,
  tutorialPanelWidth: 320,
}

function UnsavedChangesDialog({ onCancel, onDiscard, onSave }: {
  onCancel: () => void; onDiscard: () => void; onSave: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-secondary border border-border rounded-lg shadow-xl p-4 max-w-sm mx-4">
        <h3 className="text-sm font-medium text-text-primary mb-2">Unsaved Changes</h3>
        <p className="text-xs text-text-secondary mb-4">
          You have unsaved changes. What would you like to do?
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
          <button onClick={onDiscard} className="px-3 py-1.5 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors">Discard</button>
          <button onClick={onSave} className="px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors">Save</button>
        </div>
      </div>
    </div>
  )
}

function GitMissingBanner() {
  const { gitAvailable } = useRepoStore()
  if (gitAvailable !== false) return null
  return (
    <div className="bg-red-900/30 border-b border-red-500/30 px-4 py-2 text-xs text-red-300 flex items-center gap-2">
      <span className="font-medium">git is not installed.</span>
      <span className="text-red-400">Broomy requires git to manage repositories.</span>
      <button onClick={() => window.shell.openExternal('https://git-scm.com/downloads')} className="text-accent hover:underline ml-1">Download git</button>
    </div>
  )
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
    setPanelVisibility,
  } = useSessionStore()

  const { agents, loadAgents } = useAgentStore()
  const { repos, loadRepos, checkGhAvailability, checkGitAvailability } = useRepoStore()
  const { currentProfileId, profiles, loadProfiles, switchProfile } = useProfileStore()
  const { showHelpModal, setShowHelpModal, showShortcutsModal, setShowShortcutsModal } = useHelpMenu(currentProfileId)
  const currentProfile = profiles.find((p) => p.id === currentProfileId)

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false)
  const [showPanelPicker, setShowPanelPicker] = useState(false)

  // Git polling hook
  const {
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
    checkGhAvailability, checkGitAvailability,
    switchProfile,
    markSessionRead,
    refreshAllBranches,
  })

  // App callbacks hook
  const {
    handleNewSession,
    handleNewSessionComplete,
    handleCancelNewSession,
    handleDeleteSession,
    refreshPrStatus,
    getAgentCommand,
    getAgentEnv,
    handleLayoutSizeChange,
    handleFileViewerPositionChange,
    handleSelectSession,
    handleTogglePanel,
    handleToggleFileViewer,
  } = useAppCallbacks({
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
  })

  const handleSearchFiles = useCallback(() => {
    if (!activeSessionId) return
    if (!activeSession?.panelVisibility[PANEL_IDS.EXPLORER]) togglePanel(activeSessionId, PANEL_IDS.EXPLORER)
    setExplorerFilter(activeSessionId, 'search')
  }, [activeSessionId, activeSession, togglePanel, setExplorerFilter])

  const handleToggleGlobalPanel = useCallback((panelId: string) => {
    toggleGlobalPanel(panelId)
  }, [toggleGlobalPanel])

  // Panels map hook
  const panelsMap = usePanelsMap({
    sessions, activeSessionId, activeSession,
    activeSessionGitStatus, activeSessionGitStatusResult, selectedFileStatus,
    navigateToFile, openFileInDiffMode, scrollToLine, searchHighlight,
    diffBaseRef, diffCurrentRef, diffLabel, setIsFileViewerDirty, saveCurrentFileRef,
    handleSelectSession, handleNewSession,
    removeSession: (id, deleteWorktree) => { handleDeleteSession(id, deleteWorktree) },
    refreshPrStatus, archiveSession, unarchiveSession,
    handleToggleFileViewer, handleFileViewerPositionChange,
    fetchGitStatus, getAgentCommand, getAgentEnv,
    globalPanelVisibility, toggleGlobalPanel, selectFile, setExplorerFilter,
    recordPushToMain, clearPushToMain, updatePrState,
    setPanelVisibility, setToolbarPanels, repos,
  })

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-bg-primary flex items-center justify-center">
        <div className="text-text-secondary">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <GitMissingBanner />
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
        onToggleGlobalPanel={handleToggleGlobalPanel}
        onOpenPanelPicker={() => setShowPanelPicker(true)}
        onSearchFiles={handleSearchFiles}
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

      {pendingNavigation && (
        <UnsavedChangesDialog onCancel={handlePendingCancel} onDiscard={handlePendingDiscard} onSave={handlePendingSave} />
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <HelpModal onClose={() => setShowHelpModal(false)} />
      )}

      {/* Shortcuts Modal */}
      {showShortcutsModal && (
        <ShortcutsModal onClose={() => setShowShortcutsModal(false)} />
      )}
    </>
  )
}

function App() {
  const { toolbarPanels, setToolbarPanels } = useSessionStore()

  // Expose store for Playwright screenshot manipulation
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__sessionStore = useSessionStore
  }, [])

  return (
    <ErrorBoundary>
      <PanelProvider
        toolbarPanels={toolbarPanels}
        onToolbarPanelsChange={setToolbarPanels}
      >
        <AppContent />
        <ErrorDetailModal />
      </PanelProvider>
    </ErrorBoundary>
  )
}

export default App
