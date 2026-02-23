/**
 * Granular error boundary for panels and sub-components.
 *
 * Catches render errors and shows a compact error bar at the top of the
 * affected region instead of crashing the entire app. A "Retry" button
 * resets the error state so children re-render. Errors are logged to the
 * error store for visibility in the error history.
 */
import { Component, type ReactNode } from 'react'
import { useErrorStore } from '../store/errors'

interface Props {
  name: string
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    useErrorStore.getState().addScopedError({
      message: `${this.props.name} crashed: ${error.message}`,
      scope: { panel: this.props.name },
      detail: error.stack,
    })
  }

  private handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col h-full">
          <div className="flex-shrink-0 px-3 py-2 bg-red-600/20 border-b border-red-600/40 flex items-center justify-between gap-2">
            <span className="text-xs text-red-300 truncate">
              {this.props.name} crashed: {this.state.error.message}
            </span>
            <button
              onClick={this.handleRetry}
              className="flex-shrink-0 px-2 py-0.5 text-xs rounded bg-red-600/30 text-red-300 hover:bg-red-600/40 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
