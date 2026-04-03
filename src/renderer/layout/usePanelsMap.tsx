/**
 * Builds the map of panel ID to rendered React element for the layout system, wiring up each panel to active session state.
 */
import { useMemo, useState, useEffect, useCallback, memo } from 'react'
import TabbedTerminal from '../panels/agent/TabbedTerminal'
import PanelErrorBoundary from '../shared/components/PanelErrorBoundary'
import Explorer from '../panels/explorer/ExplorerPanel'
import FileViewer from '../panels/fileViewer/FileViewer'
import { CommandsEditor } from '../panels/fileViewer/CommandsEditor'
import AgentSettings from '../panels/settings/AgentSettings'
import SessionList from '../panels/sidebar/SessionList'
import WelcomeScreen from '../panels/agent/WelcomeScreen'
import TutorialPanel from '../panels/tutorial/TutorialPanel'
import { useSessionStore, type Session } from '../store/sessions'
import { PANEL_IDS } from '../panels'
import { useOutputDirWatcher } from '../panels/explorer/hooks/useOutputDirWatcher'
import type { FileStatus, ViewMode } from '../panels/fileViewer/FileViewer'
import type { GitFileStatus, GitStatusResult, ManagedRepo } from '../../preload/index'
import type { ExplorerFilter, PrState } from '../store/sessions'
import type { NavigationTarget } from '../shared/utils/fileNavigation'

/** Wrapper that subscribes each session terminal to its own visibility from the store. */
const SessionTerminal = memo(function SessionTerminal({
  sessionId, cwd, branch, agentCommand, agentEnv, isRestored, isolated, repoRootDir,
  connectionMode, skipApproval, sdkSessionId, agentModel, agentEffort,
}: {
  sessionId: string; cwd: string; branch: string
  agentCommand?: string; agentEnv?: Record<string, string>
  isRestored?: boolean
  isolated: boolean; repoRootDir?: string
  connectionMode?: 'terminal' | 'api'
  skipApproval?: boolean
  sdkSessionId?: string
  agentModel?: string
  agentEffort?: 'low' | 'medium' | 'high' | 'max'
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
          connectionMode={connectionMode}
          skipApproval={skipApproval}
          sdkSessionId={sdkSessionId}
          agentModel={agentModel}
          agentEffort={agentEffort}
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
  getAgentConnectionMode: (session: Session) => 'terminal' | 'api' | undefined
  getAgentModel: (session: Session) => string | undefined
  getAgentEffort: (session: Session) => 'low' | 'medium' | 'high' | 'max' | undefined
  getAgentSkipApproval: (session: Session) => boolean
  globalPanelVisibility: Record<string, boolean>
  toggleGlobalPanel: (panelId: string) => void
  selectFile: (sessionId: string, filePath: string) => void
  setExplorerFilter: (sessionId: string, filter: ExplorerFilter) => void
  updatePrState: (sessionId: string, prState: PrState, prNumber?: number, prUrl?: string) => void
  updateFeedbackStatus: (sessionId: string, hasFeedback: boolean) => void
  updateChecksStatus: (sessionId: string, checksStatus: 'passed' | 'failed' | 'pending' | 'none') => void
  setPanelVisibility: (sessionId: string, panelId: string, visible: boolean) => void
  setToolbarPanels: (panels: string[]) => void
  closeCommandsEditor: (sessionId: string) => void
  repos: ManagedRepo[]
}

function useExplorerPanel(config: PanelsMapConfig) {
  const {
    activeSessionId, activeSession, activeSessionGitStatus, activeSessionGitStatusResult,
    navigateToFile, fetchGitStatus, setExplorerFilter,
    updatePrState, updateFeedbackStatus, updateChecksStatus, repos,
  } = config

  const { issuePlanExists, suggestGitignore, dismissGitignore } = useOutputDirWatcher(activeSessionId, activeSession?.directory)

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

  const handleUpdateFeedbackStatus = useCallback((hasFeedback: boolean) => {
    if (activeSessionId) updateFeedbackStatus(activeSessionId, hasFeedback)
  }, [activeSessionId, updateFeedbackStatus])

  const handleUpdateChecksStatus = useCallback((checksStatus: 'passed' | 'failed' | 'pending' | 'none') => {
    if (activeSessionId) updateChecksStatus(activeSessionId, checksStatus)
  }, [activeSessionId, updateChecksStatus])

  return useMemo(() => {
    if (!activeSession?.showExplorer || activeSession.status === 'initializing') return null
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
        statusChip={activeSession.statusChip}
        onUpdatePrState={handleUpdatePrState}
        onUpdateFeedbackStatus={handleUpdateFeedbackStatus}
        onUpdateChecksStatus={handleUpdateChecksStatus}
        repoId={activeSession.repoId}
        agentPtyId={activeSession.agentPtyId}
        session={activeSession}
        repo={activeRepo}
        issueNumber={activeSession.issueNumber}
        issueTitle={activeSession.issueTitle}
        issueUrl={activeSession.issueUrl}
        issuePlanExists={issuePlanExists}
        suggestGitignore={suggestGitignore}
        onDismissGitignore={dismissGitignore}
      />
    )
  }, [activeSessionId, activeSession, activeSessionGitStatus, activeSessionGitStatusResult, navigateToFile, fetchGitStatus, activeRepo, issuePlanExists, suggestGitignore, dismissGitignore, handleFilterChange, handleUpdatePrState, handleUpdateFeedbackStatus, handleUpdateChecksStatus])
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
        {sessions.filter(s => s.status !== 'initializing').map((session) => {
          const isActive = session.id === activeSessionId

          // Show commands editor when commandsEditorDirectory is set
          if (session.commandsEditorDirectory) {
            return (
              <div
                key={session.id}
                className={`absolute inset-0 ${isActive ? '' : 'invisible pointer-events-none'}`}
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
              className={`absolute inset-0 ${isActive ? '' : 'invisible pointer-events-none'}`}
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
    getAgentConnectionMode, getAgentModel, getAgentEffort, getAgentSkipApproval,
    globalPanelVisibility, toggleGlobalPanel,
    repos,
  } = config

  // Derive a stable key from only the session fields the terminal cares about.
  // Runtime fields (status, lastMessage, isUnread) are excluded — they change
  // constantly during agent activity and don't affect terminal rendering.
  // Only the initializing/error states matter (they render a spinner/error
  // instead of SessionTerminal).
  const terminalSessionKey = useMemo(() =>
    sessions.filter(s => !s.isArchived)
      .map(s => `${s.id}|${s.directory}|${s.isRestored}|${s.agentId}|${s.repoId}|${s.status === 'initializing'}|${s.initError ?? ''}`)
      .join(','),
    [sessions]
  )

  const terminalPanel = useMemo(() => (
    <div className="h-full w-full relative">
      {sessions.filter(s => !s.isArchived).map((session) => {
        if (session.status === 'initializing') {
          const isVisible = session.id === config.activeSessionId
          return (
            <div key={session.id} className={`absolute inset-0 flex items-center justify-center ${isVisible ? '' : 'invisible pointer-events-none'}`}>
              <div className="text-center text-text-secondary">
                <svg className="animate-spin w-6 h-6 mx-auto mb-2 text-accent" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <div className="text-sm">Setting up session...</div>
                <div className="text-xs mt-1 text-text-secondary/60">Creating worktree and pushing branch</div>
              </div>
            </div>
          )
        }
        if (session.initError) {
          const isVisible = session.id === config.activeSessionId
          return (
            <div key={session.id} className={`absolute inset-0 flex items-center justify-center ${isVisible ? '' : 'invisible pointer-events-none'}`}>
              <div className="text-center text-text-secondary max-w-md">
                <div className="text-sm text-status-error mb-2">Setup failed</div>
                <div className="text-xs text-text-secondary/80 mb-3">{session.initError}</div>
              </div>
            </div>
          )
        }
        const agentCommand = getAgentCommand(session)
        // If the session expects an agent but the command isn't resolved yet
        // (e.g. repo data still loading), wait rather than mounting a terminal
        // that would need to be torn down and recreated moments later.
        if (session.agentId && !agentCommand) {
          const isVisible = session.id === config.activeSessionId
          return (
            <div key={session.id} className={`absolute inset-0 flex items-center justify-center ${isVisible ? '' : 'invisible pointer-events-none'}`}>
              <div className="text-center text-text-secondary">
                <svg className="animate-spin w-6 h-6 mx-auto mb-2 text-accent" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <div className="text-sm">Starting agent...</div>
              </div>
            </div>
          )
        }
        const repo = session.repoId ? repos.find(r => r.id === session.repoId) : undefined
        return (
          <SessionTerminal
            key={session.id}
            sessionId={session.id}
            cwd={session.directory}
            branch={session.branch}
            agentCommand={agentCommand}
            agentEnv={getAgentEnv(session)}
            isRestored={session.isRestored}
            isolated={repo?.isolated ?? false}
            repoRootDir={repo?.rootDir}
            connectionMode={getAgentConnectionMode(session)}
            skipApproval={getAgentSkipApproval(session)}
            sdkSessionId={session.sdkSessionId}
            agentModel={getAgentModel(session)}
            agentEffort={getAgentEffort(session)}
          />
        )
      })}
      {sessions.length === 0 && (
        <WelcomeScreen onNewSession={handleNewSession} />
      )}
    </div>
  ), [terminalSessionKey, getAgentCommand, getAgentEnv, handleNewSession, repos, config.activeSessionId])

  const explorerPanel = useExplorerPanel(config)
  const fileViewerPanel = useFileViewerPanel(config)

  const sidebarPanel = useMemo(() => (
    <SessionList
      repos={repos}
      onSelectSession={handleSelectSession}
      onNewSession={handleNewSession}
      onDeleteSession={removeSession}
      onRefreshPrStatus={refreshPrStatus}
      onArchiveSession={archiveSession}
      onUnarchiveSession={unarchiveSession}
    />
  ), [repos, handleSelectSession, handleNewSession, removeSession, refreshPrStatus, archiveSession, unarchiveSession])

  const panelsMap = useMemo(() => ({
    [PANEL_IDS.SIDEBAR]: sidebarPanel,
    [PANEL_IDS.AGENT]: terminalPanel,
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
