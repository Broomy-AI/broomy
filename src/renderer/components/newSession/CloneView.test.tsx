// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'
import { useAgentStore } from '../../store/agents'
import { useRepoStore } from '../../store/repos'
import { CloneView } from './CloneView'

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
    const selectEl = screen.getByRole('combobox') as HTMLSelectElement
    const options = Array.from(selectEl.options).map(o => o.text)
    expect(options).toContain('Shell Only')
  })

  it('clones and calls onComplete on success', async () => {
    vi.mocked(window.git.clone).mockResolvedValue({ success: true })
    vi.mocked(window.git.defaultBranch).mockResolvedValue('main')
    vi.mocked(window.git.remoteUrl).mockResolvedValue('https://github.com/user/test.git')
    vi.mocked(window.gh.hasWriteAccess).mockResolvedValue(false)
    vi.mocked(window.config.load).mockResolvedValue({ repos: [{ id: 'repo-1', name: 'test' }] })

    const onComplete = vi.fn()
    render(<CloneView onBack={vi.fn()} onComplete={onComplete} />)

    const urlInput = screen.getByPlaceholderText(/https:\/\/github\.com/)
    fireEvent.change(urlInput, { target: { value: 'https://github.com/user/test.git' } })

    fireEvent.click(screen.getByText('Clone'))

    await waitFor(() => {
      expect(window.git.clone).toHaveBeenCalled()
      expect(onComplete).toHaveBeenCalled()
    })
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
})
