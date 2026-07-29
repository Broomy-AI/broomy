// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../../test/react-setup'
import { useAgentStore } from '../../../store/agents'
import { useRepoStore } from '../../../store/repos'
import { ReviewPrsView } from './ReviewPrsView'
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
})

describe('ReviewPrsView', () => {
  it('renders header with repo name', () => {
    vi.mocked(window.gh.prsToReview).mockReturnValue(new Promise(() => {}))
    render(
      <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )
    expect(screen.getByText('PRs to Review')).toBeTruthy()
    expect(screen.getByText(/my-project/)).toBeTruthy()
  })

  it('shows loading state initially', () => {
    vi.mocked(window.gh.prsToReview).mockReturnValue(new Promise(() => {}))
    render(
      <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )
    expect(screen.getByText('Loading PRs...')).toBeTruthy()
  })

  it('calls onBack when Cancel is clicked', () => {
    vi.mocked(window.gh.prsToReview).mockReturnValue(new Promise(() => {}))
    const onBack = vi.fn()
    render(
      <ReviewPrsView repo={mockRepo} onBack={onBack} onComplete={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows empty state when no PRs', async () => {
    vi.mocked(window.gh.prsToReview).mockResolvedValue([])
    render(
      <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )
    await waitFor(() => {
      expect(screen.getByText(/No PRs pending your review/)).toBeTruthy()
    })
  })

  it('shows PRs after loading', async () => {
    vi.mocked(window.gh.prsToReview).mockResolvedValue([
      { number: 101, title: 'Add tests', author: 'alice', headRefName: 'add-tests', baseRefName: 'main', url: '', labels: [] },
      { number: 102, title: 'Fix CI', author: 'bob', headRefName: 'fix-ci', baseRefName: 'main', url: '', labels: ['bug'] },
    ])
    render(
      <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )
    await waitFor(() => {
      expect(screen.getByText('#101')).toBeTruthy()
      expect(screen.getByText('Add tests')).toBeTruthy()
      expect(screen.getByText('by alice')).toBeTruthy()
      expect(screen.getByText('#102')).toBeTruthy()
      expect(screen.getByText('Fix CI')).toBeTruthy()
    })
  })

  it('shows PR detail when a PR is selected', async () => {
    vi.mocked(window.gh.prsToReview).mockResolvedValue([
      { number: 101, title: 'Add tests', author: 'alice', headRefName: 'add-tests', baseRefName: 'main', url: 'https://github.com/pr/101', labels: ['feature'] },
    ])
    render(
      <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )
    await waitFor(() => {
      expect(screen.getByText('Add tests')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Add tests'))

    await waitFor(() => {
      expect(screen.getByText('Review PR')).toBeTruthy()
      expect(screen.getByText('PR #101 by alice')).toBeTruthy()
      expect(screen.getByText('Start Review')).toBeTruthy()
      expect(screen.getByText('feature')).toBeTruthy()
    })
  })

  it('shows error when fetching PRs fails', async () => {
    vi.mocked(window.gh.prsToReview).mockRejectedValue(new Error('Auth failed'))
    render(
      <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )
    await waitFor(() => {
      expect(screen.getByText(/Auth failed/)).toBeTruthy()
    })
  })

  it('shows error when Start Review fails', async () => {
    vi.mocked(window.gh.prsToReview).mockResolvedValue([
      { number: 101, title: 'Add tests', author: 'alice', headRefName: 'add-tests', baseRefName: 'main', url: '', labels: [] },
    ])
    vi.mocked(window.git.worktreeList).mockResolvedValue([])
    vi.mocked(window.git.fetchBranch).mockResolvedValue({ success: false })
    vi.mocked(window.git.fetchReviewPrHead).mockResolvedValue({ success: false, error: 'Permission denied' })

    render(
      <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )
    await waitFor(() => {
      expect(screen.getByText('Add tests')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Add tests'))
    await waitFor(() => {
      expect(screen.getByText('Start Review')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Start Review'))
    await waitFor(() => {
      expect(screen.getByText(/Permission denied/)).toBeTruthy()
    })
  })

  it('uses back arrow to go back from PR detail', async () => {
    vi.mocked(window.gh.prsToReview).mockResolvedValue([
      { number: 101, title: 'Add tests', author: 'alice', headRefName: 'add-tests', baseRefName: 'main', url: '', labels: [] },
    ])
    render(
      <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )
    await waitFor(() => {
      expect(screen.getByText('Add tests')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Add tests'))
    await waitFor(() => {
      expect(screen.getByText('Review PR')).toBeTruthy()
    })
    // Click the back arrow (first button in the header)
    const header = screen.getByText('Review PR').closest('.border-b')!
    const backArrow = header.querySelector('button')!
    fireEvent.click(backArrow)
    await waitFor(() => {
      expect(screen.getByText('PRs to Review')).toBeTruthy()
    })
  })

  it('can go back from PR detail to PR list', async () => {
    vi.mocked(window.gh.prsToReview).mockResolvedValue([
      { number: 101, title: 'Add tests', author: 'alice', headRefName: 'add-tests', baseRefName: 'main', url: '', labels: [] },
    ])
    render(
      <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )
    await waitFor(() => {
      expect(screen.getByText('Add tests')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Add tests'))
    await waitFor(() => {
      expect(screen.getByText('Review PR')).toBeTruthy()
    })
    // Click Cancel to go back
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => {
      expect(screen.getByText('PRs to Review')).toBeTruthy()
    })
  })

  describe('createReviewWorktree', () => {
    it('reuses existing worktree and syncs', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue([
        { number: 101, title: 'Add tests', author: 'alice', headRefName: 'add-tests', baseRefName: 'main', url: '', labels: [] },
      ])
      vi.mocked(window.git.worktreeList).mockResolvedValue([
        { path: '/repos/my-project/add-tests', branch: 'add-tests', head: 'abc1234' },
      ])
      vi.mocked(window.git.syncReviewBranch).mockResolvedValue({ success: true })
      const onComplete = vi.fn()

      render(
        <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={onComplete} />
      )
      await waitFor(() => {
        expect(screen.getByText('Add tests')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Add tests'))
      await waitFor(() => {
        expect(screen.getByText('Start Review')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Start Review'))

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledWith(
          '/repos/my-project/add-tests',
          'agent-1',
          expect.objectContaining({ sessionType: 'review', prNumber: 101 }),
        )
      })
      expect(window.git.syncReviewBranch).toHaveBeenCalledWith('/repos/my-project/add-tests', 'add-tests', 101)
    })

    it('creates worktree for same-repo PR (non-fork)', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue([
        { number: 101, title: 'Add tests', author: 'alice', headRefName: 'add-tests', baseRefName: 'main', url: '', labels: [] },
      ])
      vi.mocked(window.git.worktreeList).mockResolvedValue([])
      vi.mocked(window.git.fetchBranch).mockResolvedValue({ success: true })
      vi.mocked(window.git.worktreeAdd).mockResolvedValue({ success: true })
      vi.mocked(window.repos.getInitScript).mockResolvedValue('')
      const onComplete = vi.fn()

      render(
        <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={onComplete} />
      )
      await waitFor(() => {
        expect(screen.getByText('Add tests')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Add tests'))
      await waitFor(() => {
        expect(screen.getByText('Start Review')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Start Review'))

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled()
      })
      expect(window.git.fetchBranch).toHaveBeenCalledWith('/repos/my-project/main', 'add-tests')
      expect(window.git.worktreeAdd).toHaveBeenCalledWith(
        '/repos/my-project/main',
        '/repos/my-project/add-tests',
        'add-tests',
        'origin/add-tests',
      )
      // Should not have called fetchReviewPrHead (not a fork)
      expect(window.git.fetchReviewPrHead).not.toHaveBeenCalled()
    })

    it('creates worktree for fork PR', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue([
        { number: 101, title: 'Fork PR', author: 'contributor', headRefName: 'fork-branch', baseRefName: 'main', url: '', labels: [] },
      ])
      vi.mocked(window.git.worktreeList).mockResolvedValue([])
      vi.mocked(window.git.fetchBranch).mockResolvedValue({ success: false })
      vi.mocked(window.git.fetchReviewPrHead).mockResolvedValue({ success: true })
      vi.mocked(window.git.worktreeAdd).mockResolvedValue({ success: true })
      vi.mocked(window.git.setConfig).mockResolvedValue({ success: true })
      vi.mocked(window.repos.getInitScript).mockResolvedValue(null)
      const onComplete = vi.fn()

      render(
        <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={onComplete} />
      )
      await waitFor(() => {
        expect(screen.getByText('Fork PR')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Fork PR'))
      await waitFor(() => {
        expect(screen.getByText('Start Review')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Start Review'))

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled()
      })
      expect(window.git.fetchReviewPrHead).toHaveBeenCalledWith('/repos/my-project/main', 101, 'fork-branch')
      // Should have configured git pull for fork PRs
      expect(window.git.setConfig).toHaveBeenCalledWith(
        '/repos/my-project/fork-branch',
        'branch.fork-branch.remote',
        'origin',
      )
      expect(window.git.setConfig).toHaveBeenCalledWith(
        '/repos/my-project/fork-branch',
        'branch.fork-branch.merge',
        'refs/pull/101/head',
      )
    })

    it('runs init script on new worktree', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue([
        { number: 101, title: 'Add tests', author: 'alice', headRefName: 'add-tests', baseRefName: 'main', url: '', labels: [] },
      ])
      vi.mocked(window.git.worktreeList).mockResolvedValue([])
      vi.mocked(window.git.fetchBranch).mockResolvedValue({ success: true })
      vi.mocked(window.git.worktreeAdd).mockResolvedValue({ success: true })
      vi.mocked(window.repos.getInitScript).mockResolvedValue('pnpm install')
      const onComplete = vi.fn()

      render(
        <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={onComplete} />
      )
      await waitFor(() => {
        expect(screen.getByText('Add tests')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Add tests'))
      await waitFor(() => {
        expect(screen.getByText('Start Review')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Start Review'))

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled()
      })
      expect(window.shell.exec).toHaveBeenCalledWith('pnpm install', '/repos/my-project/add-tests', expect.objectContaining({ BROOMY_BRANCH: expect.any(String) }))
    })

    it('handles worktree creation failure', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue([
        { number: 101, title: 'Add tests', author: 'alice', headRefName: 'add-tests', baseRefName: 'main', url: '', labels: [] },
      ])
      vi.mocked(window.git.worktreeList).mockResolvedValue([])
      vi.mocked(window.git.fetchBranch).mockResolvedValue({ success: true })
      vi.mocked(window.git.worktreeAdd).mockResolvedValue({ success: false, error: 'Branch already exists' })

      render(
        <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
      )
      await waitFor(() => {
        expect(screen.getByText('Add tests')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Add tests'))
      await waitFor(() => {
        expect(screen.getByText('Start Review')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Start Review'))

      await waitFor(() => {
        expect(screen.getByText(/Branch already exists/)).toBeTruthy()
      })
    })

    it('handles sync failure gracefully for existing worktree', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue([
        { number: 101, title: 'Add tests', author: 'alice', headRefName: 'add-tests', baseRefName: 'main', url: '', labels: [] },
      ])
      vi.mocked(window.git.worktreeList).mockResolvedValue([
        { path: '/repos/my-project/add-tests', branch: 'add-tests', head: 'abc1234' },
      ])
      vi.mocked(window.git.syncReviewBranch).mockRejectedValue(new Error('No network'))
      const onComplete = vi.fn()

      render(
        <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={onComplete} />
      )
      await waitFor(() => {
        expect(screen.getByText('Add tests')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Add tests'))
      await waitFor(() => {
        expect(screen.getByText('Start Review')).toBeTruthy()
      })
      fireEvent.click(screen.getByText('Start Review'))

      // Should still succeed (sync failure is non-fatal)
      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled()
      })
    })
  })

  describe('keyboard navigation', () => {
    const prs = [
      { number: 101, title: 'Add tests', author: 'alice', headRefName: 'add-tests', baseRefName: 'main', url: '', labels: [] },
      { number: 102, title: 'Fix CI', author: 'bob', headRefName: 'fix-ci', baseRefName: 'main', url: '', labels: [] },
      { number: 103, title: 'Refactor', author: 'carol', headRefName: 'refactor', baseRefName: 'main', url: '', labels: [] },
    ]

    it('highlights first PR by default', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue(prs)
      render(<ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('Add tests')).toBeTruthy())

      const firstButton = screen.getByText('Add tests').closest('button')!
      expect(firstButton.className).toContain('ring-1')
    })

    it('ArrowDown moves focus to next PR', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue(prs)
      render(<ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('Add tests')).toBeTruthy())

      fireEvent.keyDown(window, { key: 'ArrowDown' })

      const secondButton = screen.getByText('Fix CI').closest('button')!
      expect(secondButton.className).toContain('ring-1')
    })

    it('ArrowUp moves focus to previous PR', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue(prs)
      render(<ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('Add tests')).toBeTruthy())

      fireEvent.keyDown(window, { key: 'ArrowDown' })
      fireEvent.keyDown(window, { key: 'ArrowDown' })
      fireEvent.keyDown(window, { key: 'ArrowUp' })

      const secondButton = screen.getByText('Fix CI').closest('button')!
      expect(secondButton.className).toContain('ring-1')
    })

    it('Enter selects the focused PR', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue(prs)
      render(<ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('Add tests')).toBeTruthy())

      fireEvent.keyDown(window, { key: 'ArrowDown' })
      fireEvent.keyDown(window, { key: 'Enter' })

      await waitFor(() => {
        expect(screen.getByText('Review PR')).toBeTruthy()
        expect(screen.getByText('PR #102 by bob')).toBeTruthy()
      })
    })

    it('mouse hover updates focused index', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue(prs)
      render(<ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('Refactor')).toBeTruthy())

      const thirdButton = screen.getByText('Refactor').closest('button')!
      fireEvent.mouseEnter(thirdButton)

      expect(thirdButton.className).toContain('ring-1')
    })
  })

  describe('filter modes', () => {
    beforeEach(() => {
      useRepoStore.setState({ repos: [mockRepo] })
    })

    it('defaults to team mode and fetches with it', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue([])
      render(<ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />)

      await waitFor(() => {
        expect(window.gh.prsToReview).toHaveBeenCalledWith('/repos/my-project/main', 'team')
      })
      expect(screen.getByRole('tab', { name: 'Team' }).getAttribute('aria-selected')).toBe('true')
    })

    it('starts in the mode saved on the repo', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue([])
      render(<ReviewPrsView repo={{ ...mockRepo, prReviewFilter: 'all' }} onBack={vi.fn()} onComplete={vi.fn()} />)

      await waitFor(() => {
        expect(window.gh.prsToReview).toHaveBeenCalledWith('/repos/my-project/main', 'all')
      })
      expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true')
    })

    it('refetches with the new mode when a tab is clicked', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue([])
      render(<ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />)
      await waitFor(() => expect(window.gh.prsToReview).toHaveBeenCalledTimes(1))

      fireEvent.click(screen.getByRole('tab', { name: 'Mine' }))

      await waitFor(() => {
        expect(window.gh.prsToReview).toHaveBeenCalledWith('/repos/my-project/main', 'mine')
      })
    })

    it('persists the chosen mode on the repo', async () => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue([])
      render(<ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />)
      await waitFor(() => expect(window.gh.prsToReview).toHaveBeenCalled())

      fireEvent.click(screen.getByRole('tab', { name: 'Mine' }))

      await waitFor(() => {
        expect(useRepoStore.getState().repos[0].prReviewFilter).toBe('mine')
      })
    })

    it.each([
      ['team', undefined, /No PRs pending your review/],
      ['mine', 'mine' as const, /No PRs personally assigned to you/],
      ['all', 'all' as const, /No open PRs/],
    ])('shows the %s empty state', async (_name, savedMode, expected) => {
      vi.mocked(window.gh.prsToReview).mockResolvedValue([])
      render(<ReviewPrsView repo={{ ...mockRepo, prReviewFilter: savedMode }} onBack={vi.fn()} onComplete={vi.fn()} />)

      await waitFor(() => expect(screen.getByText(expected)).toBeTruthy())
    })

    it('clears a previous error when switching modes', async () => {
      vi.mocked(window.gh.prsToReview).mockRejectedValueOnce(new Error('Auth failed'))
      render(<ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />)
      await waitFor(() => expect(screen.getByText(/Auth failed/)).toBeTruthy())

      vi.mocked(window.gh.prsToReview).mockResolvedValue([])
      fireEvent.click(screen.getByRole('tab', { name: 'All' }))

      await waitFor(() => expect(screen.queryByText(/Auth failed/)).toBeNull())
    })
  })

  it('shows labels on PR items in the list', async () => {
    vi.mocked(window.gh.prsToReview).mockResolvedValue([
      { number: 101, title: 'Add tests', author: 'alice', headRefName: 'add-tests', baseRefName: 'main', url: '', labels: ['bug', 'urgent'] },
    ])
    render(
      <ReviewPrsView repo={mockRepo} onBack={vi.fn()} onComplete={vi.fn()} />
    )
    await waitFor(() => {
      expect(screen.getByText('bug')).toBeTruthy()
      expect(screen.getByText('urgent')).toBeTruthy()
    })
  })
})
