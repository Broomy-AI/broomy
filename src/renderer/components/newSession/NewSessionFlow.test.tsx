// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'
import { useRepoStore } from '../../store/repos'
import { useAgentStore } from '../../store/agents'
import { NewSessionDialog } from './index'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  useRepoStore.setState({
    repos: [],
    ghAvailable: true,
    defaultCloneDir: '~/repos',
    addRepo: vi.fn(),
  })
  useAgentStore.setState({
    agents: [
      { id: 'agent-1', name: 'Claude', command: 'claude', color: '#4a9eff' },
    ],
  })
})

/** Find a button by title attribute or text content substring */
function findButton(container: HTMLElement, opts: { title?: string; textIncludes?: string }) {
  if (opts.title) return container.querySelector(`[title="${opts.title}"]`)!
  return [...container.querySelectorAll('button')].find(b => b.textContent?.includes(opts.textIncludes!))!
}

describe('NewSessionDialog', () => {
  it('renders home view by default', () => {
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('New Session')).toBeTruthy()
    expect(findButton(container, { textIncludes: 'lone' })).toBeTruthy()
  })

  it('does not call onCancel when backdrop is clicked', () => {
    const onCancel = vi.fn()
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={onCancel} />)
    const backdrop = container.querySelector('.fixed.inset-0')!
    fireEvent.click(backdrop)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('does not call onCancel when dialog content is clicked', () => {
    const onCancel = vi.fn()
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('New Session'))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('navigates to clone view', () => {
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(findButton(container, { textIncludes: 'lone' }))
    expect(screen.getByText('Clone Repository')).toBeTruthy()
  })

  it('navigates to add existing repo view', () => {
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(findButton(container, { textIncludes: 'dd Repo' }))
    expect(screen.getByText('Add Existing Repository')).toBeTruthy()
  })

  it('navigates to folder picker via Folder button', async () => {
    vi.mocked(window.dialog.openFolder).mockResolvedValue('/my/folder')
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(findButton(container, { textIncludes: 'older' }))

    await waitFor(() => {
      expect(screen.getByText('Select Agent')).toBeTruthy()
    })
  })

  it('navigates back from clone to home', () => {
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(findButton(container, { textIncludes: 'lone' }))
    expect(screen.getByText('Clone Repository')).toBeTruthy()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByText('New Session')).toBeTruthy()
  })

  it('navigates to new branch view when New is clicked on a repo', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(findButton(container, { title: 'Create a new branch worktree' }))
    expect(screen.getByText('New Branch')).toBeTruthy()
  })

  it('navigates to existing branch view when Existing is clicked on a repo', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(findButton(container, { title: 'Open an existing branch' }))
    expect(screen.getByText('Existing Branches')).toBeTruthy()
  })

  it('navigates to repo settings view', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true, updateRepo: vi.fn(), removeRepo: vi.fn() })
    vi.mocked(window.repos.getInitScript).mockResolvedValue('')
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(findButton(container, { title: 'Repository settings' }))
    expect(screen.getByText('Repository Settings')).toBeTruthy()
  })

  it('navigates to issues view', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    vi.mocked(window.gh.issues).mockReturnValue(new Promise(() => {}))
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(findButton(container, { title: 'Browse GitHub issues' }))
    expect(screen.getByText(/Issues/)).toBeTruthy()
  })

  it('navigates to review PRs view', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    vi.mocked(window.gh.prsToReview).mockReturnValue(new Promise(() => {}))
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(findButton(container, { title: 'Review pull requests' }))
    expect(screen.getByText('PRs to Review')).toBeTruthy()
  })

  it('navigates to agent picker via Open button', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(findButton(container, { title: 'Open main branch' }))
    expect(screen.getByText('Select Agent')).toBeTruthy()
  })
})
