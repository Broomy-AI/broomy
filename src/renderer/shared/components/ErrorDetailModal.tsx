/**
 * Modal shown when clicking an error banner to view full error details.
 *
 * Displays the human-friendly message prominently, with the raw error detail
 * in a scrollable monospace box (if different from the display message).
 * Follows existing modal patterns (fixed overlay, z-50, centered card).
 */
import { useErrorStore } from '../../store/errors'

export default function ErrorDetailModal() {
  const { detailError, hideErrorDetail } = useErrorStore()

  if (!detailError) return null

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50" onClick={hideErrorDetail}>
      <div
        role="dialog"
        className="bg-bg-secondary border border-border rounded-lg shadow-xl p-4 max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium text-danger-fg mb-2">Error Details</h3>
        <p className="text-sm text-text-primary mb-3">{detailError.displayMessage}</p>

        {detailError.detail && (
          <div className="bg-bg-primary border border-border rounded p-3 mb-3 max-h-48 overflow-y-auto">
            <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap break-words">{detailError.detail}</pre>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">{formatTime(detailError.timestamp)}</span>
          <button
            onClick={hideErrorDetail}
            className="px-3 py-1.5 text-xs rounded bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
