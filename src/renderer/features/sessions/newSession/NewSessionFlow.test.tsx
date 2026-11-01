// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../../test/react-setup'
import { useRepoStore } from '../../../store/repos'
import { useAgentStore } from '../../../store/agents'
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

  it('caps the dialog to the window height and lets it scroll', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('max-h-[calc(100vh-2rem)]')
    expect(dialog.className).toContain('overflow-y-auto')
    expect(dialog.className).toContain('flex-col')
  })

  it('opens each view scrolled to its top', () => {
    useRepoStore.setState({
      repos: [{ id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }],
      ghAvailable: true,
    })
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    // jsdom doesn't lay out, so track the shell's scrollTop by hand
    let scrollTop = 120
    Object.defineProperty(screen.getByRole('dialog'), 'scrollTop', {
      configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = value },
    })

    fireEvent.click(findButton(container, { title: 'Create a new branch worktree' }))
    expect(screen.getByText('New Branch')).toBeTruthy()
    expect(scrollTop).toBe(0)
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

  describe('navigating back and focus', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }

    beforeEach(() => {
      useRepoStore.setState({ repos: [repo], ghAvailable: true, updateRepo: vi.fn(), removeRepo: vi.fn() })
      vi.mocked(window.repos.getInitScript).mockResolvedValue('')
      vi.mocked(window.gh.issues).mockReturnValue(new Promise(() => {}))
      vi.mocked(window.gh.prsToReview).mockReturnValue(new Promise(() => {}))
    })

    it('Escape from a sub-view returns to Home at its top', () => {
      const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
      fireEvent.click(findButton(container, { title: 'Create a new branch worktree' }))
      let scrollTop = 120
      Object.defineProperty(screen.getByRole('dialog'), 'scrollTop', {
        configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = value },
      })

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.getByText('New Session')).toBeTruthy()
      expect(scrollTop).toBe(0)
    })

    it.each([
      ['Create a new branch worktree', 'New Branch'],
      ['Open an existing branch', 'Existing Branches'],
      ['Repository settings', 'Repository Settings'],
      ['Browse GitHub issues', 'Issues'],
      ['Review pull requests', 'PRs to Review'],
      ['Open main branch', 'Select Agent'],
    ])('the back button of the view opened by "%s" returns to Home', (title, heading) => {
      const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
      fireEvent.click(findButton(container, { title }))
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()

      // Every sub-view's header starts with its back button
      fireEvent.click(screen.getByRole('dialog').querySelector('button')!)
      expect(screen.getByText('New Session')).toBeTruthy()
    })

    it('the back button of Add Existing Repository returns to Home', () => {
      const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
      fireEvent.click(findButton(container, { textIncludes: 'dd Repo' }))
      fireEvent.click(screen.getByRole('dialog').querySelector('button')!)
      expect(screen.getByText('New Session')).toBeTruthy()
    })

    it('a branch started from an issue goes back to the issue list', async () => {
      vi.mocked(window.gh.issues).mockResolvedValue([
        { number: 7, title: 'Scroll the dialog', labels: [], url: 'https://github.com/user/my-project/issues/7' },
      ])
      const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
      fireEvent.click(findButton(container, { title: 'Browse GitHub issues' }))
      fireEvent.click(await screen.findByText('Scroll the dialog'))
      expect(screen.getByText('New Branch')).toBeTruthy()

      fireEvent.click(screen.getByRole('dialog').querySelector('button')!)
      expect(await screen.findByText('Scroll the dialog')).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Issues' })).toBeTruthy()
    })

    it('Tab wraps from the last control to the first, and Shift+Tab back', () => {
      render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
      const buttons = screen.getByRole('dialog').querySelectorAll<HTMLButtonElement>('button')
      const first = buttons[0]
      const last = buttons[buttons.length - 1]

      last.focus()
      fireEvent.keyDown(last, { key: 'Tab' })
      expect(document.activeElement).toBe(first)

      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(last)
    })

    it('Tab from the dialog itself moves into its first control', () => {
      render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
      const dialog = screen.getByRole('dialog')
      expect(document.activeElement).toBe(dialog)

      fireEvent.keyDown(dialog, { key: 'Tab' })
      expect(document.activeElement).toBe(dialog.querySelector('button'))
    })
  })
})
