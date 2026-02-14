// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import ErrorDetailModal from './ErrorDetailModal'
import { useErrorStore, type AppError } from '../store/errors'

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

const mockError: AppError = {
  id: 'err-1',
  message: 'raw error from git push',
  displayMessage: 'Push rejected by remote. Pull first, or force-push if appropriate.',
  detail: 'fatal: [rejected] refs/heads/main -> refs/heads/main (non-fast-forward)',
  scope: 'app',
  dismissed: false,
  timestamp: 1700000000000,
}

describe('ErrorDetailModal', () => {
  it('renders nothing when detailError is null', () => {
    const { container } = render(<ErrorDetailModal />)
    expect(container.innerHTML).toBe('')
  })

  it('renders modal with error details when detailError is set', () => {
    useErrorStore.setState({ detailError: mockError })
    render(<ErrorDetailModal />)
    expect(screen.getByText('Error Details')).toBeTruthy()
    expect(screen.getByText(mockError.displayMessage)).toBeTruthy()
  })

  it('shows the raw detail in a pre block', () => {
    useErrorStore.setState({ detailError: mockError })
    render(<ErrorDetailModal />)
    expect(screen.getByText(mockError.detail!)).toBeTruthy()
  })

  it('does not show detail section when detail is undefined', () => {
    const errorNoDetail: AppError = { ...mockError, detail: undefined }
    useErrorStore.setState({ detailError: errorNoDetail })
    const { container } = render(<ErrorDetailModal />)
    expect(container.querySelector('pre')).toBeNull()
  })

  it('shows the formatted timestamp', () => {
    useErrorStore.setState({ detailError: mockError })
    render(<ErrorDetailModal />)
    // The timestamp 1700000000000 formats to a time string
    const date = new Date(1700000000000)
    const expected = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    expect(screen.getByText(expected)).toBeTruthy()
  })

  it('closes modal when Close button is clicked', () => {
    useErrorStore.setState({ detailError: mockError })
    render(<ErrorDetailModal />)
    fireEvent.click(screen.getByText('Close'))
    expect(useErrorStore.getState().detailError).toBeNull()
  })

  it('closes modal when clicking the backdrop overlay', () => {
    useErrorStore.setState({ detailError: mockError })
    const { container } = render(<ErrorDetailModal />)
    // The outer div is the backdrop
    const backdrop = container.firstChild as HTMLElement
    fireEvent.click(backdrop)
    expect(useErrorStore.getState().detailError).toBeNull()
  })

  it('does not close when clicking inside the modal card', () => {
    useErrorStore.setState({ detailError: mockError })
    render(<ErrorDetailModal />)
    fireEvent.click(screen.getByText('Error Details'))
    // Should still be open
    expect(useErrorStore.getState().detailError).toEqual(mockError)
  })
})
