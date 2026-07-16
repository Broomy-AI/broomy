// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'
import { AuthSetupSection, isAuthError, AUTH_ERROR_MARKERS } from './AuthSetupSection'

// Mock AuthTerminal to avoid xterm.js in jsdom
vi.mock('./AuthTerminal', () => ({
  AuthTerminal: ({ ptyId, onDone }: { ptyId: string; onDone: () => void }) => (
    <div data-testid="auth-terminal" data-pty-id={ptyId}>
      <button onClick={onDone}>Done</button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isAuthError', () => {
  it('detects all auth error markers', () => {
    for (const marker of AUTH_ERROR_MARKERS) {
      expect(isAuthError(`some error: ${marker} occurred`)).toBe(true)
    }
  })

  it('returns false for non-auth errors', () => {
    expect(isAuthError('fatal: repository not found')).toBe(false)
    expect(isAuthError('CONFLICT: merge conflict in file.txt')).toBe(false)
    expect(isAuthError('ENOTFOUND github.com')).toBe(false)
  })
})

describe('AuthSetupSection', () => {
  it('shows nothing when there is no error', () => {
    const { container } = render(
      <AuthSetupSection error={null} ghAvailable={true} onRetry={vi.fn()} />
    )
    expect(container.textContent).toBe('')
  })

  it('shows nothing for non-auth errors', () => {
    const { container } = render(
      <AuthSetupSection error="fatal: repository not found" ghAvailable={true} onRetry={vi.fn()} />
    )
    expect(container.textContent).toBe('')
  })

  it('shows "Set up Git Authentication" button for auth errors when gh is available', () => {
    render(
      <AuthSetupSection error="could not read Username" ghAvailable={true} onRetry={vi.fn()} />
    )
    expect(screen.getByText('Set up Git Authentication')).toBeTruthy()
  })

  it('shows "Install GitHub CLI" button when gh is not available', () => {
    render(
      <AuthSetupSection error="Authentication failed" ghAvailable={false} onRetry={vi.fn()} />
    )
    expect(screen.getByText('Install GitHub CLI')).toBeTruthy()
    expect(screen.getByText('Install GitHub CLI, then try again')).toBeTruthy()
  })

  it('opens cli.github.com when gh not installed and button clicked', async () => {
    render(
      <AuthSetupSection error="Permission denied" ghAvailable={false} onRetry={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Install GitHub CLI'))
    await waitFor(() => {
      expect(window.shell.openExternal).toHaveBeenCalledWith('https://cli.github.com')
    })
  })

  it('creates PTY when gh available and button clicked', async () => {
    vi.mocked(window.app.homedir).mockResolvedValue('/home/user')
    vi.mocked(window.pty.create).mockResolvedValue({ id: 'auth-setup-123', shellKind: 'posix' })

    render(
      <AuthSetupSection error="could not read Username" ghAvailable={true} onRetry={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Set up Git Authentication'))

    await waitFor(() => {
      expect(window.pty.create).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/home/user' }))
      expect(window.pty.write).toHaveBeenCalledWith(expect.stringContaining('auth-setup-'), 'gh auth login\r')
    })
  })

  it('shows retry button with custom label after auth completes', async () => {
    vi.useFakeTimers()
    vi.mocked(window.app.homedir).mockResolvedValue('/home/user')
    vi.mocked(window.pty.create).mockResolvedValue({ id: 'auth-setup-123', shellKind: 'posix' })

    const onRetry = vi.fn()
    render(
      <AuthSetupSection error="could not read Username" ghAvailable={true} onRetry={onRetry} retryLabel="Retry Clone" />
    )

    fireEvent.click(screen.getByText('Set up Git Authentication'))
    await vi.waitFor(() => {
      expect(screen.getByTestId('auth-terminal')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Done'))

    // handleAuthDone writes gh auth setup-git then waits 1500ms
    await vi.advanceTimersByTimeAsync(2000)

    expect(screen.getByText('Authentication setup complete.')).toBeTruthy()
    expect(screen.getByText('Retry Clone')).toBeTruthy()

    // Verify gh auth setup-git was run
    expect(window.pty.write).toHaveBeenCalledWith(expect.stringContaining('auth-setup-'), 'gh auth setup-git\r')

    fireEvent.click(screen.getByText('Retry Clone'))
    expect(onRetry).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('uses default "Retry" label when retryLabel not provided', async () => {
    vi.useFakeTimers()
    vi.mocked(window.app.homedir).mockResolvedValue('/home/user')
    vi.mocked(window.pty.create).mockResolvedValue({ id: 'auth-setup-123', shellKind: 'posix' })

    render(
      <AuthSetupSection error="could not read Username" ghAvailable={true} onRetry={vi.fn()} />
    )

    fireEvent.click(screen.getByText('Set up Git Authentication'))
    await vi.waitFor(() => {
      expect(screen.getByTestId('auth-terminal')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Done'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(screen.getByText('Retry')).toBeTruthy()
    vi.useRealTimers()
  })

  it('shows identity setup form for identity errors', () => {
    render(
      <AuthSetupSection error="Please tell me who you are" ghAvailable={true} onRetry={vi.fn()} />
    )
    expect(screen.getByPlaceholderText('Your Name')).toBeTruthy()
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy()
  })

  it('shows merge mode setup for merge mode errors', () => {
    render(
      <AuthSetupSection error="Need to specify how to reconcile divergent branches" ghAvailable={true} onRetry={vi.fn()} />
    )
    expect(screen.getByText('Set Default Merge Mode')).toBeTruthy()
  })
})
