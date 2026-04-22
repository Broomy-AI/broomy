// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../../test/react-setup'
import { useAgentStore } from '../../../store/agents'
import { ExistingBranchView } from './ExistingBranchView'
import type { ManagedRepo } from '../../../../preload/index'

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
      { path: '/repos/my-project/main', branch: 'main', head: 'abc123' },
      { path: '/repos/my-project/feature-x', branch: 'feature-x', head: 'def456' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'feature-x', isRemote: false, current: false },
      { name: 'fix-bug', isRemote: true, current: false },
      { name: 'origin/fix-bug', isRemote: true, current: false },
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
      { path: '/repos/my-project/main', branch: 'main', head: 'abc123' },
      { path: '/repos/my-project/feature-x', branch: 'feature-x', head: 'def456' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'feature-x', isRemote: false, current: false },
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
      { path: '/repos/my-project/main', branch: 'main', head: 'abc123' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'origin/fix-bug', isRemote: true, current: false },
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

  it('creates worktree when Create Worktree is clicked', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main', head: 'abc123' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'origin/fix-bug', isRemote: true, current: false },
    ])
    vi.mocked(window.git.worktreeAdd).mockResolvedValue({ success: true })
    vi.mocked(window.repos.getInitScript).mockResolvedValue('')

    const onComplete = vi.fn()
    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={onComplete} />
    )

    await waitFor(() => {
      expect(screen.getByText('fix-bug')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('fix-bug'))

    await waitFor(() => {
      const elements = screen.getAllByText('Create Worktree')
      expect(elements.length).toBe(2)
    })

    fireEvent.click(screen.getByRole('button', { name: /Create Worktree/ }))

    await waitFor(() => {
      expect(window.git.worktreeAdd).toHaveBeenCalled()
      expect(onComplete).toHaveBeenCalledWith(
        '/repos/my-project/fix-bug',
        'agent-1',
        { repoId: 'repo-1', name: 'my-project' }
      )
    })
  })

  it('shows error when worktree creation fails', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main', head: 'abc123' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'origin/fix-bug', isRemote: true, current: false },
    ])
    vi.mocked(window.git.worktreeAdd).mockResolvedValue({ success: false, error: 'Branch exists' })

    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('fix-bug')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('fix-bug'))

    await waitFor(() => {
      expect(screen.getAllByText('Create Worktree').length).toBe(2)
    })

    fireEvent.click(screen.getByRole('button', { name: /Create Worktree/ }))

    await waitFor(() => {
      expect(screen.getByText(/Branch exists/)).toBeTruthy()
    })
  })

  it('filters branches by search query', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main', head: 'abc123' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'feature-auth', isRemote: false, current: false },
      { name: 'fix-bug', isRemote: false, current: false },
    ])

    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('feature-auth')).toBeTruthy()
      expect(screen.getByText('fix-bug')).toBeTruthy()
    })

    const searchInput = screen.getByPlaceholderText('Search branches...')
    fireEvent.change(searchInput, { target: { value: 'feature' } })

    expect(screen.getByText('feature-auth')).toBeTruthy()
    expect(screen.queryByText('fix-bug')).toBeNull()
  })

  it('shows no matches message when search has no results', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main', head: 'abc123' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'feature-auth', isRemote: false, current: false },
    ])

    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('feature-auth')).toBeTruthy()
    })

    const searchInput = screen.getByPlaceholderText('Search branches...')
    fireEvent.change(searchInput, { target: { value: 'zzz' } })

    expect(screen.getByText(/No branches matching "zzz"/)).toBeTruthy()
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

  it('skips the default branch and sorts worktrees first', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main', head: 'abc' },
      { path: '/repos/my-project/feature-a', branch: 'feature-a', head: 'def' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'main', isRemote: false, current: true },
      { name: 'fix-z', isRemote: false, current: false },
      { name: 'feature-a', isRemote: false, current: false },
    ])

    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('feature-a')).toBeTruthy()
      expect(screen.getByText('fix-z')).toBeTruthy()
    })
    // default branch 'main' should not appear as a selectable branch
    const buttons = screen.getAllByRole('button')
    const branchTexts = buttons.map(b => b.textContent)
    expect(branchTexts.some(t => t === 'main')).toBe(false)

    // feature-a (has worktree) should appear before fix-z (no worktree)
    const allText = document.body.textContent || ''
    expect(allText.indexOf('feature-a')).toBeLessThan(allText.indexOf('fix-z'))
  })

  it('runs init script when creating worktree', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main', head: 'abc123' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'origin/fix-init', isRemote: true, current: false },
    ])
    vi.mocked(window.git.worktreeAdd).mockResolvedValue({ success: true })
    vi.mocked(window.repos.getInitScript).mockResolvedValue('pnpm install')
    vi.mocked(window.shell.exec).mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 })

    const onComplete = vi.fn()
    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={onComplete} />
    )

    await waitFor(() => {
      expect(screen.getByText('fix-init')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('fix-init'))
    await waitFor(() => {
      expect(screen.getAllByText('Create Worktree').length).toBe(2)
    })
    fireEvent.click(screen.getByRole('button', { name: /Create Worktree/ }))

    await waitFor(() => {
      expect(window.shell.exec).toHaveBeenCalledWith('pnpm install', '/repos/my-project/fix-init')
      expect(onComplete).toHaveBeenCalled()
    })
  })

  it('calls onStartExistingBranch instead of creating worktree when provided', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main', head: 'abc123' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'origin/fix-delegate', isRemote: true, current: false },
    ])

    const onStartExistingBranch = vi.fn()
    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} onStartExistingBranch={onStartExistingBranch} />
    )

    await waitFor(() => {
      expect(screen.getByText('fix-delegate')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('fix-delegate'))
    await waitFor(() => {
      expect(screen.getAllByText('Create Worktree').length).toBe(2)
    })
    fireEvent.click(screen.getByRole('button', { name: /Create Worktree/ }))

    expect(onStartExistingBranch).toHaveBeenCalledWith({
      repo: mockRepo,
      branchName: 'fix-delegate',
      agentId: 'agent-1',
    })
    // Should NOT call worktreeAdd
    expect(window.git.worktreeAdd).not.toHaveBeenCalled()
  })

  it('navigates back from worktree view and changes agent', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main', head: 'abc123' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'origin/fix-nav', isRemote: true, current: false },
    ])

    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('fix-nav')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('fix-nav'))

    await waitFor(() => {
      expect(screen.getAllByText('Create Worktree').length).toBe(2)
    })

    // Change agent to Shell Only
    const agentSelect = screen.getByRole('combobox')
    fireEvent.change(agentSelect, { target: { value: '' } })

    // Click Cancel to go back to branch list
    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.getByText('Existing Branches')).toBeTruthy()
    })
  })

  it('clears search query when clear button is clicked', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main', head: 'abc123' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'feature-auth', isRemote: false, current: false },
      { name: 'fix-bug', isRemote: false, current: false },
    ])

    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('feature-auth')).toBeTruthy()
    })

    const searchInput = screen.getByPlaceholderText('Search branches...')
    fireEvent.change(searchInput, { target: { value: 'feature' } })
    expect(screen.queryByText('fix-bug')).toBeNull()

    // Click the × clear button
    fireEvent.click(screen.getByText('×'))

    // Both branches should be visible again
    expect(screen.getByText('feature-auth')).toBeTruthy()
    expect(screen.getByText('fix-bug')).toBeTruthy()
  })

  it('dismisses error in worktree creation view', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main', head: 'abc123' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'origin/fix-err', isRemote: true, current: false },
    ])
    vi.mocked(window.git.worktreeAdd).mockResolvedValue({ success: false, error: 'Some error' })

    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('fix-err')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('fix-err'))

    await waitFor(() => {
      expect(screen.getAllByText('Create Worktree').length).toBe(2)
    })
    fireEvent.click(screen.getByRole('button', { name: /Create Worktree/ }))

    await waitFor(() => {
      expect(screen.getByText(/Some error/)).toBeTruthy()
    })

    // Dismiss the error via the × button (title="Dismiss")
    fireEvent.click(screen.getByTitle('Dismiss'))

    await waitFor(() => {
      expect(screen.queryByText(/Some error/)).toBeNull()
    })
  })

  it('dismisses error in main branch list view', async () => {
    vi.mocked(window.git.pull).mockRejectedValue(new Error('Net fail'))
    vi.mocked(window.git.worktreeList).mockRejectedValue(new Error('List failed'))

    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText(/List failed/)).toBeTruthy()
    })

    fireEvent.click(screen.getByTitle('Dismiss'))

    await waitFor(() => {
      expect(screen.queryByText(/List failed/)).toBeNull()
    })
  })

  it('uses back arrow button in worktree view to return to branch list', async () => {
    vi.mocked(window.git.worktreeList).mockResolvedValue([
      { path: '/repos/my-project/main', branch: 'main', head: 'abc123' },
    ])
    vi.mocked(window.git.listBranches).mockResolvedValue([
      { name: 'origin/fix-arrow', isRemote: true, current: false },
    ])

    render(
      <ExistingBranchView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('fix-arrow')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('fix-arrow'))

    await waitFor(() => {
      expect(screen.getAllByText('Create Worktree').length).toBe(2)
    })

    // Click the back arrow (first button with svg)
    const backButtons = screen.getAllByRole('button')
    // The first button is the back arrow
    fireEvent.click(backButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Existing Branches')).toBeTruthy()
    })
  })
})
