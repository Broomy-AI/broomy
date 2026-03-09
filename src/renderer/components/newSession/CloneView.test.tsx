// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'
import { useAgentStore } from '../../store/agents'
import { useRepoStore } from '../../store/repos'
import { CloneView } from './CloneView'

// Mock AuthTerminal to avoid xterm.js in jsdom
vi.mock('../AuthTerminal', () => ({
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
  useAgentStore.setState({
    agents: [
      { id: 'agent-1', name: 'Claude', command: 'claude', color: '#4a9eff' },
    ],
  })
  useRepoStore.setState({
    repos: [],
    defaultCloneDir: '~/repos',
    addRepo: vi.fn(),
  })
})

describe('CloneView', () => {
  it('renders header and form', () => {
    render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('Clone Repository')).toBeTruthy()
    expect(screen.getByPlaceholderText(/https:\/\/github\.com/)).toBeTruthy()
    expect(screen.getByText('Agent')).toBeTruthy()
  })

  it('Clone button is disabled when URL is empty', () => {
    render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)
    const cloneBtn = screen.getByText('Clone')
    expect(cloneBtn.hasAttribute('disabled')).toBe(true)
  })

  it('derives repo name from URL', () => {
    render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)
    const urlInput = screen.getByPlaceholderText(/https:\/\/github\.com/)
    fireEvent.change(urlInput, { target: { value: 'https://github.com/user/my-repo.git' } })
    expect(screen.getByText(/my-repo\/main/)).toBeTruthy()
  })

  it('calls onBack when Cancel is clicked', () => {
    const onBack = vi.fn()
    render(<CloneView onBack={onBack} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onBack).toHaveBeenCalled()
  })

  it('calls onBack when back arrow is clicked', () => {
    const onBack = vi.fn()
    const { container } = render(<CloneView onBack={onBack} onComplete={vi.fn()} />)
    const backButton = container.querySelector('.px-4.py-3 button')
    fireEvent.click(backButton!)
    expect(onBack).toHaveBeenCalled()
  })

  it('opens folder dialog when Browse is clicked', async () => {
    vi.mocked(window.dialog.openFolder).mockResolvedValue(null)
    render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Browse'))
    await waitFor(() => {
      expect(window.dialog.openFolder).toHaveBeenCalled()
    })
  })

  it('shows Init Script section when toggled', () => {
    render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Init Script'))
    expect(screen.getByPlaceholderText(/Runs in each new worktree/)).toBeTruthy()
  })

  it('lists agents in select dropdown', () => {
    render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('Claude')).toBeTruthy()
    // Shell Only is always an option
    const selectEl = screen.getByRole('combobox')
    const options = Array.from((selectEl as HTMLSelectElement).options).map((o: HTMLOptionElement) => o.text)
    expect(options).toContain('Shell Only')
  })

  it('clones and calls onComplete on success', async () => {
    vi.mocked(window.git.clone).mockResolvedValue({ success: true })
    vi.mocked(window.git.defaultBranch).mockResolvedValue('main')
    vi.mocked(window.git.remoteUrl).mockResolvedValue('https://github.com/user/test.git')
    vi.mocked(window.gh.hasWriteAccess).mockResolvedValue(false)
    vi.mocked(window.config.load).mockResolvedValue({ agents: [], sessions: [], repos: [{ id: 'repo-1', name: 'test', remoteUrl: 'https://github.com/user/test.git', rootDir: '~/repos/test', defaultBranch: 'main' }] })

    const onComplete = vi.fn()
    render(<CloneView onBack={vi.fn()} onComplete={onComplete} />)

    const urlInput = screen.getByPlaceholderText(/https:\/\/github\.com/)
    fireEvent.change(urlInput, { target: { value: 'https://github.com/user/test.git' } })

    fireEvent.click(screen.getByText('Clone'))

    await waitFor(() => {
      expect(window.git.clone).toHaveBeenCalled()
      // No write access — shows warning with "Continue anyway" button
      expect(screen.getByText('No write access')).toBeTruthy()
    })

    // Click "Continue anyway" to proceed
    fireEvent.click(screen.getByText('Continue anyway (read-only)'))
    expect(onComplete).toHaveBeenCalled()
  })

  it('updates location when Browse returns a folder', async () => {
    vi.mocked(window.dialog.openFolder).mockResolvedValue('/new/location')
    render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Browse'))
    await waitFor(() => {
      const inputs = document.querySelectorAll('input')
      // Second input is the location input
      const locationInput = Array.from(inputs).find(i => (i).value === '/new/location')
      expect(locationInput).toBeTruthy()
    })
  })

  it('allows typing in location input', () => {
    render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)
    // Location input - find by current value which is the default clone dir
    const inputs = document.querySelectorAll('input')
    // Location is the second input
    fireEvent.change(inputs[1], { target: { value: '/custom/path' } })
    expect((inputs[1]).value).toBe('/custom/path')
  })

  it('allows typing in init script textarea', () => {
    render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Init Script'))
    const textarea = screen.getByPlaceholderText(/Runs in each new worktree/)
    fireEvent.change(textarea, { target: { value: 'npm install' } })
    expect((textarea as HTMLTextAreaElement).value).toBe('npm install')
  })

  it('shows error when clone fails', async () => {
    vi.mocked(window.git.clone).mockResolvedValue({ success: false, error: 'Auth failed' })

    render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)

    const urlInput = screen.getByPlaceholderText(/https:\/\/github\.com/)
    fireEvent.change(urlInput, { target: { value: 'https://github.com/user/test.git' } })
    fireEvent.click(screen.getByText('Clone'))

    await waitFor(() => {
      expect(screen.getByText(/Auth failed/)).toBeTruthy()
    })
  })

  it('renders isolation settings', () => {
    render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('Run agent in isolated container')).toBeTruthy()
    expect(screen.getByText('Auto-approve agent commands')).toBeTruthy()
  })

  it('passes isolation fields to addRepo', async () => {
    vi.mocked(window.git.clone).mockResolvedValue({ success: true })
    vi.mocked(window.git.defaultBranch).mockResolvedValue('main')
    vi.mocked(window.git.remoteUrl).mockResolvedValue('https://github.com/user/test.git')
    vi.mocked(window.gh.hasWriteAccess).mockResolvedValue(false)
    vi.mocked(window.config.load).mockResolvedValue({ agents: [], sessions: [], repos: [{ id: 'repo-1', name: 'test', remoteUrl: 'https://github.com/user/test.git', rootDir: '~/repos/test', defaultBranch: 'main' }] })
    const addRepo = vi.fn()
    useRepoStore.setState({ addRepo })

    render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)

    // Enable isolation
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // isolated
    fireEvent.click(checkboxes[1]) // skipApproval

    const urlInput = screen.getByPlaceholderText(/https:\/\/github\.com/)
    fireEvent.change(urlInput, { target: { value: 'https://github.com/user/test.git' } })
    fireEvent.click(screen.getByText('Clone'))

    await waitFor(() => {
      expect(addRepo).toHaveBeenCalledWith(expect.objectContaining({
        isolated: true,
        skipApproval: true,
      }))
    })
  })

  describe('auth error flow', () => {
    it('shows "Set up Git Authentication" button on auth error when gh is available', async () => {
      vi.mocked(window.git.clone).mockResolvedValue({ success: false, error: 'fatal: could not read Username for \'https://github.com\'' })
      useRepoStore.setState({ ghAvailable: true })

      render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)

      const urlInput = screen.getByPlaceholderText(/https:\/\/github\.com/)
      fireEvent.change(urlInput, { target: { value: 'https://github.com/user/test.git' } })
      fireEvent.click(screen.getByText('Clone'))

      await waitFor(() => {
        expect(screen.getByText('Set up Git Authentication')).toBeTruthy()
      })
    })

    it('shows "Install GitHub CLI" button on auth error when gh is not available', async () => {
      vi.mocked(window.git.clone).mockResolvedValue({ success: false, error: 'fatal: Authentication failed for \'https://github.com/user/test\'' })
      useRepoStore.setState({ ghAvailable: false })

      render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)

      const urlInput = screen.getByPlaceholderText(/https:\/\/github\.com/)
      fireEvent.change(urlInput, { target: { value: 'https://github.com/user/test.git' } })
      fireEvent.click(screen.getByText('Clone'))

      await waitFor(() => {
        expect(screen.getByText('Install GitHub CLI')).toBeTruthy()
      })
    })

    it('opens cli.github.com when gh not installed and auth button clicked', async () => {
      vi.mocked(window.git.clone).mockResolvedValue({ success: false, error: 'Permission denied (publickey)' })
      useRepoStore.setState({ ghAvailable: false })

      render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)

      const urlInput = screen.getByPlaceholderText(/https:\/\/github\.com/)
      fireEvent.change(urlInput, { target: { value: 'https://github.com/user/test.git' } })
      fireEvent.click(screen.getByText('Clone'))

      await waitFor(() => {
        expect(screen.getByText('Install GitHub CLI')).toBeTruthy()
      })

      fireEvent.click(screen.getByText('Install GitHub CLI'))
      await waitFor(() => {
        expect(window.shell.openExternal).toHaveBeenCalledWith('https://cli.github.com')
      })
    })

    it('does not show auth button for non-auth errors', async () => {
      vi.mocked(window.git.clone).mockResolvedValue({ success: false, error: 'fatal: repository not found' })

      render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)

      const urlInput = screen.getByPlaceholderText(/https:\/\/github\.com/)
      fireEvent.change(urlInput, { target: { value: 'https://github.com/user/test.git' } })
      fireEvent.click(screen.getByText('Clone'))

      await waitFor(() => {
        expect(screen.getByText(/Clone failed/)).toBeTruthy()
      })

      expect(screen.queryByText('Set up Git Authentication')).toBeNull()
      expect(screen.queryByText('Install GitHub CLI')).toBeNull()
    })

    it('creates PTY and shows auth terminal when gh available and auth button clicked', async () => {
      vi.mocked(window.git.clone).mockResolvedValue({ success: false, error: 'fatal: could not read Username' })
      vi.mocked(window.app.homedir).mockResolvedValue('/home/user')
      vi.mocked(window.pty.create).mockResolvedValue({ id: 'auth-setup-123' })
      useRepoStore.setState({ ghAvailable: true })

      render(<CloneView onBack={vi.fn()} onComplete={vi.fn()} />)

      const urlInput = screen.getByPlaceholderText(/https:\/\/github\.com/)
      fireEvent.change(urlInput, { target: { value: 'https://github.com/user/test.git' } })
      fireEvent.click(screen.getByText('Clone'))

      await waitFor(() => {
        expect(screen.getByText('Set up Git Authentication')).toBeTruthy()
      })

      fireEvent.click(screen.getByText('Set up Git Authentication'))

      await waitFor(() => {
        expect(window.pty.create).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/home/user' }))
        expect(window.pty.write).toHaveBeenCalledWith(expect.stringContaining('auth-setup-'), 'gh auth login\r')
      })
    })
  })
})
