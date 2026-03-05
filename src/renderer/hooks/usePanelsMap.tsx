/**
 * Builds the map of panel ID to rendered React element for the layout system, wiring up each panel to active session state.
 */
import { useMemo, useState, useEffect, useCallback } from 'react'
import TabbedTerminal from '../components/TabbedTerminal'
import PanelErrorBoundary from '../components/PanelErrorBoundary'
import Explorer from '../components/explorer'
import FileViewer from '../components/FileViewer'
import AgentSettings from '../components/AgentSettings'
import SessionList from '../components/sessionList'
import WelcomeScreen from '../components/WelcomeScreen'
import TutorialPanel from '../components/TutorialPanel'
import { type Session } from '../store/sessions'
import { PANEL_IDS } from '../panels'
import { useIssuePlanDetection } from './useIssuePlanDetection'
import type { FileStatus, ViewMode } from '../components/FileViewer'
import type { GitFileStatus, GitStatusResult, ManagedRepo } from '../../preload/index'
import type { ExplorerFilter, PrState } from '../store/sessions'
import type { NavigationTarget } from '../utils/fileNavigation'

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
  getAgentResumeCommand: (session: Session) => string | undefined
  getRepoIsolation: (session: Session) => { isolated: boolean; repoRootDir?: string } | undefined
  globalPanelVisibility: Record<string, boolean>
  toggleGlobalPanel: (panelId: string) => void
  selectFile: (sessionId: string, filePath: string) => void
  setExplorerFilter: (sessionId: string, filter: ExplorerFilter) => void
  recordPushToMain: (sessionId: string, commitHash: string) => void
  clearPushToMain: (sessionId: string) => void
  updatePrState: (sessionId: string, prState: PrState, prNumber?: number, prUrl?: string) => void
  setPanelVisibility: (sessionId: string, panelId: string, visible: boolean) => void
  setToolbarPanels: (panels: string[]) => void
  repos: ManagedRepo[]
}

function useExplorerPanel(config: PanelsMapConfig) {
  const {
    activeSessionId, activeSession, activeSessionGitStatus, activeSessionGitStatusResult,
    navigateToFile, fetchGitStatus, setExplorerFilter,
    recordPushToMain, clearPushToMain, updatePrState, repos,
  } = config

  const issuePlanExists = useIssuePlanDetection(activeSessionId, activeSession?.directory)

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
        onFilterChange={(filter) => {
          if (activeSessionId) setExplorerFilter(activeSessionId, filter)
        }}
        onGitStatusRefresh={fetchGitStatus}
        recentFiles={activeSession.recentFiles}
        sessionId={activeSessionId ?? undefined}
        pushedToMainAt={activeSession.pushedToMainAt}
        pushedToMainCommit={activeSession.pushedToMainCommit}
        onRecordPushToMain={(commitHash) => activeSessionId && recordPushToMain(activeSessionId, commitHash)}
        onClearPushToMain={() => activeSessionId && clearPushToMain(activeSessionId)}
        planFilePath={activeSession.planFilePath}
        branchStatus={activeSession.branchStatus}
        onUpdatePrState={(prState, prNumber, prUrl) => activeSessionId && updatePrState(activeSessionId, prState, prNumber, prUrl)}
        repoId={activeSession.repoId}
        agentPtyId={activeSession.agentPtyId}
        session={activeSession}
        repo={repos.find(r => r.id === activeSession.repoId)}
        issueNumber={activeSession.issueNumber}
        issueTitle={activeSession.issueTitle}
        issueUrl={activeSession.issueUrl}
        issuePlanExists={issuePlanExists}
      />
    )
  }, [activeSessionId, activeSession, activeSessionGitStatus, activeSessionGitStatusResult, navigateToFile, fetchGitStatus, repos, issuePlanExists])
}

function useFileViewerPanel(config: PanelsMapConfig) {
  const {
    sessions, activeSessionId, navigateToFile, openFileInDiffMode, scrollToLine, searchHighlight,
    diffBaseRef, diffCurrentRef, diffLabel, setIsFileViewerDirty,
    registerSaveFunction,
    handleToggleFileViewer, handleFileViewerPositionChange, selectedFileStatus, fetchGitStatus,
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
                onOpenFile={isActive ? (targetPath, line) => navigateToFile({ filePath: targetPath, openInDiffMode: false, scrollToLine: line }) : undefined}
              />
            </div>
          )
        })}
      </div>
    )
  }, [sessions, activeSessionId, selectedFileStatus, sessionViewModes, scrollToLine, searchHighlight, diffBaseRef, diffCurrentRef, diffLabel, fetchGitStatus, handleToggleFileViewer, handleFileViewerPositionChange, navigateToFile, tmpdir, setIsFileViewerDirty, makeSaveFunctionCallback])
}

export function usePanelsMap(config: PanelsMapConfig) {
  const {
    sessions, activeSessionId, activeSession,
    handleSelectSession, handleNewSession, removeSession, refreshPrStatus,
    archiveSession, unarchiveSession,
    getAgentCommand, getAgentEnv, getAgentResumeCommand,
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
          <div
            key={session.id}
            className={`absolute inset-0 ${session.id === activeSessionId ? '' : 'invisible pointer-events-none'}`}
          >
            <PanelErrorBoundary name={`Session ${session.branch || session.id}`}>
              <TabbedTerminal
                sessionId={session.id}
                cwd={session.directory}
                isActive={session.id === activeSessionId}
                agentCommand={getAgentCommand(session)}
                agentEnv={getAgentEnv(session)}
                agentResumeCommand={getAgentResumeCommand(session)}
                isRestored={session.isRestored}
                isolated={repo?.isolated ?? false}
                repoRootDir={repo?.rootDir}
              />
            </PanelErrorBoundary>
          </div>
        )
      })}
      {sessions.length === 0 && (
        <WelcomeScreen onNewSession={handleNewSession} />
      )}
    </div>
  ), [terminalSessionKey, activeSessionId, getAgentCommand, getAgentEnv, getAgentResumeCommand, handleNewSession, repos])

  const explorerPanel = useExplorerPanel(config)
  const fileViewerPanel = useFileViewerPanel(config)

  const panelsMap = useMemo(() => ({
    [PANEL_IDS.SIDEBAR]: (
      <SessionList
        sessions={sessions}
        activeSessionId={activeSessionId}
        repos={repos}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={removeSession}
        onRefreshPrStatus={refreshPrStatus}
        onArchiveSession={archiveSession}
        onUnarchiveSession={unarchiveSession}
      />
    ),
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
    sessions, activeSessionId, activeSession,
    terminalPanel,
    explorerPanel, fileViewerPanel,
    globalPanelVisibility,
    repos,
  ])

  return panelsMap
}
