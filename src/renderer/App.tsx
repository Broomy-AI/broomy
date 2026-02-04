import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import type { GitFileStatus } from '../preload/index'
import Layout from './components/Layout'
import SessionList from './components/SessionList'
import Terminal from './components/Terminal'
import TabbedTerminal from './components/TabbedTerminal'
import Explorer from './components/Explorer'
import FileViewer from './components/FileViewer'
import AgentSettings from './components/AgentSettings'
import NewSessionDialog from './components/NewSessionDialog'
import PanelPicker from './components/PanelPicker'
import { useSessionStore, type Session, type SessionStatus, type LayoutSizes } from './store/sessions'
import { useAgentStore } from './store/agents'
import { useErrorStore } from './store/errors'
import { PanelProvider, PANEL_IDS } from './panels'
import { terminalBufferRegistry } from './utils/terminalBufferRegistry'

// Re-export types for backwards compatibility
export type { Session, SessionStatus }

// Default layout sizes for when there's no active session
const DEFAULT_LAYOUT_SIZES: LayoutSizes = {
  explorerWidth: 256,
  fileViewerSize: 300,
  userTerminalHeight: 192,
  diffPanelWidth: 320,
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
  } = useSessionStore()

  const { agents, loadAgents } = useAgentStore()
  const { addError } = useErrorStore()

  const [pendingFolderPath, setPendingFolderPath] = useState<string | null>(null)
  const [gitStatusBySession, setGitStatusBySession] = useState<Record<string, GitFileStatus[]>>({})
  const [directoryExists, setDirectoryExists] = useState<Record<string, boolean>>({})
  const [openFileInDiffMode, setOpenFileInDiffMode] = useState(false)
  const [showPanelPicker, setShowPanelPicker] = useState(false)

  // Hooks status tracking per configDir
  const [hooksStatusCache, setHooksStatusCache] = useState<Record<string, boolean>>({})
  const [dismissedConfigDirs, setDismissedConfigDirs] = useState<Set<string>>(() => {
    // Load dismissed dirs from localStorage
    try {
      const saved = localStorage.getItem('hooks-dismissed-config-dirs')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })
  const hooksCheckInProgress = useRef<Set<string>>(new Set())

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

  // Fetch git status for active session
  const fetchGitStatus = useCallback(async () => {
    if (!activeSession) return
    try {
      const status = await window.git.status(activeSession.directory)
      setGitStatusBySession(prev => ({
        ...prev,
        [activeSession.id]: status
      }))
    } catch {
      // Ignore errors
    }
  }, [activeSession?.id, activeSession?.directory])

  // Poll git status every 2 seconds
  useEffect(() => {
    if (activeSession) {
      fetchGitStatus()
      const interval = setInterval(fetchGitStatus, 2000)
      return () => clearInterval(interval)
    }
  }, [activeSession?.id, fetchGitStatus])

  // Get git status for the selected file
  const selectedFileStatus = React.useMemo(() => {
    if (!activeSession?.selectedFilePath || !activeSession?.directory) return null
    const status = gitStatusBySession[activeSession.id] || []
    const relativePath = activeSession.selectedFilePath.replace(activeSession.directory + '/', '')
    const fileStatus = status.find(s => s.path === relativePath)
    return fileStatus?.status ?? null
  }, [activeSession?.selectedFilePath, activeSession?.directory, activeSession?.id, gitStatusBySession])

  // Get current git status list for the active session
  const activeSessionGitStatus = activeSession ? (gitStatusBySession[activeSession.id] || []) : []

  // Load sessions and agents on mount
  useEffect(() => {
    loadSessions()
    loadAgents()
  }, [loadSessions, loadAgents])

  // Mark session as read when it becomes active
  useEffect(() => {
    if (activeSessionId) {
      markSessionRead(activeSessionId)
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
        content += `Waiting Type: ${activeSession.waitingType || '(none)'}\n`
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

  const handleNewSession = async () => {
    const folderPath = await window.dialog.openFolder()
    if (folderPath) {
      setPendingFolderPath(folderPath)
    }
  }

  const handleAgentSelect = async (agentId: string | null) => {
    if (pendingFolderPath) {
      try {
        await addSession(pendingFolderPath, agentId)
      } catch (error) {
        addError(`Failed to add session: ${error instanceof Error ? error.message : error}`)
      }
      setPendingFolderPath(null)
    }
  }

  const handleCancelNewSession = () => {
    setPendingFolderPath(null)
  }

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

  // Get CLAUDE_CONFIG_DIR for current session's agent
  // Note: ~/.claude is the default, so treat it as undefined
  const activeConfigDir = useMemo(() => {
    if (!activeSession?.agentId) return undefined
    const agent = agents.find((a) => a.id === activeSession.agentId)
    const configDir = agent?.env?.CLAUDE_CONFIG_DIR
    // ~/.claude is the default, treat it as not set
    if (configDir === '~/.claude') return undefined
    return configDir
  }, [activeSession?.agentId, agents])

  // Check hooks status when config dir changes (only if there's an active agent)
  useEffect(() => {
    // Only check if there's an active session with an agent
    if (!activeSession?.agentId) {
      return
    }

    const configDir = activeConfigDir || '~/.claude'

    // Skip if already checked or check in progress
    if (configDir in hooksStatusCache || hooksCheckInProgress.current.has(configDir)) {
      return
    }

    hooksCheckInProgress.current.add(configDir)

    window.hooks.checkSetup(configDir).then((status) => {
      setHooksStatusCache(prev => ({ ...prev, [configDir]: status.configured }))
      hooksCheckInProgress.current.delete(configDir)
    }).catch(() => {
      hooksCheckInProgress.current.delete(configDir)
    })
  }, [activeSession?.agentId, activeConfigDir, hooksStatusCache])

  // Compute current hooks status for display
  // Only show if there's an active session with an agent
  const currentHooksStatus = useMemo(() => {
    // Don't show banner if no active session or no agent
    if (!activeSession?.agentId) {
      return { needsSetup: false, configDir: undefined }
    }

    const configDir = activeConfigDir || '~/.claude'
    const isConfigured = hooksStatusCache[configDir]
    const isDismissed = dismissedConfigDirs.has(configDir)

    return {
      needsSetup: isConfigured === false && !isDismissed,
      configDir,
    }
  }, [activeSession?.agentId, activeConfigDir, hooksStatusCache, dismissedConfigDirs])

  // Handle configure hooks
  const handleConfigureHooks = useCallback(async (configDir?: string) => {
    const dir = configDir || '~/.claude'
    const result = await window.hooks.configure(dir)
    if (result.success) {
      setHooksStatusCache(prev => ({ ...prev, [dir]: true }))
    } else {
      throw new Error(result.error || 'Failed to configure hooks')
    }
  }, [])

  // Handle dismiss hooks banner
  const handleDismissHooks = useCallback(() => {
    const configDir = activeConfigDir || '~/.claude'
    setDismissedConfigDirs(prev => {
      const next = new Set(prev)
      next.add(configDir)
      // Save to localStorage
      localStorage.setItem('hooks-dismissed-config-dirs', JSON.stringify([...next]))
      return next
    })
  }, [activeConfigDir])

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
        hooksStatus={currentHooksStatus}
        onConfigureHooks={handleConfigureHooks}
        onDismissHooks={handleDismissHooks}
      />
    ),
    [PANEL_IDS.AGENT_TERMINAL]: agentTerminalPanel,
    [PANEL_IDS.USER_TERMINAL]: userTerminalPanel,
    [PANEL_IDS.EXPLORER]: activeSession?.showExplorer ? (
      <Explorer
        directory={activeSession?.directory}
        onFileSelect={(filePath, openInDiffMode) => {
          if (activeSessionId) {
            setOpenFileInDiffMode(openInDiffMode)
            selectFile(activeSessionId, filePath)
          }
        }}
        selectedFilePath={activeSession?.selectedFilePath}
        gitStatus={activeSessionGitStatus}
        filter={activeSession?.explorerFilter ?? 'all'}
        onFilterChange={(filter) => activeSessionId && setExplorerFilter(activeSessionId, filter)}
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
    selectedFileStatus,
    openFileInDiffMode,
    globalPanelVisibility,
    fetchGitStatus,
    agentTerminalPanel,
    userTerminalPanel,
    handleToggleFileViewer,
    currentHooksStatus,
    handleConfigureHooks,
    handleDismissHooks,
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
        onTogglePanel={handleTogglePanel}
        onToggleGlobalPanel={toggleGlobalPanel}
        onOpenPanelPicker={() => setShowPanelPicker(true)}
      />

      {/* New Session Dialog */}
      {pendingFolderPath && (
        <NewSessionDialog
          folderPath={pendingFolderPath}
          onSelect={handleAgentSelect}
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
