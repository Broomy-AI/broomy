import type { GitFileStatus, GitStatusResult } from '../../../preload/index'
import type { BranchStatus } from '../../store/sessions'
import type { NavigationTarget } from '../../utils/fileNavigation'
import { StatusBadge, BranchStatusCard } from './icons'
import { statusLabel, getStatusColor } from '../../utils/explorerHelpers'

interface SCWorkingViewProps {
  directory: string
  gitStatus: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  branchStatus?: BranchStatus
  branchBaseName: string
  stagedFiles: GitFileStatus[]
  unstagedFiles: GitFileStatus[]
  commitMessage: string
  setCommitMessage: (msg: string) => void
  isCommitting: boolean
  commitError: string | null
  commitErrorExpanded: boolean
  setCommitErrorExpanded: (expanded: boolean) => void
  setCommitError: (error: string | null) => void
  isSyncing: boolean
  onCommit: () => void
  onSync: () => void
  onPushNewBranch: (branchName: string) => void
  onStage: (filePath: string) => void
  onStageAll: () => void
  onUnstage: (filePath: string) => void
  onFileSelect?: (target: NavigationTarget) => void
  onOpenReview?: () => void
  // PR and push to main
  prStatus: { number: number; state: string } | null
  hasWriteAccess: boolean
  isPushingToMain: boolean
  allowPushToMain: boolean
  onCreatePr: () => void
  onPushToMain: () => void
}

function SyncStatusContent({
  ahead,
  behind,
  branchStatus,
  branchBaseName,
  hasNoTracking,
  onOpenReview,
  prStatus,
  hasWriteAccess,
  isPushingToMain,
  allowPushToMain,
  onCreatePr,
  onPushToMain,
}: {
  ahead: number
  behind: number
  branchStatus?: BranchStatus
  branchBaseName: string
  hasNoTracking: boolean
  onOpenReview?: () => void
  prStatus: { number: number; state: string } | null
  hasWriteAccess: boolean
  isPushingToMain: boolean
  allowPushToMain: boolean
  onCreatePr: () => void
  onPushToMain: () => void
}) {
  const hasRemoteChanges = ahead > 0 || behind > 0

  if (hasRemoteChanges) {
    return (
      <div className="flex flex-col items-center gap-2">
        {ahead > 0 && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <span className="text-lg">&uarr;</span>
            <span className="font-medium">{ahead} commit{ahead !== 1 ? 's' : ''} to push</span>
          </div>
        )}
        {behind > 0 && (
          <div className="flex items-center gap-2 text-sm text-blue-400">
            <span className="text-lg">&darr;</span>
            <span className="font-medium">{behind} commit{behind !== 1 ? 's' : ''} to pull</span>
          </div>
        )}
      </div>
    )
  }

  if (branchStatus && branchStatus !== 'in-progress') {
    return (
      <>
        <BranchStatusCard status={branchStatus} />
        {branchStatus === 'pushed' && !prStatus && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onCreatePr}
              className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80"
            >
              Create PR
            </button>
            {hasWriteAccess && allowPushToMain && (
              <button
                onClick={onPushToMain}
                disabled={isPushingToMain}
                className="px-2 py-1 text-xs rounded bg-bg-tertiary text-text-primary hover:bg-bg-secondary disabled:opacity-50"
              >
                {isPushingToMain ? 'Pushing...' : `Push to ${branchBaseName}`}
              </button>
            )}
          </div>
        )}
        {(branchStatus === 'open' || branchStatus === 'pushed') && onOpenReview && (
          <button
            onClick={onOpenReview}
            className="px-4 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-500 transition-colors"
          >
            Get AI Review
          </button>
        )}
      </>
    )
  }

  if (hasNoTracking) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="text-sm text-text-secondary">Up to date</div>
        <div className="text-xs text-yellow-400">No remote tracking branch</div>
      </div>
    )
  }

  return <div className="text-sm text-text-secondary">Up to date</div>
}

function SyncView({
  syncStatus,
  branchStatus,
  branchBaseName,
  isSyncing,
  onSync,
  onPushNewBranch,
  onOpenReview,
  prStatus,
  hasWriteAccess,
  isPushingToMain,
  allowPushToMain,
  onCreatePr,
  onPushToMain,
}: Pick<SCWorkingViewProps, 'syncStatus' | 'branchStatus' | 'branchBaseName' | 'isSyncing' | 'onSync' | 'onPushNewBranch' | 'onOpenReview' | 'prStatus' | 'hasWriteAccess' | 'isPushingToMain' | 'allowPushToMain' | 'onCreatePr' | 'onPushToMain'>) {
  const ahead = syncStatus?.ahead ?? 0
  const behind = syncStatus?.behind ?? 0
  const hasRemoteChanges = ahead > 0 || behind > 0
  const currentBranch = syncStatus?.current ?? ''
  const isOnMainBranch = currentBranch === 'main' || currentBranch === 'master'
  const hasNoTracking = !syncStatus?.tracking && !isOnMainBranch && !!currentBranch

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
      {syncStatus?.tracking && (
        <div className="text-xs text-text-secondary text-center">
          {syncStatus.current} &rarr; {syncStatus.tracking}
        </div>
      )}

      <SyncStatusContent
        ahead={ahead}
        behind={behind}
        branchStatus={branchStatus}
        branchBaseName={branchBaseName}
        hasNoTracking={hasNoTracking}
        onOpenReview={onOpenReview}
        prStatus={prStatus}
        hasWriteAccess={hasWriteAccess}
        isPushingToMain={isPushingToMain}
        allowPushToMain={allowPushToMain}
        onCreatePr={onCreatePr}
        onPushToMain={onPushToMain}
      />

      {syncStatus?.tracking && branchStatus !== 'merged' && (
        <button
          onClick={onSync}
          disabled={isSyncing}
          className={`px-4 py-1.5 text-xs rounded text-white disabled:opacity-50 ${
            hasRemoteChanges
              ? 'bg-accent hover:bg-accent/80'
              : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary'
          }`}
        >
          {isSyncing ? 'Syncing...' : 'Sync Changes'}
        </button>
      )}

      {hasNoTracking && (
        <button
          onClick={() => onPushNewBranch(currentBranch)}
          disabled={isSyncing}
          className="px-4 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
        >
          {isSyncing ? 'Pushing...' : 'Push Branch to Remote'}
        </button>
      )}
    </div>
  )
}

export function SCWorkingView({
  directory,
  gitStatus,
  syncStatus,
  branchStatus,
  branchBaseName,
  stagedFiles,
  unstagedFiles,
  commitMessage,
  setCommitMessage,
  isCommitting,
  commitError,
  commitErrorExpanded,
  setCommitErrorExpanded,
  setCommitError,
  isSyncing,
  onCommit,
  onSync,
  onPushNewBranch,
  onStage,
  onStageAll,
  onUnstage,
  onFileSelect,
  onOpenReview,
  prStatus,
  hasWriteAccess,
  isPushingToMain,
  allowPushToMain,
  onCreatePr,
  onPushToMain,
}: SCWorkingViewProps) {
  if (gitStatus.length === 0) {
    return (
      <SyncView
        syncStatus={syncStatus}
        branchStatus={branchStatus}
        branchBaseName={branchBaseName}
        isSyncing={isSyncing}
        onSync={onSync}
        onPushNewBranch={onPushNewBranch}
        onOpenReview={onOpenReview}
        prStatus={prStatus}
        hasWriteAccess={hasWriteAccess}
        isPushingToMain={isPushingToMain}
        allowPushToMain={allowPushToMain}
        onCreatePr={onCreatePr}
        onPushToMain={onPushToMain}
      />
    )
  }

  // Has changes: show commit view
  return (
    <>
      {/* Commit area */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommit()
            }}
            placeholder="Commit message"
            className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent min-w-0"
          />
          <button
            onClick={onCommit}
            disabled={isCommitting || gitStatus.length === 0 || !commitMessage.trim()}
            className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {isCommitting ? 'Committing...' : 'Commit'}
          </button>
          <button
            onClick={async () => {
              const action = await window.menu.popup([
                { id: 'stage-all', label: 'Stage All Changes' },
              ])
              if (action === 'stage-all') onStageAll()
            }}
            disabled={unstagedFiles.length === 0}
            className="px-1 py-1 text-xs rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            title="More actions"
          >
            &#x22EF;
          </button>
        </div>
        {commitError && (
          <div className="mt-1 flex items-start gap-1 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
            <div
              className="flex-1 text-xs text-red-400 cursor-pointer"
              onClick={() => setCommitErrorExpanded(!commitErrorExpanded)}
            >
              {commitErrorExpanded ? commitError : (commitError.length > 80 ? `${commitError.slice(0, 80)  }...` : commitError)}
            </div>
            <button
              onClick={() => setCommitError(null)}
              className="text-red-400 hover:text-red-300 text-xs shrink-0 px-1"
              title="Dismiss"
            >
              x
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto text-sm">
        {/* Staged Changes */}
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
              onClick={() => {
                if (onFileSelect) {
                  onFileSelect({ filePath: `${directory}/${file.path}`, openInDiffMode: true })
                }
              }}
            >
              <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                {file.path}
              </span>
              <StatusBadge status={file.status} />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onUnstage(file.path)
                }}
                className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary text-xs px-1"
                title="Unstage"
              >
                -
              </button>
            </div>
          ))
        )}

        {/* Changes */}
        <div
          className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary mt-1 cursor-default"
          onContextMenu={async (e) => {
            e.preventDefault()
            if (unstagedFiles.length === 0) return
            const action = await window.menu.popup([
              { id: 'stage-all', label: 'Stage All Changes' },
            ])
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
              onClick={() => {
                if (onFileSelect) {
                  onFileSelect({ filePath: `${directory}/${file.path}`, openInDiffMode: true })
                }
              }}
            >
              <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                {file.path}
              </span>
              <StatusBadge status={file.status} />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onStage(file.path)
                }}
                className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary text-xs px-1"
                title="Stage"
              >
                +
              </button>
            </div>
          ))
        )}
      </div>
    </>
  )
}
