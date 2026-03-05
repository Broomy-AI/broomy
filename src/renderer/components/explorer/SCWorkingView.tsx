/**
 * Source control view for uncommitted changes with staging, committing, and modular action buttons.
 *
 * Built-in actions (manual commit, commit merge) are always available.
 * All other actions come from commands.json via ActionButtons.
 */
import { useState } from 'react'
import type { GitFileStatus, GitStatusResult } from '../../../preload/index'
import type { BranchStatus } from '../../store/sessions'
import type { NavigationTarget } from '../../utils/fileNavigation'
import type { ActionDefinition, ConditionState, TemplateVars } from '../../utils/commandsConfig'
import { StatusBadge, BranchStatusCard } from './icons'
import { statusLabel, getStatusColor } from '../../utils/explorerHelpers'
import { CommitMessageDialog } from './CommitMessageDialog'
import { ActionButtons } from './ActionButtons'

export interface SCWorkingViewProps {
  directory: string
  gitStatus: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  branchStatus?: BranchStatus
  branchBaseName: string
  stagedFiles: GitFileStatus[]
  unstagedFiles: GitFileStatus[]
  isMerging: boolean
  hasConflicts: boolean
  isCommitting: boolean
  onCommit: (message: string, stageAll?: boolean) => void
  onCommitMerge: () => void
  onStage: (filePath: string) => void
  onStageAll: () => void
  onUnstage: (filePath: string) => void
  onFileSelect?: (target: NavigationTarget) => void
  onSwitchTab?: (tab: string) => void
  onGitStatusRefresh?: () => void
  // Modular actions
  actions: ActionDefinition[] | null
  conditionState: ConditionState
  templateVars: TemplateVars
  agentPtyId?: string
  agentId?: string | null
  onOpenCommandsEditor?: () => void
}

function StatusInfoContent({ syncStatus, branchStatus }: { syncStatus?: GitStatusResult | null; branchStatus?: BranchStatus }) {
  const ahead = syncStatus?.ahead ?? 0
  const behind = syncStatus?.behind ?? 0
  const currentBranch = syncStatus?.current ?? ''
  const isOnMain = currentBranch === 'main' || currentBranch === 'master'
  const hasNoTracking = !syncStatus?.tracking && !isOnMain && !!currentBranch
  const isUpToDate = ahead === 0 && behind === 0
  const showBranchCard = branchStatus && branchStatus !== 'in-progress' && isUpToDate

  return (
    <>
      {syncStatus?.tracking && (
        <div className="text-xs text-text-secondary text-center">
          {syncStatus.current} &rarr; {syncStatus.tracking}
        </div>
      )}

      {ahead > 0 && (
        <div className="flex items-center gap-2 text-xs text-green-400">
          <span>&uarr;</span>
          <span>{ahead} commit{ahead !== 1 ? 's' : ''} to push</span>
        </div>
      )}
      {behind > 0 && (
        <div className="flex items-center gap-2 text-xs text-blue-400">
          <span>&darr;</span>
          <span>{behind} commit{behind !== 1 ? 's' : ''} to pull</span>
        </div>
      )}

      {hasNoTracking && (
        <div className="text-xs text-yellow-400">No remote tracking branch</div>
      )}

      {showBranchCard && (
        <BranchStatusCard status={branchStatus} />
      )}

      {isUpToDate && !hasNoTracking && !showBranchCard && (
        <div className="text-xs text-text-secondary">Up to date</div>
      )}
    </>
  )
}

function StatusInfo({ syncStatus, branchStatus }: { syncStatus?: GitStatusResult | null; branchStatus?: BranchStatus }) {
  return (
    <div className="px-3 py-2 border-b border-border flex flex-col items-center gap-2">
      <StatusInfoContent syncStatus={syncStatus} branchStatus={branchStatus} />
    </div>
  )
}

function BuiltInCommitArea({ isMerging, hasConflicts, isCommitting, onCommit, onCommitMerge, hasStagedFiles }: {
  isMerging: boolean
  hasConflicts: boolean
  isCommitting: boolean
  onCommit: (message: string, stageAll?: boolean) => void
  onCommitMerge: () => void
  hasStagedFiles: boolean
}) {
  const [showCommitDialog, setShowCommitDialog] = useState(false)

  // Only show built-in commit UI when there are uncommitted changes
  // The "Commit with AI" and "Resolve Conflicts" buttons are now in commands.json
  return (
    <div className="px-3 py-2 border-b border-border">
      {isMerging ? (
        <div className="flex flex-col gap-1.5">
          <div className={`text-xs font-medium ${hasConflicts ? 'text-yellow-400' : 'text-green-400'}`}>
            {hasConflicts ? 'Merge in progress' : 'Merge conflicts resolved'}
          </div>
          {!hasConflicts && (
            <button
              onClick={onCommitMerge}
              disabled={isCommitting}
              className="w-full px-2 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCommitting ? 'Committing...' : 'Commit Merge'}
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowCommitDialog(true)}
          disabled={isCommitting}
          className="w-full px-2 py-1.5 text-xs rounded border border-border text-text-primary hover:bg-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCommitting ? 'Committing...' : 'Commit'}
        </button>
      )}
      {showCommitDialog && (
        <CommitMessageDialog
          onCommit={onCommit}
          onClose={() => setShowCommitDialog(false)}
          hasStagedFiles={hasStagedFiles}
        />
      )}
    </div>
  )
}

function FileList({ directory, stagedFiles, unstagedFiles, onStage, onStageAll, onUnstage, onFileSelect }: {
  directory: string
  stagedFiles: GitFileStatus[]
  unstagedFiles: GitFileStatus[]
  onStage: (filePath: string) => void
  onStageAll: () => void
  onUnstage: (filePath: string) => void
  onFileSelect?: (target: NavigationTarget) => void
}) {
  return (
    <div className="flex-1 overflow-y-auto text-sm">
      <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
        Staged Changes ({stagedFiles.length})
      </div>
      {stagedFiles.length === 0 ? (
        <div className="px-3 py-2 text-xs text-text-secondary">No staged changes</div>
      ) : (
        stagedFiles.map((file) => (
          <div
            key={`staged-${file.path}`}
            className="flex items-center gap-2 px-3 py-1 hover:bg-bg-tertiary cursor-pointer group"
            title={`${file.path} — ${statusLabel(file.status)} (staged)`}
            onClick={() => onFileSelect?.({ filePath: `${directory}/${file.path}`, openInDiffMode: true })}
          >
            <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>{file.path}</span>
            <StatusBadge status={file.status} />
            <button
              onClick={(e) => { e.stopPropagation(); onUnstage(file.path) }}
              className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary text-xs px-1"
              title="Unstage"
            >-</button>
          </div>
        ))
      )}

      <div
        className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary mt-1 cursor-default"
        onContextMenu={async (e) => {
          e.preventDefault()
          if (unstagedFiles.length === 0) return
          const action = await window.menu.popup([{ id: 'stage-all', label: 'Stage All Changes' }])
          if (action === 'stage-all') onStageAll()
        }}
      >
        Changes ({unstagedFiles.length})
      </div>
      {unstagedFiles.length === 0 ? (
        <div className="px-3 py-2 text-xs text-text-secondary">No changes</div>
      ) : (
        unstagedFiles.map((file) => (
          <div
            key={`unstaged-${file.path}`}
            className="flex items-center gap-2 px-3 py-1 hover:bg-bg-tertiary cursor-pointer group"
            title={`${file.path} — ${statusLabel(file.status)}`}
            onClick={() => onFileSelect?.({ filePath: `${directory}/${file.path}`, openInDiffMode: true })}
          >
            <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>{file.path}</span>
            <StatusBadge status={file.status} />
            <button
              onClick={(e) => { e.stopPropagation(); onStage(file.path) }}
              className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary text-xs px-1"
              title="Stage"
            >+</button>
          </div>
        ))
      )}
    </div>
  )
}

export function SCWorkingView({
  directory,
  gitStatus,
  syncStatus,
  branchStatus,
  branchBaseName: _branchBaseName,
  stagedFiles,
  unstagedFiles,
  isMerging,
  hasConflicts,
  isCommitting,
  onCommit,
  onCommitMerge,
  onStage,
  onStageAll,
  onUnstage,
  onFileSelect,
  onSwitchTab,
  onGitStatusRefresh,
  actions,
  conditionState,
  templateVars,
  agentPtyId,
  agentId,
  onOpenCommandsEditor,
}: SCWorkingViewProps) {
  const hasChanges = gitStatus.length > 0

  return (
    <>
      {/* Status info (tracking, ahead/behind, branch status card) */}
      <StatusInfo syncStatus={syncStatus} branchStatus={branchStatus} />

      {/* Built-in commit UI (manual commit, commit merge) */}
      {hasChanges && (
        <BuiltInCommitArea
          isMerging={isMerging}
          hasConflicts={hasConflicts}
          isCommitting={isCommitting}
          onCommit={onCommit}
          onCommitMerge={onCommitMerge}
          hasStagedFiles={stagedFiles.length > 0}
        />
      )}

      {/* Modular action buttons from commands.json */}
      <ActionButtons
        actions={actions}
        conditionState={conditionState}
        templateVars={templateVars}
        directory={directory}
        agentPtyId={agentPtyId}
        agentId={agentId}
        onGitStatusRefresh={onGitStatusRefresh}
        onSwitchTab={onSwitchTab}
        onOpenCommandsEditor={onOpenCommandsEditor}
      />

      {/* File list (staged + unstaged) */}
      {hasChanges && (
        <FileList
          directory={directory}
          stagedFiles={stagedFiles}
          unstagedFiles={unstagedFiles}
          onStage={onStage}
          onStageAll={onStageAll}
          onUnstage={onUnstage}
          onFileSelect={onFileSelect}
        />
      )}
    </>
  )
}
