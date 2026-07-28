/**
 * Sidebar toolbar: "+ New Session" button plus an optional PR-status refresh spinner button.
 * Pulled out of SessionList purely to keep that component under the line-count lint budget.
 */
export function SessionListHeader({
  onNewSession,
  onRefreshPrStatus,
  isRefreshing,
  onRefresh,
}: {
  onNewSession: () => void
  onRefreshPrStatus?: () => Promise<void>
  isRefreshing: boolean
  onRefresh: () => void
}) {
  return (
    <div className="p-3 border-b border-border flex items-center gap-2">
      <button
        onClick={onNewSession}
        className="flex-1 py-2 px-3 bg-accent hover:bg-accent/80 text-on-accent text-sm font-medium rounded transition-colors"
      >
        + New Session
      </button>
      {onRefreshPrStatus && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors disabled:opacity-50"
          title="Refresh PR status for all sessions"
        >
          <svg
            className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
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
      )}
    </div>
  )
}
