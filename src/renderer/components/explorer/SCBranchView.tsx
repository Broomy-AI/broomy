import type { NavigationTarget } from '../../utils/fileNavigation'
import { StatusBadge } from './icons'
import { statusLabel, getStatusColor } from '../../utils/explorerHelpers'

interface SCBranchViewProps {
  directory: string
  branchChanges: { path: string; status: string }[]
  isBranchLoading: boolean
  branchBaseName: string
  branchMergeBase: string
  onFileSelect?: (target: NavigationTarget) => void
}

export function SCBranchView({
  directory,
  branchChanges,
  isBranchLoading,
  branchBaseName,
  branchMergeBase,
  onFileSelect,
}: SCBranchViewProps) {
  if (isBranchLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">Loading...</div>
    )
  }

  if (branchChanges.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
        No changes vs {branchBaseName}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto text-sm">
      <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
        Changes vs {branchBaseName} ({branchChanges.length})
      </div>
      {branchChanges.map((file) => (
        <div
          key={`branch-${file.path}`}
          className="flex items-center gap-2 px-3 py-1 hover:bg-bg-tertiary cursor-pointer"
          title={`${file.path} — ${statusLabel(file.status)}`}
          onClick={() => {
            if (onFileSelect) {
              onFileSelect({ filePath: `${directory}/${file.path}`, openInDiffMode: true, diffBaseRef: branchMergeBase || `origin/${branchBaseName}`, diffLabel: `Branch vs ${branchBaseName}` })
            }
          }}
        >
          <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
            {file.path}
          </span>
          <StatusBadge status={file.status} />
        </div>
      ))}
    </div>
  )
}
