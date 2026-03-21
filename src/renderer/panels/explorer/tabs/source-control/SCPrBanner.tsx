/**
 * Banner component showing pull request status and merge conflict alerts.
 */
import type { GitHubPrStatus } from '../../../../../preload/index'
import type { BranchStatus } from '../../../../store/sessions'
import type { NavigationTarget } from '../../../../shared/utils/fileNavigation'
import { prStateBadgeClass } from '../../../../features/git/explorerHelpers'
import { DialogErrorBanner } from '../../../../shared/components/ErrorBanner'
import { useRepoStore } from '../../../../store/repos'
import { AuthSetupSection, isAuthError } from '../../../../shared/components/AuthSetupSection'
import { isGitConfigError } from '../../../../shared/components/GitIdentitySetup'

interface SCPrBannerProps {
  prStatus: GitHubPrStatus
  isPrLoading: boolean
  branchStatus?: BranchStatus
  branchBaseName: string
  gitOpError: { operation: string; message: string } | null
  onDismissError: () => void
  agentMergeMessage: string | null
  onDismissAgentMerge: () => void
  issueNumber?: number
  issueTitle?: string
  issueUrl?: string
  onRetryGitOp?: () => void
  onFileSelect?: (target: NavigationTarget) => void
  onRefresh?: () => void
  isRefreshing?: boolean
}

function RefreshButton({ onRefresh, isRefreshing }: { onRefresh: () => void; isRefreshing?: boolean }) {
  return (
    <button
      onClick={onRefresh}
      disabled={isRefreshing}
      className="p-0.5 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 shrink-0"
      title="Refresh PR status"
    >
      <svg
        className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
    </button>
  )
}

function PrStatusContent({
  prStatus, branchStatus, branchBaseName, issueNumber, issueTitle, issueUrl,
  onFileSelect, onRefresh, isRefreshing,
}: Pick<SCPrBannerProps,
  'prStatus' | 'branchStatus' | 'branchBaseName' |
  'issueNumber' | 'issueTitle' | 'issueUrl' |
  'onFileSelect' | 'onRefresh' | 'isRefreshing'
>) {
  const refresh = onRefresh ? <RefreshButton onRefresh={onRefresh} isRefreshing={isRefreshing} /> : null

  // Determine whether to show PR info (hide stale MERGED/CLOSED when branch has moved on)
  const showPr = prStatus?.number && prStatus.url && !(
    (prStatus.state === 'MERGED' || prStatus.state === 'CLOSED') &&
    (branchStatus === 'in-progress' || branchStatus === 'pushed')
  )

  if (showPr) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${prStateBadgeClass(prStatus.state)}`}>
            {prStatus.state}
          </span>
          <button
            onClick={() => onFileSelect
              ? onFileSelect({ filePath: prStatus.url, openInDiffMode: false })
              : window.shell.openExternal(prStatus.url)}
            className="text-xs text-accent hover:underline truncate flex-1 text-left"
          >
            #{prStatus.number}: {prStatus.title}
          </button>
          {refresh}
        </div>
      </div>
    )
  }

  if (branchStatus === 'merged') {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-purple-500/20 text-purple-400">MERGED</span>
          <span className="text-xs text-text-secondary">Branch merged to {branchBaseName}</span>
        </div>
        {refresh}
      </div>
    )
  }

  if (issueNumber && issueUrl) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-accent/20 text-accent">ISSUE</span>
        <button
          onClick={() => onFileSelect
            ? onFileSelect({ filePath: issueUrl, openInDiffMode: false })
            : window.shell.openExternal(issueUrl)}
          className="text-xs text-accent hover:underline truncate flex-1 text-left"
        >
          #{issueNumber}{issueTitle ? `: ${issueTitle}` : ''}
        </button>
        {refresh}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-secondary">No pull request</span>
      {refresh}
    </div>
  )
}

export function SCPrBanner({
  prStatus, isPrLoading, branchStatus, branchBaseName,
  gitOpError, onDismissError,
  agentMergeMessage, onDismissAgentMerge, issueNumber, issueTitle, issueUrl,
  onRetryGitOp, onFileSelect, onRefresh, isRefreshing,
}: SCPrBannerProps) {
  const { ghAvailable } = useRepoStore()
  return (
    <>
      {/* PR Status banner */}
      <div className="px-3 py-2 border-b border-border bg-bg-secondary">
        <PrStatusContent
          prStatus={prStatus} branchStatus={branchStatus}
          branchBaseName={branchBaseName}
          issueNumber={issueNumber} issueTitle={issueTitle} issueUrl={issueUrl}
          onFileSelect={onFileSelect} onRefresh={onRefresh} isRefreshing={isRefreshing || isPrLoading}
        />
      </div>

      {/* Agent merge info banner */}
      {agentMergeMessage && (
        <div className="px-3 py-2 border-b border-blue-500/30 bg-blue-500/10 flex items-center gap-2">
          <span className="flex-1 text-xs text-blue-400">
            {agentMergeMessage}
          </span>
          <button
            onClick={onDismissAgentMerge}
            className="text-blue-400 hover:text-blue-300 text-xs shrink-0 px-1"
            title="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {/* Git operation error banner */}
      {gitOpError && (
        <div className="px-3 py-2 border-b border-border">
          <DialogErrorBanner
            error={gitOpError.message}
            label={`${gitOpError.operation} failed`}
            onDismiss={onDismissError}
          />
        </div>
      )}

      {/* Auth / identity setup for git operation errors */}
      {gitOpError && (isAuthError(gitOpError.message) || isGitConfigError(gitOpError.message)) && onRetryGitOp && (
        <div className="px-3 py-2 border-b border-border">
          <AuthSetupSection error={gitOpError.message} ghAvailable={ghAvailable} onRetry={onRetryGitOp} retryLabel="Retry" />
        </div>
      )}
    </>
  )
}
