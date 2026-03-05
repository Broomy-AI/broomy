// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import PanelErrorBoundary from './PanelErrorBoundary'

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('test explosion')
  return <div>child content</div>
}

describe('PanelErrorBoundary', () => {
  beforeEach(() => {
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

  it('logs to console.error on crash', () => {
    render(
      <PanelErrorBoundary name="Explorer">
        <ThrowingChild shouldThrow={true} />
      </PanelErrorBoundary>,
    )
    expect(console.error).toHaveBeenCalledWith(
      '[PanelErrorBoundary] Explorer crashed:',
      expect.any(Error),
    )
  })

  it('retry button resets error state so children re-render', () => {
    const { rerender } = render(
      <PanelErrorBoundary name="Test">
        <ThrowingChild shouldThrow={true} />
      </PanelErrorBoundary>,
    )

    expect(screen.getByText(/Test crashed: test explosion/)).toBeDefined()

    rerender(
      <PanelErrorBoundary name="Test">
        <ThrowingChild shouldThrow={false} />
      </PanelErrorBoundary>,
    )

    fireEvent.click(screen.getByText('Retry'))
    expect(screen.getByText('child content')).toBeDefined()
  })
})
