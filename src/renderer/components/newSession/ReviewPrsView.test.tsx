// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'
import { useAgentStore } from '../../store/agents'
import { ReviewPrsView } from './ReviewPrsView'
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
})
