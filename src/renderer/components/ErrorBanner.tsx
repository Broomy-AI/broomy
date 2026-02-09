import { openReportIssue } from '../utils/errorReporting'
import type { ErrorCategory } from '../utils/errorMessages'

interface ErrorBannerProps {
  message: string
  detail?: string
  suggestion?: string
  category?: ErrorCategory
  onDismiss?: () => void
}

export default function ErrorBanner({ message, detail, suggestion, category, onDismiss }: ErrorBannerProps) {
  return (
    <div className="px-3 py-2 border-b border-red-500/30 bg-red-500/10 flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div
          className="text-xs text-red-400 truncate"
          title={detail || message}
        >
          {message}
        </div>
        {suggestion && (
          <div className="text-xs text-red-400/70 mt-0.5 truncate">{suggestion}</div>
        )}
        <button
          onClick={() => openReportIssue(detail || message, category)}
          className="text-xs text-red-400/50 hover:text-red-400 mt-0.5 underline"
        >
          Report Issue
        </button>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-red-400/60 hover:text-red-400 shrink-0 mt-0.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
