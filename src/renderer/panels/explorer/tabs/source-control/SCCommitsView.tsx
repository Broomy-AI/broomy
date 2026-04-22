/**
 * Source control view listing branch commits with expandable per-commit file diffs.
 */
import type { GitCommitInfo } from '../../../../../preload/index'
import type { NavigationTarget } from '../../../../shared/utils/fileNavigation'
import { StatusBadge } from '../../icons'
import { statusLabel, getStatusColor } from '../../../../features/git/explorerHelpers'

interface SCCommitsViewProps {
  directory: string
  branchCommits: GitCommitInfo[]
  isCommitsLoading: boolean
  branchBaseName: string
  expandedCommits: Set<string>
  commitFilesByHash: Record<string, { path: string; status: string }[] | undefined>
  loadingCommitFiles: Set<string>
  onToggleCommit: (commitHash: string) => void
  onFileSelect?: (target: NavigationTarget) => void
}

function CommitRow({
  commit,
  directory,
  isExpanded,
  files,
  isLoadingFiles,
  muted,
  onToggleCommit,
  onFileSelect,
}: {
  key?: string | number | bigint | null
  commit: GitCommitInfo
  directory: string
  isExpanded: boolean
  files: { path: string; status: string }[] | undefined
  isLoadingFiles: boolean
  muted: boolean
  onToggleCommit: (hash: string) => void
  onFileSelect?: (target: NavigationTarget) => void
}) {
  return (
    <div key={commit.hash}>
      <div
        className={`flex items-center gap-2 px-3 py-1.5 hover:bg-bg-tertiary cursor-pointer ${muted ? 'opacity-60' : ''}`}
        onClick={() => onToggleCommit(commit.hash)}
        title={`${commit.shortHash} — ${commit.message}\nby ${commit.author} on ${new Date(commit.date).toLocaleDateString()}`}
      >
        <span className="text-text-secondary w-3 text-center text-xs">
          {isExpanded ? '\u25BC' : '\u25B6'}
        </span>
        <span className="text-xs font-mono text-accent shrink-0">{commit.shortHash}</span>
        <span className="text-xs text-text-primary truncate flex-1">{commit.message}</span>
      </div>
      {isExpanded && (
        <div className="bg-bg-secondary/30">
          {isLoadingFiles ? (
            <div className="px-3 py-1 pl-8 text-xs text-text-secondary">Loading files...</div>
          ) : files && files.length > 0 ? (
            files.map((file) => (
              <div
                key={`${commit.hash}-${file.path}`}
                className="flex items-center gap-2 px-3 py-1 pl-8 hover:bg-bg-tertiary cursor-pointer"
                title={`${file.path} — ${statusLabel(file.status)}`}
                onClick={() => {
                  if (onFileSelect) {
                    onFileSelect({
                      filePath: `${directory}/${file.path}`,
                      openInDiffMode: true,
                      diffBaseRef: `${commit.hash}~1`,
                      diffCurrentRef: commit.hash,
                      diffLabel: `${commit.shortHash}: ${commit.message}`,
                    })
                  }
                }}
              >
                <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                  {file.path}
                </span>
                <StatusBadge status={file.status} />
              </div>
            ))
          ) : (
            <div className="px-3 py-1 pl-8 text-xs text-text-secondary">No files changed</div>
          )}
        </div>
      )}
    </div>
  )
}

export function SCCommitsView({
  directory,
  branchCommits,
  isCommitsLoading,
  branchBaseName,
  expandedCommits,
  commitFilesByHash,
  loadingCommitFiles,
  onToggleCommit,
  onFileSelect,
}: SCCommitsViewProps) {
  if (isCommitsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">Loading...</div>
    )
  }

  if (branchCommits.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
        No commits ahead of {branchBaseName}
      </div>
    )
  }

  const localCommits = branchCommits.filter((c) => c.pushed === false)
  const pushedCommits = branchCommits.filter((c) => c.pushed === true)
  // If pushed field is not set (older backend), treat all as a single ungrouped list
  const hasGroups = localCommits.length + pushedCommits.length === branchCommits.length

  const renderCommit = (commit: GitCommitInfo, muted: boolean) => (
    <CommitRow
      key={commit.hash}
      commit={commit}
      directory={directory}
      isExpanded={expandedCommits.has(commit.hash)}
      files={commitFilesByHash[commit.hash]}
      isLoadingFiles={loadingCommitFiles.has(commit.hash)}
      muted={muted}
      onToggleCommit={onToggleCommit}
      onFileSelect={onFileSelect}
    />
  )

  if (!hasGroups) {
    // Fallback: no grouping (pushed field not present)
    return (
      <div className="flex-1 overflow-y-auto text-sm">
        <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
          Commits ({branchCommits.length})
        </div>
        {branchCommits.map((commit) => renderCommit(commit, false))}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto text-sm">
      {localCommits.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
            Local ({localCommits.length})
          </div>
          {localCommits.map((commit) => renderCommit(commit, false))}
        </>
      )}
      {pushedCommits.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
            Pushed ({pushedCommits.length})
          </div>
          {pushedCommits.map((commit) => renderCommit(commit, true))}
        </>
      )}
    </div>
  )
}
