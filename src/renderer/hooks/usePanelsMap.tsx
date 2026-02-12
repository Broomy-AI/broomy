import React, { useMemo } from 'react'
import Terminal from '../components/Terminal'
import TabbedTerminal from '../components/TabbedTerminal'
import Explorer from '../components/explorer'
import FileViewer from '../components/FileViewer'
import ReviewPanel from '../components/review'
import AgentSettings from '../components/AgentSettings'
import SessionList from '../components/SessionList'
import { useSessionStore, type Session } from '../store/sessions'
import { PANEL_IDS } from '../panels'
import type { FileStatus } from '../components/FileViewer'
import type { GitFileStatus, GitStatusResult, ManagedRepo } from '../../preload/index'
import type { ExplorerFilter, PrState } from '../store/sessions'
import type { NavigationTarget } from '../utils/fileNavigation'

interface PanelsMapConfig {
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
    recordPushToMain, clearPushToMain, updatePrState, setPanelVisibility, setToolbarPanels,
  } = config

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
        onFilterChange={(filter) => activeSessionId && setExplorerFilter(activeSessionId, filter)}
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
        onOpenReview={() => {
          if (activeSessionId) {
            setPanelVisibility(activeSessionId, PANEL_IDS.REVIEW, true)
            const { toolbarPanels } = useSessionStore.getState()
            if (!toolbarPanels.includes(PANEL_IDS.REVIEW)) {
              const explorerIdx = toolbarPanels.indexOf(PANEL_IDS.EXPLORER)
              const updated = [...toolbarPanels]
              if (explorerIdx >= 0) updated.splice(explorerIdx + 1, 0, PANEL_IDS.REVIEW)
              else updated.push(PANEL_IDS.REVIEW)
              setToolbarPanels(updated)
            }
          }
        }}
      />
    )
  }, [activeSessionId, activeSession, activeSessionGitStatus, activeSessionGitStatusResult, navigateToFile, fetchGitStatus])
}

function useFileViewerPanel(config: PanelsMapConfig) {
  const {
    activeSession, navigateToFile, openFileInDiffMode, scrollToLine, searchHighlight,
    diffBaseRef, diffCurrentRef, diffLabel, setIsFileViewerDirty, saveCurrentFileRef,
    handleToggleFileViewer, handleFileViewerPositionChange, selectedFileStatus, fetchGitStatus,
  } = config

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
          commentsFilePath: `/tmp/broomy-review-${activeSession.id}/comments.json`,
        } : undefined}
        onOpenFile={(targetPath, line) => navigateToFile({ filePath: targetPath, openInDiffMode: false, scrollToLine: line })}
      />
    )
  }, [activeSession, selectedFileStatus, openFileInDiffMode, scrollToLine, searchHighlight, diffBaseRef, diffCurrentRef, diffLabel, fetchGitStatus, handleToggleFileViewer, navigateToFile])
}

export function usePanelsMap(config: PanelsMapConfig) {
  const {
    sessions, activeSessionId, activeSession,
    handleSelectSession, handleNewSession, removeSession, refreshPrStatus,
    archiveSession, unarchiveSession,
    getAgentCommand, getAgentEnv,
    globalPanelVisibility, toggleGlobalPanel,
    navigateToFile, repos,
  } = config

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
            <p className="text-sm mt-2">Click &quot;+ New Session&quot; to add a git repository.</p>
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
    [PANEL_IDS.AGENT_TERMINAL]: agentTerminalPanel,
    [PANEL_IDS.USER_TERMINAL]: userTerminalPanel,
    [PANEL_IDS.EXPLORER]: explorerPanel,
    [PANEL_IDS.FILE_VIEWER]: fileViewerPanel,
    [PANEL_IDS.REVIEW]: activeSession ? (
      <ReviewPanel
        session={activeSession}
        repo={repos.find(r => r.id === activeSession.repoId)}
        onSelectFile={(filePath, openInDiffMode, scrollToLine, diffBaseRef) => {
          navigateToFile({ filePath, openInDiffMode, scrollToLine, diffBaseRef })
        }}
      />
    ) : null,
    [PANEL_IDS.SETTINGS]: globalPanelVisibility[PANEL_IDS.SETTINGS] ? (
      <AgentSettings onClose={() => toggleGlobalPanel(PANEL_IDS.SETTINGS)} />
    ) : null,
  }), [
    sessions, activeSessionId, activeSession,
    agentTerminalPanel, userTerminalPanel,
    explorerPanel, fileViewerPanel,
    globalPanelVisibility,
    navigateToFile, repos,
  ])

  return panelsMap
}
