// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import { allowConsoleError } from '../../test/console-guard'
import ErrorBoundary from './ErrorBoundary'

// Suppress jsdom printing thrown errors to stderr (not console.error — jsdom
// dispatches an 'error' event that writes to process.stderr directly).
const suppressJsdomErrors = () => {
  const handler = (e: Event) => e.preventDefault()
  window.addEventListener('error', handler)
  return () => window.removeEventListener('error', handler)
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  allowConsoleError()
  vi.clearAllMocks()
})

// A component that throws on render
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test render error')
  }
  return <div>Child content</div>
}

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Hello World')).toBeTruthy()
  })

  it('shows error UI when a child throws', () => {
    const cleanup = suppressJsdomErrors()
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByText('Test render error')).toBeTruthy()
    expect(screen.getByText('Try Again')).toBeTruthy()
    cleanup()
  })

  it('logs to console.error when a child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cleanup = suppressJsdomErrors()
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(spy).toHaveBeenCalledWith(
      '[ErrorBoundary] Unhandled render error:',
      expect.any(Error),
    )
    cleanup()
    spy.mockRestore()
  })

  it('resets error state when Try Again is clicked', () => {
    const cleanup = suppressJsdomErrors()

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()

    const tryAgainButton = screen.getByText('Try Again')
    expect(tryAgainButton).toBeTruthy()

    fireEvent.click(tryAgainButton)

    // After clicking try again with a still-throwing child, the error boundary
    // catches the error again and shows the error UI
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    cleanup()
  })

  it('shows generic message when error.message is empty', () => {
    const cleanup = suppressJsdomErrors()
    function EmptyErrorComponent(): React.ReactNode {
      throw new Error('')
    }
    render(
      <ErrorBoundary>
        <EmptyErrorComponent />
      </ErrorBoundary>,
    )
    expect(screen.getByText('An unexpected error occurred.')).toBeTruthy()
    cleanup()
  })
})
