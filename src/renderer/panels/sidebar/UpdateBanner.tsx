/**
 * Banner showing app update availability, download progress, and install readiness.
 */
import { useUpdateState } from '../../shared/hooks/useUpdateState'

export default function UpdateBanner() {
  const { updateState, handleDownload, setPopoverOpen } = useUpdateState()
  const { status } = updateState

  if (status === 'idle') return null

  if (status === 'available') {
    return (
      <div className="mx-2 mt-2 px-2.5 py-1.5 rounded bg-accent/10 border border-accent/20 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent flex-shrink-0">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span className="text-xs text-text-primary flex-1 truncate">
          v{updateState.version} available
        </span>
        <button
          onClick={() => setPopoverOpen(true)}
          className="text-3xs font-medium text-accent hover:text-accent/80 transition-colors flex-shrink-0"
        >
          View
        </button>
        <button
          onClick={() => void handleDownload()}
          className="text-3xs font-medium px-1.5 py-0.5 rounded bg-accent text-white hover:bg-accent/80 transition-colors flex-shrink-0"
        >
          Update
        </button>
      </div>
    )
  }

  if (status === 'downloading') {
    return (
      <div className="mx-2 mt-2 px-2.5 py-1.5 rounded bg-accent/10 border border-accent/20">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-text-secondary">Downloading...</span>
          <span className="text-3xs text-text-tertiary ml-auto">{Math.round(updateState.percent)}%</span>
        </div>
        <div className="w-full h-1 bg-bg-tertiary rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${Math.round(updateState.percent)}%` }} />
        </div>
      </div>
    )
  }

  // status === 'ready'
  return (
    <div className="mx-2 mt-2 px-2.5 py-1.5 rounded bg-success-base/10 border border-success-base/20 flex items-center gap-2">
      <span className="text-xs text-text-primary flex-1">Ready to install</span>
      <button
        onClick={() => setPopoverOpen(true)}
        className="text-3xs font-medium px-1.5 py-0.5 rounded bg-success-solid text-white hover:bg-success-solid/80 transition-colors flex-shrink-0"
      >
        Restart
      </button>
    </div>
  )
}
