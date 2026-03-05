// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import { DialogErrorBanner } from './ErrorBanner'
import { useErrorStore } from '../store/errors'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  useErrorStore.setState({ detailError: null })
})

describe('DialogErrorBanner', () => {
  it('renders the humanized error message', () => {
    render(<DialogErrorBanner error="not a git repository" onDismiss={vi.fn()} />)
    expect(screen.getByText('This directory is not a git repository.')).toBeTruthy()
  })

  it('renders the raw message when no known error matches', () => {
    render(<DialogErrorBanner error="some random error" onDismiss={vi.fn()} />)
    expect(screen.getByText('some random error')).toBeTruthy()
  })

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<DialogErrorBanner error="test error" onDismiss={onDismiss} />)
    fireEvent.click(screen.getByTitle('Dismiss'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('calls showErrorDetail when clicking the message', () => {
    render(<DialogErrorBanner error="ENOTFOUND host" onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByTitle('Click to view full error'))
    const state = useErrorStore.getState()
    expect(state.detailError).toBeTruthy()
    expect(state.detailError!.displayMessage).toBe('Network error. Check your internet connection.')
    expect(state.detailError!.detail).toBe('ENOTFOUND host')
  })

  it('does not set detail when display message matches raw error', () => {
    render(<DialogErrorBanner error="some raw error" onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByTitle('Click to view full error'))
    const state = useErrorStore.getState()
    expect(state.detailError!.detail).toBeUndefined()
  })
})
