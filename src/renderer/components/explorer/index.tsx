/**
 * Explorer panel entry point with tabbed navigation between file tree, source control, search, recent files, and review.
 */
import type { ExplorerProps } from './types'
import { FileTreeIcon, SourceControlIcon, SearchIcon, RecentIcon, ReviewIcon } from './icons'
import { FileTree } from './FileTree'
import { SourceControl } from './SourceControl'
import { SearchPanel } from './SearchPanel'
import { RecentFiles } from './RecentFiles'
import ReviewPanel from '../review'
import { IssuePlanChip } from './IssuePlanChip'
import { focusSearchInput } from '../../utils/focusHelpers'
import PanelErrorBoundary from '../PanelErrorBoundary'
import type { ExplorerFilter } from '../../store/sessions'

function TabButton({ filter, current, onClick, title, children }: { filter: ExplorerFilter; current: ExplorerFilter; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`p-1 rounded transition-colors ${current === filter ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'}`} title={title}>
      {children}
    </button>
  )
}

export default function Explorer({
  directory,
  onFileSelect,
  selectedFilePath,
  gitStatus = [],
  syncStatus,
  filter,
  onFilterChange,
  onGitStatusRefresh,
  recentFiles = [],
  sessionId: _sessionId,
  pushedToMainAt,
  pushedToMainCommit,
  onRecordPushToMain,
  onClearPushToMain,
  planFilePath,
  branchStatus,
  onUpdatePrState,
  repoId,
  agentPtyId,
  session,
  repo,
  issueNumber,
  issueTitle,
  issueUrl,
  issuePlanExists,
}: ExplorerProps) {
  if (!directory) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Select a session to view files
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">Explorer</span>
        <div className="flex items-center gap-1">
          <TabButton filter="files" current={filter} onClick={() => onFilterChange('files')} title="Files"><FileTreeIcon /></TabButton>
          <TabButton filter="source-control" current={filter} onClick={() => onFilterChange('source-control')} title="Source Control"><SourceControlIcon /></TabButton>
          <TabButton filter="search" current={filter} onClick={() => { onFilterChange('search'); focusSearchInput() }} title="Search"><SearchIcon /></TabButton>
          <TabButton filter="recent" current={filter} onClick={() => onFilterChange('recent')} title="Recent Files"><RecentIcon /></TabButton>
          <TabButton filter="review" current={filter} onClick={() => onFilterChange('review')} title="Review"><ReviewIcon /></TabButton>
        </div>
      </div>

      {/* Plan chip - shown at top when plan file is detected */}
      {planFilePath && (
        <div className="px-3 py-1.5 border-b border-border">
          <button
            onClick={() => onFileSelect?.({ filePath: planFilePath, openInDiffMode: false })}
            className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
              selectedFilePath === planFilePath
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-accent/20'
            }`}
            title={planFilePath}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
            Plan
          </button>
        </div>
      )}

      {/* Issue plan chip */}
      <IssuePlanChip
        directory={directory}
        issueNumber={issueNumber}
        issuePlanExists={issuePlanExists}
        agentPtyId={agentPtyId}
        onFileSelect={onFileSelect}
      />

      {/* Tab content - scrollable area below pinned toolbar */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filter === 'files' && (
          <PanelErrorBoundary name="File Tree">
            <FileTree
              directory={directory}
              onFileSelect={onFileSelect}
              selectedFilePath={selectedFilePath}
              gitStatus={gitStatus}
            />
          </PanelErrorBoundary>
        )}

        {filter === 'source-control' && (
          <PanelErrorBoundary name="Source Control">
            <SourceControl
              directory={directory}
              gitStatus={gitStatus}
              syncStatus={syncStatus}
              onFileSelect={onFileSelect}
              onGitStatusRefresh={onGitStatusRefresh}
              branchStatus={branchStatus}
              repoId={repoId}
              agentPtyId={agentPtyId}
              onUpdatePrState={onUpdatePrState}
              issueNumber={issueNumber}
              issueTitle={issueTitle}
              issueUrl={issueUrl}
              pushedToMainAt={pushedToMainAt}
              pushedToMainCommit={pushedToMainCommit}
              onRecordPushToMain={onRecordPushToMain}
              onClearPushToMain={onClearPushToMain}
              onOpenReview={() => onFilterChange('review')}
            />
          </PanelErrorBoundary>
        )}

        {filter === 'search' && (
          <PanelErrorBoundary name="Search">
            <SearchPanel
              directory={directory}
              onFileSelect={onFileSelect}
            />
          </PanelErrorBoundary>
        )}

        {filter === 'recent' && (
          <PanelErrorBoundary name="Recent Files">
            <RecentFiles
              recentFiles={recentFiles}
              onFileSelect={onFileSelect}
              selectedFilePath={selectedFilePath}
              directory={directory}
            />
          </PanelErrorBoundary>
        )}

        {filter === 'review' && session && (
          <PanelErrorBoundary name="Review">
            <ReviewPanel
              session={session}
              repo={repo}
              onSelectFile={(filePath, openInDiffMode, scrollToLine, diffBaseRef) => {
                onFileSelect?.({ filePath, openInDiffMode, scrollToLine, diffBaseRef })
              }}
            />
          </PanelErrorBoundary>
        )}

      </div>
    </div>
  )
}
