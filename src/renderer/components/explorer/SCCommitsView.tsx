import type { GitCommitInfo } from '../../../preload/index'
import type { NavigationTarget } from '../../utils/fileNavigation'
import { StatusBadge } from './icons'
import { statusLabel, getStatusColor } from '../../utils/explorerHelpers'

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

  return (
    <div className="flex-1 overflow-y-auto text-sm">
      <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
        Commits ({branchCommits.length})
      </div>
      {branchCommits.map((commit) => {
        const isExpanded = expandedCommits.has(commit.hash)
        const files = commitFilesByHash[commit.hash]
        const isLoadingFiles = loadingCommitFiles.has(commit.hash)
        return (
          <div key={commit.hash}>
            <div
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-tertiary cursor-pointer"
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
      })}
    </div>
  )
}
