// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import VersionIndicator from './VersionIndicator'
import { useUpdateState } from '../hooks/useUpdateState'

vi.mock('../hooks/useUpdateState', () => ({
  useUpdateState: vi.fn(),
}))

describe('VersionIndicator', () => {
  const mockHandleDownload = vi.fn().mockResolvedValue(undefined)
  const mockHandleInstall = vi.fn()
  const mockSetPopoverOpen = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when no version', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'idle' },
      currentVersion: '',
      popoverOpen: false,
      handleDownload: mockHandleDownload,
      handleInstall: mockHandleInstall,
      setPopoverOpen: mockSetPopoverOpen,
    })

    const { container } = render(<VersionIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when status is idle', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'idle' },
      currentVersion: '0.8.0',
      popoverOpen: false,
      handleDownload: mockHandleDownload,
      handleInstall: mockHandleInstall,
      setPopoverOpen: mockSetPopoverOpen,
    })

    const { container } = render(<VersionIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('renders Update button when update available', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'available', version: '1.0.0' },
      currentVersion: '0.8.0',
      popoverOpen: false,
      handleDownload: mockHandleDownload,
      handleInstall: mockHandleInstall,
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<VersionIndicator />)
    expect(screen.getByText('Update')).toBeTruthy()
  })

  it('toggles popover on button click', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'available', version: '1.0.0' },
      currentVersion: '0.8.0',
      popoverOpen: false,
      handleDownload: mockHandleDownload,
      handleInstall: mockHandleInstall,
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<VersionIndicator />)
    fireEvent.click(screen.getByText('Update'))
    expect(mockSetPopoverOpen).toHaveBeenCalledWith(true)
  })

  it('shows popover with version info when open and available', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'available', version: '1.0.0' },
      currentVersion: '0.8.0',
      popoverOpen: true,
      handleDownload: mockHandleDownload,
      handleInstall: mockHandleInstall,
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<VersionIndicator />)
    expect(screen.getByText('v0.8.0')).toBeTruthy()
    expect(screen.getByText('v1.0.0')).toBeTruthy()
    expect(screen.getByText('Download Update')).toBeTruthy()
    expect(screen.getByText('View changelog')).toBeTruthy()
  })

  it('calls handleDownload when Download Update clicked', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'available', version: '1.0.0' },
      currentVersion: '0.8.0',
      popoverOpen: true,
      handleDownload: mockHandleDownload,
      handleInstall: mockHandleInstall,
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<VersionIndicator />)
    fireEvent.click(screen.getByText('Download Update'))
    expect(mockHandleDownload).toHaveBeenCalled()
  })

  it('shows downloading progress in popover', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'downloading', percent: 65.3 },
      currentVersion: '0.8.0',
      popoverOpen: true,
      handleDownload: mockHandleDownload,
      handleInstall: mockHandleInstall,
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<VersionIndicator />)
    expect(screen.getByText('Downloading update...')).toBeTruthy()
    expect(screen.getByText('65%')).toBeTruthy()
  })

  it('shows ready state with restart button in popover', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'ready' },
      currentVersion: '0.8.0',
      popoverOpen: true,
      handleDownload: mockHandleDownload,
      handleInstall: mockHandleInstall,
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<VersionIndicator />)
    expect(screen.getByText('Update downloaded. Restart to apply.')).toBeTruthy()
    expect(screen.getByText('Restart to Update')).toBeTruthy()
  })

  it('closes popover when backdrop is clicked', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'available', version: '1.0.0' },
      currentVersion: '0.8.0',
      popoverOpen: true,
      handleDownload: mockHandleDownload,
      handleInstall: mockHandleInstall,
      setPopoverOpen: mockSetPopoverOpen,
    })

    const { container } = render(<VersionIndicator />)
    // The backdrop is a fixed inset-0 div
    const backdrop = container.querySelector('.fixed.inset-0')
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop!)
    expect(mockSetPopoverOpen).toHaveBeenCalledWith(false)
  })

  it('opens changelog URL when View changelog clicked', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'available', version: '1.0.0' },
      currentVersion: '0.8.0',
      popoverOpen: true,
      handleDownload: mockHandleDownload,
      handleInstall: mockHandleInstall,
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<VersionIndicator />)
    fireEvent.click(screen.getByText('View changelog'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/Broomy-AI/broomy/releases/tag/v1.0.0')
  })

  it('calls handleInstall when Restart clicked', () => {
    vi.mocked(useUpdateState).mockReturnValue({
      updateState: { status: 'ready' },
      currentVersion: '0.8.0',
      popoverOpen: true,
      handleDownload: mockHandleDownload,
      handleInstall: mockHandleInstall,
      setPopoverOpen: mockSetPopoverOpen,
    })

    render(<VersionIndicator />)
    fireEvent.click(screen.getByText('Restart to Update'))
    expect(mockHandleInstall).toHaveBeenCalled()
  })
})
