/**
 * React error boundary that catches unhandled render errors.
 *
 * Wraps the entire app, logging errors to console and showing
 * a recovery UI with a "Try Again" button that resets the error state.
 */
import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] Unhandled render error:', error)
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-bg-primary flex items-center justify-center">
          <div className="text-center max-w-sm mx-4">
            <h2 className="text-lg font-medium text-text-primary mb-2">Something went wrong</h2>
            <p className="text-sm text-text-secondary mb-4">
              {this.state.errorMessage || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
