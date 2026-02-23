// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import PanelErrorBoundary from './PanelErrorBoundary'
import { useErrorStore } from '../store/errors'

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('test explosion')
  return <div>child content</div>
}

describe('PanelErrorBoundary', () => {
  beforeEach(() => {
    useErrorStore.getState().clearAll()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders children when no error', () => {
    render(
      <PanelErrorBoundary name="Test">
        <div>hello</div>
      </PanelErrorBoundary>,
    )
    expect(screen.getByText('hello')).toBeDefined()
  })

  it('catches render errors and shows error bar with message', () => {
    render(
      <PanelErrorBoundary name="Review">
        <ThrowingChild shouldThrow={true} />
      </PanelErrorBoundary>,
    )
    expect(screen.getByText(/Review crashed: test explosion/)).toBeDefined()
    expect(screen.getByText('Retry')).toBeDefined()
  })

  it('logs to error store on crash', () => {
    render(
      <PanelErrorBoundary name="Explorer">
        <ThrowingChild shouldThrow={true} />
      </PanelErrorBoundary>,
    )
    const errors = useErrorStore.getState().errors
    expect(errors.length).toBe(1)
    expect(errors[0].message).toBe('Explorer crashed: test explosion')
    expect(errors[0].scope).toEqual({ panel: 'Explorer' })
  })

  it('retry button resets error state so children re-render', () => {
    // First render with a throwing child, then re-render with a non-throwing child
    const { rerender } = render(
      <PanelErrorBoundary name="Test">
        <ThrowingChild shouldThrow={true} />
      </PanelErrorBoundary>,
    )

    // Should show error bar
    expect(screen.getByText(/Test crashed: test explosion/)).toBeDefined()

    // Swap children to a non-throwing version before clicking retry
    rerender(
      <PanelErrorBoundary name="Test">
        <ThrowingChild shouldThrow={false} />
      </PanelErrorBoundary>,
    )

    // Click retry
    fireEvent.click(screen.getByText('Retry'))

    // Should now show recovered content
    expect(screen.getByText('child content')).toBeDefined()
  })
})
