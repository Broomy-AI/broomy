import type { GitFileStatus, GitStatusResult, GitHubPrStatus } from '../../../preload/index'
import type { BranchStatus } from '../../store/sessions'
import type { NavigationTarget } from '../../utils/fileNavigation'
import { prStateBadgeClass } from '../../utils/explorerHelpers'

interface SCPrBannerProps {
  prStatus: GitHubPrStatus
  isPrLoading: boolean
  branchStatus?: BranchStatus
  branchBaseName: string
  gitStatus: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  isSyncingWithMain: boolean
  onSyncWithMain: () => void
  gitOpError: { operation: string; message: string } | null
  onDismissError: () => void
  onFileSelect?: (target: NavigationTarget) => void
}

export function SCPrBanner({
  prStatus,
  isPrLoading,
  branchStatus,
  branchBaseName,
  gitStatus,
  syncStatus,
  isSyncingWithMain,
  onSyncWithMain,
  gitOpError,
  onDismissError,
  onFileSelect,
}: SCPrBannerProps) {
  return (
    <>
      {/* PR Status banner */}
      <div className="px-3 py-2 border-b border-border bg-bg-secondary">
        {isPrLoading ? (
          <div className="text-xs text-text-secondary">Loading PR status...</div>
        ) : prStatus ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${prStateBadgeClass(prStatus.state)}`}>
                {prStatus.state}
              </span>
              <button
                onClick={() => window.shell.openExternal(prStatus.url)}
                className="text-xs text-accent hover:underline truncate flex-1 text-left"
              >
                #{prStatus.number}: {prStatus.title}
              </button>
            </div>
            {prStatus.state === 'OPEN' && gitStatus.length === 0 && syncStatus?.current !== branchBaseName && (
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={onSyncWithMain}
                  disabled={isSyncingWithMain}
                  className="px-2 py-1 text-xs rounded bg-bg-tertiary text-text-primary hover:bg-bg-secondary disabled:opacity-50"
                >
                  {isSyncingWithMain ? 'Syncing...' : `Sync with ${branchBaseName}`}
                </button>
              </div>
            )}
          </div>
        ) : branchStatus === 'merged' ? (
          <div className="flex items-center gap-2">
            <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-purple-500/20 text-purple-400">
              MERGED
            </span>
            <span className="text-xs text-text-secondary">
              Branch merged to {branchBaseName}
            </span>
          </div>
        ) : null}
      </div>

      {/* Git operation error banner */}
      {gitOpError && (
        <div className="px-3 py-2 border-b border-red-500/30 bg-red-500/10 flex items-center gap-2">
          <div
            className="flex-1 text-xs text-red-400 cursor-pointer hover:text-red-300 truncate"
            title="Click to view full error"
            onClick={async () => {
              const errorContent = `${gitOpError.operation} failed\n${'='.repeat(40)}\n\n${gitOpError.message}`
              const errorPath = '/tmp/broomy-git-error.txt'
              await window.fs.writeFile(errorPath, errorContent)
              onFileSelect?.({ filePath: errorPath, openInDiffMode: false })
            }}
          >
            {gitOpError.operation} failed: {gitOpError.message.length > 80
              ? `${gitOpError.message.slice(0, 80)  }...`
              : gitOpError.message}
          </div>
          <button
            onClick={onDismissError}
            className="text-red-400 hover:text-red-300 text-xs shrink-0 px-1"
            title="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
    </>
  )
}
