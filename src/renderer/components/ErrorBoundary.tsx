import React from 'react'
import { openReportIssue } from '../utils/errorReporting'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReport = () => {
    const message = this.state.error?.message || 'Unknown error'
    openReportIssue(message)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-bg-primary flex items-center justify-center">
          <div className="text-center max-w-md mx-4">
            <div className="text-red-400 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-text-primary mb-2">Something went wrong</h2>
            <p className="text-sm text-text-secondary mb-1">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <p className="text-xs text-text-secondary mb-6">
              You can try again, reload the app, or report this issue.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 text-sm rounded bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 text-sm rounded bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
              >
                Reload App
              </button>
              <button
                onClick={this.handleReport}
                className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 transition-colors"
              >
                Report Issue
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
