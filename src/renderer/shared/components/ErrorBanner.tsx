/**
 * Inline error banner for components that use local `useState<string | null>` for errors.
 *
 * Adapts the local string error state into an AppError shape, runs it through
 * humanizeError, and renders a styled banner. Clicking the message opens the
 * ErrorDetailModal for the full raw error text.
 */
import { useErrorStore } from '../../store/errors'
import { humanizeError } from '../utils/knownErrors'

interface DialogErrorBannerProps {
  error: string
  onDismiss: () => void
  /** Optional prefix label shown before the humanized message (e.g. "push failed") */
  label?: string
}

export function DialogErrorBanner({ error, onDismiss, label }: DialogErrorBannerProps) {
  const displayMessage = humanizeError(error)
  const { showErrorDetail } = useErrorStore()

  const labelledDisplay = label ? `${label}: ${displayMessage}` : displayMessage

  const handleClick = () => {
    showErrorDetail({
      id: 'dialog-error',
      message: error,
      displayMessage: labelledDisplay,
      detail: labelledDisplay !== error ? error : undefined,
      scope: 'app',
      dismissed: false,
      timestamp: Date.now(),
    })
  }

  return (
    <div className="px-3 py-2 border border-danger-base/30 bg-danger-base/10 rounded flex items-center gap-2">
      <button
        onClick={handleClick}
        className="flex-1 text-xs text-danger-fg cursor-pointer hover:text-danger-soft text-left truncate"
        title="Click to view full error"
      >
        {labelledDisplay}
      </button>
      <button
        onClick={onDismiss}
        className="text-danger-fg hover:text-danger-soft text-xs shrink-0 px-1"
        title="Dismiss"
      >
        &times;
      </button>
    </div>
  )
}
