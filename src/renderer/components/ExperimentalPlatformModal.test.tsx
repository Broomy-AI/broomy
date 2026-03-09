// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../test/react-setup'
import ExperimentalPlatformModal from './ExperimentalPlatformModal'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe('ExperimentalPlatformModal', () => {
  it('renders nothing on macOS', async () => {
    vi.mocked(window.app.platform).mockResolvedValue('darwin')
    const { container } = render(<ExperimentalPlatformModal />)
    // Wait for the useEffect to resolve
    await waitFor(() => {
      expect(window.app.platform).toHaveBeenCalled()
    })
    expect(container.innerHTML).toBe('')
  })

  it('renders the modal on Windows', async () => {
    vi.mocked(window.app.platform).mockResolvedValue('win32')
    render(<ExperimentalPlatformModal />)
    await waitFor(() => {
      expect(screen.getByText('Windows Support')).toBeTruthy()
    })
    expect(screen.getByText(/Broomy on Windows is still experimental/)).toBeTruthy()
    expect(screen.getByText('Got it')).toBeTruthy()
    expect(screen.getByText('Report an issue')).toBeTruthy()
  })

  it('renders the modal on Linux', async () => {
    vi.mocked(window.app.platform).mockResolvedValue('linux')
    render(<ExperimentalPlatformModal />)
    await waitFor(() => {
      expect(screen.getByText('Linux Support')).toBeTruthy()
    })
    expect(screen.getByText(/Broomy on Linux is still experimental/)).toBeTruthy()
  })

  it('dismisses the modal and sets sessionStorage on Got it click', async () => {
    vi.mocked(window.app.platform).mockResolvedValue('win32')
    render(<ExperimentalPlatformModal />)
    await waitFor(() => {
      expect(screen.getByText('Got it')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Got it'))

    expect(sessionStorage.getItem('broomy:experimental-platform-dismissed')).toBe('1')
    // Modal should be gone
    expect(screen.queryByText('Windows Support')).toBeNull()
  })

  it('does not show modal when already dismissed in sessionStorage', async () => {
    sessionStorage.setItem('broomy:experimental-platform-dismissed', '1')
    vi.mocked(window.app.platform).mockResolvedValue('win32')
    const { container } = render(<ExperimentalPlatformModal />)
    // Give it time to potentially render
    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
  })

  it('opens GitHub issues on Report an issue click', async () => {
    vi.mocked(window.app.platform).mockResolvedValue('linux')
    vi.mocked(window.shell.openExternal).mockResolvedValue(undefined)
    render(<ExperimentalPlatformModal />)
    await waitFor(() => {
      expect(screen.getByText('Report an issue')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Report an issue'))

    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/Broomy-AI/broomy/issues')
  })
})
