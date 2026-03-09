// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'
import { useAgentStore } from '../../store/agents'
import { useRepoStore } from '../../store/repos'
import { RepoSettingsView } from './RepoSettingsView'
import type { ManagedRepo } from '../../../preload/index'

const mockRepo: ManagedRepo = {
  id: 'repo-1',
  name: 'my-project',
  remoteUrl: 'https://github.com/user/my-project.git',
  rootDir: '/repos/my-project',
  defaultBranch: 'main',
}

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
    repos: [mockRepo],
    updateRepo: vi.fn(),
    removeRepo: vi.fn(),
  })
  vi.mocked(window.repos.getInitScript).mockResolvedValue('')
})

describe('RepoSettingsView', () => {
  it('renders header with repo name', () => {
    render(<RepoSettingsView repo={mockRepo} onBack={vi.fn()} />)
    expect(screen.getByText('Repository Settings')).toBeTruthy()
    expect(screen.getByText('my-project')).toBeTruthy()
  })

  it('shows loading state initially then loads', async () => {
    render(<RepoSettingsView repo={mockRepo} onBack={vi.fn()} />)
    // Will be loading briefly
    await waitFor(() => {
      expect(screen.getByText('Repository Path')).toBeTruthy()
    })
  })

  it('shows repository path', async () => {
    render(<RepoSettingsView repo={mockRepo} onBack={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('/repos/my-project')).toBeTruthy()
    })
  })

  it('calls onBack when Cancel is clicked', () => {
    const onBack = vi.fn()
    render(<RepoSettingsView repo={mockRepo} onBack={onBack} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onBack).toHaveBeenCalled()
  })

  it('saves settings when Save is clicked', async () => {
    vi.mocked(window.repos.saveInitScript).mockResolvedValue({ success: true })
    const updateRepo = vi.fn()
    useRepoStore.setState({ updateRepo })

    render(<RepoSettingsView repo={mockRepo} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(updateRepo).toHaveBeenCalledWith('repo-1', expect.any(Object))
      expect(window.repos.saveInitScript).toHaveBeenCalled()
    })
  })

  it('navigates back after saving', async () => {
    vi.mocked(window.repos.saveInitScript).mockResolvedValue({ success: true })
    const onBack = vi.fn()
    render(<RepoSettingsView repo={mockRepo} onBack={onBack} />)

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(onBack).toHaveBeenCalled()
    })
  })

  it('shows Remove repository button', async () => {
    render(<RepoSettingsView repo={mockRepo} onBack={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Remove repository from Broomy')).toBeTruthy()
    })
  })

  it('removes repo when confirmed', async () => {
    vi.mocked(window.menu.popup).mockResolvedValue('delete')
    const removeRepo = vi.fn()
    const onBack = vi.fn()
    useRepoStore.setState({ removeRepo })

    render(<RepoSettingsView repo={mockRepo} onBack={onBack} />)

    await waitFor(() => {
      expect(screen.getByText('Remove repository from Broomy')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Remove repository from Broomy'))

    await waitFor(() => {
      expect(removeRepo).toHaveBeenCalledWith('repo-1')
      expect(onBack).toHaveBeenCalled()
    })
  })

  it('does not remove repo when popup is cancelled', async () => {
    vi.mocked(window.menu.popup).mockResolvedValue(null)
    const removeRepo = vi.fn()
    useRepoStore.setState({ removeRepo })

    render(<RepoSettingsView repo={mockRepo} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Remove repository from Broomy')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Remove repository from Broomy'))

    await waitFor(() => {
      expect(window.menu.popup).toHaveBeenCalled()
    })
    expect(removeRepo).not.toHaveBeenCalled()
  })

  it('handles getInitScript error gracefully', async () => {
    vi.mocked(window.repos.getInitScript).mockRejectedValue(new Error('not found'))
    render(<RepoSettingsView repo={mockRepo} onBack={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Init Script')).toBeTruthy()
    })
    // Should render without error
  })

  it('allows typing in init script textarea', async () => {
    render(<RepoSettingsView repo={mockRepo} onBack={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Init Script')).toBeTruthy()
    })
    const textareas = document.querySelectorAll('textarea')
    // First textarea is init script
    fireEvent.change(textareas[0], { target: { value: 'npm install' } })
    expect((textareas[0]).value).toBe('npm install')
  })

  it('allows typing in review instructions textarea', async () => {
    render(<RepoSettingsView repo={mockRepo} onBack={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Review Instructions')).toBeTruthy()
    })
    const textareas = document.querySelectorAll('textarea')
    // Second textarea is review instructions
    fireEvent.change(textareas[1], { target: { value: 'Check for bugs' } })
    expect((textareas[1]).value).toBe('Check for bugs')
  })

  it('shows init script textarea', async () => {
    render(<RepoSettingsView repo={mockRepo} onBack={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Init Script')).toBeTruthy()
    })
  })

  it('renders isolation settings', async () => {
    render(<RepoSettingsView repo={mockRepo} onBack={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Run agent in isolated container')).toBeTruthy()
      expect(screen.getByText('Auto-approve agent commands')).toBeTruthy()
    })
  })

  it('saves isolation fields when Save is clicked', async () => {
    vi.mocked(window.repos.saveInitScript).mockResolvedValue({ success: true })
    const updateRepo = vi.fn()
    useRepoStore.setState({ updateRepo })

    render(<RepoSettingsView repo={{ ...mockRepo, isolated: true, skipApproval: true }} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(updateRepo).toHaveBeenCalledWith('repo-1', expect.objectContaining({
        isolated: true,
        skipApproval: true,
      }))
    })
  })

  it('shows review instructions textarea', async () => {
    render(<RepoSettingsView repo={mockRepo} onBack={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Review Instructions')).toBeTruthy()
    })
  })
})
