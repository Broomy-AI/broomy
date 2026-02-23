import React, { useMemo, useState, useEffect } from 'react'
import TabbedTerminal from '../components/TabbedTerminal'
import PanelErrorBoundary from '../components/PanelErrorBoundary'
import Explorer from '../components/explorer'
import FileViewer from '../components/FileViewer'
import AgentSettings from '../components/AgentSettings'
import SessionList from '../components/SessionList'
import WelcomeScreen from '../components/WelcomeScreen'
import TutorialPanel from '../components/TutorialPanel'
import { type Session } from '../store/sessions'
import { PANEL_IDS } from '../panels'
import { useIssuePlanDetection } from './useIssuePlanDetection'
import type { FileStatus } from '../components/FileViewer'
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
  setIsFileViewerDirty: (dirty: boolean) => void
  saveCurrentFileRef: React.MutableRefObject<(() => Promise<void>) | null>
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
    activeSession, navigateToFile, openFileInDiffMode, scrollToLine, searchHighlight,
    diffBaseRef, diffCurrentRef, diffLabel, setIsFileViewerDirty, saveCurrentFileRef,
    handleToggleFileViewer, handleFileViewerPositionChange, selectedFileStatus, fetchGitStatus,
  } = config

  const [tmpdir, setTmpdir] = useState('/tmp')
  useEffect(() => { void window.app.tmpdir().then(setTmpdir) }, [])

  return useMemo(() => {
    if (!activeSession?.showFileViewer) return null
    return (
      <FileViewer
        filePath={activeSession.selectedFilePath}
        position={activeSession.fileViewerPosition}
        onPositionChange={handleFileViewerPositionChange}
        onClose={handleToggleFileViewer}
        fileStatus={selectedFileStatus}
        directory={activeSession.directory}
        onSaveComplete={fetchGitStatus}
        initialViewMode={openFileInDiffMode ? 'diff' : 'latest'}
        scrollToLine={scrollToLine}
        searchHighlight={searchHighlight}
        onDirtyStateChange={setIsFileViewerDirty}
        saveRef={saveCurrentFileRef}
        diffBaseRef={diffBaseRef}
        diffCurrentRef={diffCurrentRef}
        diffLabel={diffLabel}
        reviewContext={activeSession.sessionType === 'review' ? {
          sessionDirectory: activeSession.directory,
          commentsFilePath: `${tmpdir}/broomy-review-${activeSession.id}/comments.json`,
        } : undefined}
        onOpenFile={(targetPath, line) => navigateToFile({ filePath: targetPath, openInDiffMode: false, scrollToLine: line })}
      />
    )
  }, [activeSession, selectedFileStatus, openFileInDiffMode, scrollToLine, searchHighlight, diffBaseRef, diffCurrentRef, diffLabel, fetchGitStatus, handleToggleFileViewer, navigateToFile, tmpdir])
}

export function usePanelsMap(config: PanelsMapConfig) {
  const {
    sessions, activeSessionId, activeSession,
    handleSelectSession, handleNewSession, removeSession, refreshPrStatus,
    archiveSession, unarchiveSession,
    getAgentCommand, getAgentEnv,
    globalPanelVisibility, toggleGlobalPanel,
    repos,
  } = config

  const terminalPanel = useMemo(() => (
    <div className="h-full w-full relative">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`absolute inset-0 ${session.id === activeSessionId ? '' : 'hidden'}`}
        >
          <PanelErrorBoundary name={`Session ${session.branch || session.id}`}>
            <TabbedTerminal
              sessionId={session.id}
              cwd={session.directory}
              isActive={session.id === activeSessionId}
              agentCommand={getAgentCommand(session)}
              agentEnv={getAgentEnv(session)}
            />
          </PanelErrorBoundary>
        </div>
      ))}
      {sessions.length === 0 && (
        <WelcomeScreen onNewSession={handleNewSession} />
      )}
    </div>
  ), [sessions, activeSessionId, getAgentCommand, getAgentEnv, handleNewSession])

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
