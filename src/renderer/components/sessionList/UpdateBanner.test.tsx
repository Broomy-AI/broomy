// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import UpdateBanner from './UpdateBanner'
import { useUpdateState, _resetForTesting } from '../../hooks/useUpdateState'

vi.mock('../../hooks/useUpdateState', () => ({
  useUpdateState: vi.fn(),
  _resetForTesting: vi.fn(),
}))

describe('UpdateBanner', () => {
  const mockHandleDownload = vi.fn()
  const mockSetPopoverOpen = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when status is idle', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'idle' },
      currentVersion: '0.8.0',
      popoverOpen: false,
      handleDownload: mockHandleDownload,
      handleInstall: vi.fn(),
      setPopoverOpen: mockSetPopoverOpen,
    })

    const { container } = render(<UpdateBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('shows version and Update button when available', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'available', version: '1.0.0' },
      currentVersion: '0.8.0',
      popoverOpen: false,
      handleDownload: mockHandleDownload,
      handleInstall: vi.fn(),
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<UpdateBanner />)

    expect(screen.getByText('v1.0.0 available')).toBeTruthy()
    expect(screen.getByText('Update')).toBeTruthy()
    expect(screen.getByText('View')).toBeTruthy()
  })

  it('calls handleDownload when Update is clicked', async () => {
    mockHandleDownload.mockResolvedValue(undefined)
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'available', version: '1.0.0' },
      currentVersion: '0.8.0',
      popoverOpen: false,
      handleDownload: mockHandleDownload,
      handleInstall: vi.fn(),
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<UpdateBanner />)
    await fireEvent.click(screen.getByText('Update'))

    expect(mockHandleDownload).toHaveBeenCalled()
  })

  it('calls setPopoverOpen when View is clicked', async () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'available', version: '1.0.0' },
      currentVersion: '0.8.0',
      popoverOpen: false,
      handleDownload: mockHandleDownload,
      handleInstall: vi.fn(),
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<UpdateBanner />)
    await fireEvent.click(screen.getByText('View'))

    expect(mockSetPopoverOpen).toHaveBeenCalledWith(true)
  })

  it('shows download progress', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'downloading', percent: 42.7 },
      currentVersion: '0.8.0',
      popoverOpen: false,
      handleDownload: mockHandleDownload,
      handleInstall: vi.fn(),
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<UpdateBanner />)

    expect(screen.getByText('Downloading...')).toBeTruthy()
    expect(screen.getByText('43%')).toBeTruthy()
  })

  it('shows ready state with Restart button', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'ready' },
      currentVersion: '0.8.0',
      popoverOpen: false,
      handleDownload: mockHandleDownload,
      handleInstall: vi.fn(),
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<UpdateBanner />)

    expect(screen.getByText('Ready to install')).toBeTruthy()
    expect(screen.getByText('Restart')).toBeTruthy()
  })

  it('calls setPopoverOpen when Restart is clicked', async () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'ready' },
      currentVersion: '0.8.0',
      popoverOpen: false,
      handleDownload: mockHandleDownload,
      handleInstall: vi.fn(),
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<UpdateBanner />)
    await fireEvent.click(screen.getByText('Restart'))

    expect(mockSetPopoverOpen).toHaveBeenCalledWith(true)
  })
})
