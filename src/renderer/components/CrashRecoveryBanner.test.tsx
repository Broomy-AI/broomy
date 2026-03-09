// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../test/react-setup'
import CrashRecoveryBanner from './CrashRecoveryBanner'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CrashRecoveryBanner', () => {
  it('renders nothing when there is no crash log', async () => {
    vi.mocked(window.app.getCrashLog).mockResolvedValue(null)
    const { container } = render(<CrashRecoveryBanner />)
    // Wait for the useEffect to resolve
    await waitFor(() => {
      expect(window.app.getCrashLog).toHaveBeenCalled()
    })
    expect(container.innerHTML).toBe('')
  })

  it('renders the banner when a crash log exists', async () => {
    vi.mocked(window.app.getCrashLog).mockResolvedValue('crash data')
    render(<CrashRecoveryBanner />)
    await waitFor(() => {
      expect(screen.getByText('Broomy crashed unexpectedly during your last session.')).toBeTruthy()
    })
    expect(screen.getByText('Report Issue')).toBeTruthy()
    expect(screen.getByText('Dismiss')).toBeTruthy()
  })

  it('opens the crash report URL and dismisses on Report Issue click', async () => {
    vi.mocked(window.app.getCrashLog).mockResolvedValue('crash data')
    vi.mocked(window.app.getCrashReportUrl).mockResolvedValue('https://github.com/issues/new')
    vi.mocked(window.app.dismissCrashLog).mockResolvedValue(undefined)
    vi.mocked(window.shell.openExternal).mockResolvedValue(undefined)

    render(<CrashRecoveryBanner />)
    await waitFor(() => {
      expect(screen.getByText('Report Issue')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Report Issue'))

    await waitFor(() => {
      expect(window.app.getCrashReportUrl).toHaveBeenCalled()
      expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/issues/new')
      expect(window.app.dismissCrashLog).toHaveBeenCalled()
    })
  })

  it('dismisses without reporting on Dismiss click', async () => {
    vi.mocked(window.app.getCrashLog).mockResolvedValue('crash data')
    vi.mocked(window.app.dismissCrashLog).mockResolvedValue(undefined)

    render(<CrashRecoveryBanner />)
    await waitFor(() => {
      expect(screen.getByText('Dismiss')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Dismiss'))

    await waitFor(() => {
      expect(window.app.dismissCrashLog).toHaveBeenCalled()
      expect(window.shell.openExternal).not.toHaveBeenCalled()
    })
  })

  it('does not call openExternal when crash report URL is null', async () => {
    vi.mocked(window.app.getCrashLog).mockResolvedValue('crash data')
    vi.mocked(window.app.getCrashReportUrl).mockResolvedValue(null)
    vi.mocked(window.app.dismissCrashLog).mockResolvedValue(undefined)

    render(<CrashRecoveryBanner />)
    await waitFor(() => {
      expect(screen.getByText('Report Issue')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Report Issue'))

    await waitFor(() => {
      expect(window.app.getCrashReportUrl).toHaveBeenCalled()
      expect(window.shell.openExternal).not.toHaveBeenCalled()
      expect(window.app.dismissCrashLog).toHaveBeenCalled()
    })
  })
})
