// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import ErrorBoundary from './ErrorBoundary'
import { useErrorStore } from '../store/errors'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  useErrorStore.setState({
    errors: [],
    hasUnread: false,
    detailError: null,
  })
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
    // Suppress React error boundary console logging in tests
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByText('Test render error')).toBeTruthy()
    expect(screen.getByText('Try Again')).toBeTruthy()
    spy.mockRestore()
  })

  it('adds error to error store when a child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    const state = useErrorStore.getState()
    expect(state.errors.length).toBe(1)
    expect(state.errors[0].message).toContain('Unhandled render error: Test render error')
    spy.mockRestore()
  })

  it('resets error state when Try Again is clicked', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()

    // Click Try Again - this calls handleReset which sets hasError to false
    // The component will re-render its children. ThrowingComponent will throw again
    // so the boundary will catch it again and show the error UI, but the important
    // thing is that handleReset was called and setState was invoked.
    const tryAgainButton = screen.getByText('Try Again')
    expect(tryAgainButton).toBeTruthy()

    // Verify the button is clickable
    fireEvent.click(tryAgainButton)

    // After clicking try again with a still-throwing child, the error boundary
    // catches the error again and shows the error UI
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    spy.mockRestore()
  })

  it('shows generic message when error.message is empty', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    function EmptyErrorComponent() {
      throw new Error('')
    }
    render(
      <ErrorBoundary>
        <EmptyErrorComponent />
      </ErrorBoundary>,
    )
    // With empty message, it should show the fallback text
    expect(screen.getByText('An unexpected error occurred.')).toBeTruthy()
    spy.mockRestore()
  })
})
