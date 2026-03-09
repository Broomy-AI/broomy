/**
 * Builds the map of panel ID to rendered React element for the layout system, wiring up each panel to active session state.
 */
import { useMemo, useState, useEffect, useCallback, memo } from 'react'
import TabbedTerminal from '../components/TabbedTerminal'
import PanelErrorBoundary from '../components/PanelErrorBoundary'
import Explorer from '../components/explorer'
import FileViewer from '../components/FileViewer'
import { CommandsEditor } from '../components/CommandsEditor'
import AgentSettings from '../components/AgentSettings'
import SessionList from '../components/sessionList'
import WelcomeScreen from '../components/WelcomeScreen'
import TutorialPanel from '../components/TutorialPanel'
import { useSessionStore, type Session } from '../store/sessions'
import { PANEL_IDS } from '../panels'
import { useIssuePlanDetection } from './useIssuePlanDetection'
import type { FileStatus, ViewMode } from '../components/FileViewer'
import type { GitFileStatus, GitStatusResult, ManagedRepo } from '../../preload/index'
import type { ExplorerFilter, PrState } from '../store/sessions'
import type { NavigationTarget } from '../utils/fileNavigation'

/** Wrapper that subscribes each session terminal to its own visibility from the store. */
const SessionTerminal = memo(function SessionTerminal({
  sessionId, cwd, branch, agentCommand, agentEnv, isRestored, isolated, repoRootDir,
}: {
  sessionId: string; cwd: string; branch: string
  agentCommand?: string; agentEnv?: Record<string, string>
  isRestored?: boolean
  isolated: boolean; repoRootDir?: string
}) {
  const isVisible = useSessionStore((s) => s.activeSessionId === sessionId)
  return (
    <div className={`absolute inset-0 ${isVisible ? '' : 'invisible pointer-events-none'}`}>
      <PanelErrorBoundary name={`Session ${branch || sessionId}`}>
        <TabbedTerminal
          sessionId={sessionId}
          cwd={cwd}
          agentCommand={agentCommand}
          agentEnv={agentEnv}
          isRestored={isRestored}
          isolated={isolated}
          repoRootDir={repoRootDir}
        />
      </PanelErrorBoundary>
    </div>
  )
})

export interface PanelsMapConfig {
  sessions: Session[]
  activeSessionId: string | null
  activeSession: Session | undefined
  activeSessionGitStatus: GitFileStatus[]
  activeSessionGitStatusResult: GitStatusResult | null
  selectedFileStatus: FileStatus | undefined
  navigateToFile: (target: NavigationTarget) => void
  openFileInDiffMode: boolean
  scrollToLine: number | undefined
  searchHighlight: string | undefined
  diffBaseRef: string | undefined
  diffCurrentRef: string | undefined
  diffLabel: string | undefined
  setIsFileViewerDirty: (sessionId: string, dirty: boolean) => void
  registerSaveFunction: (sessionId: string, fn: (() => Promise<void>) | null) => void
  unregisterSaveFunction: (sessionId: string) => void
  handleSelectSession: (id: string) => void
  handleNewSession: () => void
  removeSession: (id: string, deleteWorktree: boolean) => void
  refreshPrStatus: () => Promise<void>
  archiveSession: (id: string) => void
  unarchiveSession: (id: string) => void
  handleToggleFileViewer: () => void
  handleFileViewerPositionChange: (position: 'top' | 'left') => void
  fetchGitStatus: () => void | Promise<void>
  getAgentCommand: (session: Session) => string | undefined
  getAgentEnv: (session: Session) => Record<string, string> | undefined
  getRepoIsolation: (session: Session) => { isolated: boolean; repoRootDir?: string } | undefined
  globalPanelVisibility: Record<string, boolean>
  toggleGlobalPanel: (panelId: string) => void
  selectFile: (sessionId: string, filePath: string) => void
  setExplorerFilter: (sessionId: string, filter: ExplorerFilter) => void
  updatePrState: (sessionId: string, prState: PrState, prNumber?: number, prUrl?: string) => void
  setPanelVisibility: (sessionId: string, panelId: string, visible: boolean) => void
  setToolbarPanels: (panels: string[]) => void
  closeCommandsEditor: (sessionId: string) => void
  repos: ManagedRepo[]
}

function useExplorerPanel(config: PanelsMapConfig) {
  const {
    activeSessionId, activeSession, activeSessionGitStatus, activeSessionGitStatusResult,
    navigateToFile, fetchGitStatus, setExplorerFilter,
    updatePrState, repos,
  } = config

  const issuePlanExists = useIssuePlanDetection(activeSessionId, activeSession?.directory)

  const activeRepo = useMemo(() =>
    repos.find(r => r.id === activeSession?.repoId),
    [repos, activeSession?.repoId]
  )

  const handleFilterChange = useCallback((filter: ExplorerFilter) => {
    if (activeSessionId) setExplorerFilter(activeSessionId, filter)
  }, [activeSessionId, setExplorerFilter])

  const handleUpdatePrState = useCallback((prState: PrState, prNumber?: number, prUrl?: string) => {
    if (activeSessionId) updatePrState(activeSessionId, prState, prNumber, prUrl)
  }, [activeSessionId, updatePrState])

  return useMemo(() => {
    if (!activeSession?.showExplorer) return null
    return (
      <Explorer
        directory={activeSession.directory}
        onFileSelect={navigateToFile}
        selectedFilePath={activeSession.selectedFilePath}
        gitStatus={activeSessionGitStatus}
        syncStatus={activeSessionGitStatusResult}
        filter={activeSession.explorerFilter}
        onFilterChange={handleFilterChange}
        onGitStatusRefresh={fetchGitStatus}
        recentFiles={activeSession.recentFiles}
        sessionId={activeSessionId ?? undefined}
        planFilePath={activeSession.planFilePath}
        branchStatus={activeSession.branchStatus}
        onUpdatePrState={handleUpdatePrState}
        repoId={activeSession.repoId}
        agentPtyId={activeSession.agentPtyId}
        session={activeSession}
        repo={activeRepo}
        issueNumber={activeSession.issueNumber}
        issueTitle={activeSession.issueTitle}
        issueUrl={activeSession.issueUrl}
        issuePlanExists={issuePlanExists}
      />
    )
  }, [activeSessionId, activeSession, activeSessionGitStatus, activeSessionGitStatusResult, navigateToFile, fetchGitStatus, activeRepo, issuePlanExists, handleFilterChange, handleUpdatePrState])
}

function useFileViewerPanel(config: PanelsMapConfig) {
  const {
    sessions, activeSessionId, navigateToFile, openFileInDiffMode, scrollToLine, searchHighlight,
    diffBaseRef, diffCurrentRef, diffLabel, setIsFileViewerDirty,
    registerSaveFunction,
    handleToggleFileViewer, handleFileViewerPositionChange, selectedFileStatus, fetchGitStatus,
    closeCommandsEditor,
  } = config

  const [tmpdir, setTmpdir] = useState('/tmp')
  useEffect(() => { void window.app.tmpdir().then(setTmpdir) }, [])

  // Track initial view mode per-session so it doesn't change when sessions become inactive
  const [sessionViewModes, setSessionViewModes] = useState<Record<string, ViewMode>>({})
  useEffect(() => {
    if (activeSessionId) {
      const mode: ViewMode = openFileInDiffMode ? 'diff' : 'latest'
      setSessionViewModes(prev => {
        if (prev[activeSessionId] === mode) return prev
        return { ...prev, [activeSessionId]: mode }
      })
    }
  }, [activeSessionId, openFileInDiffMode])

  // Create stable per-session callbacks for save function registration
  const makeSaveFunctionCallback = useCallback((sessionId: string) => {
    return (fn: (() => Promise<void>) | null) => {
      registerSaveFunction(sessionId, fn)
    }
  }, [registerSaveFunction])

  return useMemo(() => {
    if (sessions.length === 0) return null
    return (
      <div className="h-full w-full relative">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId

          // Show commands editor when commandsEditorDirectory is set
          if (session.commandsEditorDirectory) {
            return (
              <div
                key={session.id}
                className={`absolute inset-0 ${isActive ? '' : 'hidden'}`}
              >
                <CommandsEditor
                  directory={session.commandsEditorDirectory}
                  onClose={() => closeCommandsEditor(session.id)}
                />
              </div>
            )
          }

          return (
            <div
              key={session.id}
              className={`absolute inset-0 ${isActive ? '' : 'hidden'}`}
            >
              <FileViewer
                filePath={session.selectedFilePath}
                position={session.fileViewerPosition}
                onPositionChange={handleFileViewerPositionChange}
                onClose={handleToggleFileViewer}
                fileStatus={isActive ? selectedFileStatus : undefined}
                directory={session.directory}
                onSaveComplete={isActive ? fetchGitStatus : undefined}
                initialViewMode={sessionViewModes[session.id] ?? 'latest'}
                scrollToLine={isActive ? scrollToLine : undefined}
                searchHighlight={isActive ? searchHighlight : undefined}
                onDirtyStateChange={(dirty) => setIsFileViewerDirty(session.id, dirty)}
                onSaveFunctionChange={makeSaveFunctionCallback(session.id)}
                diffBaseRef={isActive ? diffBaseRef : undefined}
                diffCurrentRef={isActive ? diffCurrentRef : undefined}
                diffLabel={isActive ? diffLabel : undefined}
                isActive={isActive}
                reviewContext={session.sessionType === 'review' ? {
                  sessionDirectory: session.directory,
                  commentsFilePath: `${session.directory}/.broomy/comments.json`,
                } : undefined}
                prFilesUrl={session.sessionType === 'review' && session.prUrl ? session.prUrl : undefined}
                onOpenFile={isActive ? (targetPath, line) => navigateToFile({ filePath: targetPath, openInDiffMode: false, scrollToLine: line }) : undefined}
              />
            </div>
          )
        })}
      </div>
    )
  }, [sessions, activeSessionId, selectedFileStatus, sessionViewModes, scrollToLine, searchHighlight, diffBaseRef, diffCurrentRef, diffLabel, fetchGitStatus, handleToggleFileViewer, handleFileViewerPositionChange, navigateToFile, tmpdir, setIsFileViewerDirty, makeSaveFunctionCallback, closeCommandsEditor])
}

export function usePanelsMap(config: PanelsMapConfig) {
  const {
    sessions,
    handleSelectSession, handleNewSession, removeSession, refreshPrStatus,
    archiveSession, unarchiveSession,
    getAgentCommand, getAgentEnv,
    globalPanelVisibility, toggleGlobalPanel,
    repos,
  } = config

  // Derive a stable key from only the session fields the terminal cares about.
  // Status, lastMessage, isUnread etc. are excluded — they don't affect terminal rendering.
  const terminalSessionKey = useMemo(() =>
    sessions.filter(s => !s.isArchived)
      .map(s => `${s.id}|${s.directory}|${s.isRestored}|${s.agentId}|${s.repoId}`)
      .join(','),
    [sessions]
  )

  const terminalPanel = useMemo(() => (
    <div className="h-full w-full relative">
      {sessions.filter(s => !s.isArchived).map((session) => {
        const repo = session.repoId ? repos.find(r => r.id === session.repoId) : undefined
        return (
          <SessionTerminal
            key={session.id}
            sessionId={session.id}
            cwd={session.directory}
            branch={session.branch}
            agentCommand={getAgentCommand(session)}
            agentEnv={getAgentEnv(session)}
            isRestored={session.isRestored}
            isolated={repo?.isolated ?? false}
            repoRootDir={repo?.rootDir}
          />
        )
      })}
      {sessions.length === 0 && (
        <WelcomeScreen onNewSession={handleNewSession} />
      )}
    </div>
  ), [terminalSessionKey, getAgentCommand, getAgentEnv, handleNewSession, repos])

  const explorerPanel = useExplorerPanel(config)
  const fileViewerPanel = useFileViewerPanel(config)

  const sidebarPanel = useMemo(() => (
    <SessionList
      sessions={sessions}
      repos={repos}
      onSelectSession={handleSelectSession}
      onNewSession={handleNewSession}
      onDeleteSession={removeSession}
      onRefreshPrStatus={refreshPrStatus}
      onArchiveSession={archiveSession}
      onUnarchiveSession={unarchiveSession}
    />
  ), [sessions, repos, handleSelectSession, handleNewSession, removeSession, refreshPrStatus, archiveSession, unarchiveSession])

  const panelsMap = useMemo(() => ({
    [PANEL_IDS.SIDEBAR]: sidebarPanel,
    terminal: terminalPanel,
    [PANEL_IDS.EXPLORER]: explorerPanel,
    [PANEL_IDS.FILE_VIEWER]: fileViewerPanel,
    [PANEL_IDS.SETTINGS]: globalPanelVisibility[PANEL_IDS.SETTINGS] ? (
      <AgentSettings onClose={() => {
        toggleGlobalPanel(PANEL_IDS.SETTINGS)
      }} />
    ) : null,
    [PANEL_IDS.TUTORIAL]: (
      <TutorialPanel />
    ),
  }), [
    sidebarPanel,
    terminalPanel,
    explorerPanel, fileViewerPanel,
    globalPanelVisibility,
  ])

  return panelsMap
}
