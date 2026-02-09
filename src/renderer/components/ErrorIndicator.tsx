import { useState } from 'react'
import { useErrorStore } from '../store/errors'
import { openReportIssue } from '../utils/errorReporting'
import type { ErrorCategory } from '../utils/errorMessages'

const CATEGORY_COLORS: Record<ErrorCategory, string> = {
  git: 'bg-orange-500/20 text-orange-400',
  network: 'bg-blue-500/20 text-blue-400',
  permissions: 'bg-yellow-500/20 text-yellow-400',
  config: 'bg-purple-500/20 text-purple-400',
  github: 'bg-green-500/20 text-green-400',
  disk: 'bg-red-500/20 text-red-400',
  unknown: 'bg-gray-500/20 text-gray-400',
}

export default function ErrorIndicator() {
  const { errors, hasUnread, dismissError, clearAll, markRead, generateReportUrl } = useErrorStore()
  const [isOpen, setIsOpen] = useState(false)

  const handleToggle = () => {
    if (!isOpen) {
      markRead()
    }
    setIsOpen(!isOpen)
  }

  if (errors.length === 0) {
    return null
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const handleReportAll = () => {
    const latestError = errors[0]
    if (latestError) {
      openReportIssue(latestError.detail || latestError.message, latestError.category)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className={`p-1.5 rounded transition-colors ${
          hasUnread
            ? 'bg-status-error text-white'
            : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
        }`}
        title={`${errors.length} error${errors.length !== 1 ? 's' : ''}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        {hasUnread && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-status-error rounded-full animate-pulse" />
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-bg-secondary border border-border rounded-lg shadow-xl z-50">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <span className="text-sm font-medium text-text-primary">
                Errors ({errors.length})
              </span>
              <button
                onClick={() => {
                  clearAll()
                  setIsOpen(false)
                }}
                className="text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                Clear all
              </button>
            </div>

            <div className="divide-y divide-border">
              {errors.map((error) => (
                <div
                  key={error.id}
                  className="p-3 hover:bg-bg-tertiary group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[error.category]}`}>
                          {error.category}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {formatTime(error.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-text-primary break-words">
                        {error.message}
                      </p>
                      {error.suggestion && (
                        <p className="text-xs text-text-secondary mt-0.5">
                          {error.suggestion}
                        </p>
                      )}
                      <button
                        onClick={() => {
                          const url = generateReportUrl(error.id)
                          if (url) window.shell.openExternal(url)
                        }}
                        className="text-xs text-text-secondary hover:text-text-primary mt-1 underline"
                      >
                        Report Issue
                      </button>
                    </div>
                    <button
                      onClick={() => dismissError(error.id)}
                      className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary transition-opacity p-1 -m-1"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6L6 18" />
                        <path d="M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-2 border-t border-border">
              <button
                onClick={handleReportAll}
                className="w-full text-xs text-center text-text-secondary hover:text-text-primary py-1 transition-colors"
              >
                Report Issue
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
