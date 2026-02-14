// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'
import { IssuesView } from './IssuesView'
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
})

describe('IssuesView', () => {
  it('renders header with repo name', () => {
    vi.mocked(window.gh.issues).mockReturnValue(new Promise(() => {}))
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
    expect(screen.getByText('Issues')).toBeTruthy()
    expect(screen.getByText(/my-project/)).toBeTruthy()
  })

  it('shows loading state initially', () => {
    vi.mocked(window.gh.issues).mockReturnValue(new Promise(() => {}))
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
    expect(screen.getByText('Loading issues...')).toBeTruthy()
  })

  it('calls onBack when Cancel is clicked', () => {
    vi.mocked(window.gh.issues).mockReturnValue(new Promise(() => {}))
    const onBack = vi.fn()
    render(<IssuesView repo={mockRepo} onBack={onBack} onSelectIssue={vi.fn()} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows empty state when no issues', async () => {
    vi.mocked(window.gh.issues).mockResolvedValue([])
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/No open issues assigned to you/)).toBeTruthy()
    })
  })

  it('shows issues after loading', async () => {
    vi.mocked(window.gh.issues).mockResolvedValue([
      { number: 42, title: 'Fix login bug', labels: ['bug'] },
      { number: 43, title: 'Add dark mode', labels: ['enhancement', 'ui'] },
    ])
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('#42')).toBeTruthy()
      expect(screen.getByText('Fix login bug')).toBeTruthy()
      expect(screen.getByText('#43')).toBeTruthy()
      expect(screen.getByText('Add dark mode')).toBeTruthy()
    })
  })

  it('renders labels on issues', async () => {
    vi.mocked(window.gh.issues).mockResolvedValue([
      { number: 42, title: 'Fix login bug', labels: ['bug', 'priority'] },
    ])
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('bug')).toBeTruthy()
      expect(screen.getByText('priority')).toBeTruthy()
    })
  })

  it('calls onSelectIssue when issue is clicked', async () => {
    const issue = { number: 42, title: 'Fix login bug', labels: ['bug'] }
    vi.mocked(window.gh.issues).mockResolvedValue([issue])
    const onSelectIssue = vi.fn()
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={onSelectIssue} />)
    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Fix login bug'))
    expect(onSelectIssue).toHaveBeenCalledWith(issue)
  })

  it('shows error when fetching issues fails', async () => {
    vi.mocked(window.gh.issues).mockRejectedValue(new Error('Rate limit exceeded'))
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/Rate limit exceeded/)).toBeTruthy()
    })
  })
})
