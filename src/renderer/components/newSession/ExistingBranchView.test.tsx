// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'
import { useAgentStore } from '../../store/agents'
import { ExistingBranchView } from './ExistingBranchView'
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
  // Mock git operations for fetchBranchList
  vi.mocked(window.git.pull).mockResolvedValue({ success: true })
  vi.mocked(window.git.worktreeList).mockResolvedValue([])
  vi.mocked(window.git.listBranches).mockResolvedValue([])
})

describe('ExistingBranchView', () => {
  it('renders header with repo name', () => {
    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )
    expect(screen.getByText('Existing Branches')).toBeTruthy()
    expect(screen.getByText('my-project')).toBeTruthy()
  })

  it('shows loading state initially', () => {
    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )
    expect(screen.getByText('Loading branches...')).toBeTruthy()
  })

  it('calls onBack when Cancel is clicked', () => {
    const onBack = vi.fn()
    render(
      <ExistingBranchView repo={mockRepo} onBack={onBack} onComplete={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows empty state when no branches found', async () => {
    vi.mocked(window.git.listBranches).mockResolvedValue([])
    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )
    await waitFor(() => {
      expect(screen.getByText(/No other branches found/)).toBeTruthy()
    })
  })

  it('shows branches after loading', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main' },
      { path: '/repos/my-project/feature-x', branch: 'feature-x' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'feature-x', isRemote: false },
      { name: 'fix-bug', isRemote: true },
      { name: 'origin/fix-bug', isRemote: true },
    ])

    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('feature-x')).toBeTruthy()
      expect(screen.getByText('fix-bug')).toBeTruthy()
    })
  })

  it('opens worktree-branch directly when clicking a branch with worktree', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main' },
      { path: '/repos/my-project/feature-x', branch: 'feature-x' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'feature-x', isRemote: false },
    ])

    const onComplete = vi.fn()
    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={onComplete} />
    )

    await waitFor(() => {
      expect(screen.getByText('feature-x')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('feature-x'))
    expect(onComplete).toHaveBeenCalledWith(
      '/repos/my-project/feature-x',
      'agent-1',
      { repoId: 'repo-1', name: 'my-project' }
    )
  })

  it('shows create worktree view for remote-only branch', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'origin/fix-bug', isRemote: true },
    ])

    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('fix-bug')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('fix-bug'))

    await waitFor(() => {
      const elements = screen.getAllByText('Create Worktree')
      expect(elements.length).toBe(2) // h2 heading + button
    })
  })

  it('shows error when branch fetch fails', async () => {
    vi.mocked(window.git.pull).mockRejectedValue(new Error('Network error'))
    vi.mocked(window.git.worktreeList).mockRejectedValue(new Error('Failed to list worktrees'))

    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText(/Failed to list worktrees/)).toBeTruthy()
    })
  })
})
