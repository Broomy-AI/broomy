// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import '../../../../test/react-setup'
import { useRepoStore } from '../../../store/repos'
import { HomeView } from './HomeView'
import { REPO_FILTER_MIN_REPOS } from './useRepoFilter'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  useRepoStore.setState({
    repos: [],
    ghAvailable: true,
  })
})

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    onClone: vi.fn(),
    onAddExistingRepo: vi.fn(),
    onOpenFolder: vi.fn(),
    onNewBranch: vi.fn(),
    onExistingBranch: vi.fn(),
    onRepoSettings: vi.fn(),
    onIssues: vi.fn(),
    onReviewPrs: vi.fn(),
    onOpenMain: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
}

describe('HomeView', () => {
  it('renders header', () => {
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText('New Session')).toBeTruthy()
  })

  it('renders Clone, Add Repo, and Folder buttons with underlined hints', () => {
    const { container } = render(<HomeView {...makeProps()} />)
    const underlines = container.querySelectorAll('u')
    expect(underlines.length).toBeGreaterThanOrEqual(3)
  })

  it('calls onClone when Clone is clicked', () => {
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    const cloneBtn = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('lone'))!
    fireEvent.click(cloneBtn)
    expect(props.onClone).toHaveBeenCalled()
  })

  it('calls onAddExistingRepo when Add Repo is clicked', () => {
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    const addBtn = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('dd Repo'))!
    fireEvent.click(addBtn)
    expect(props.onAddExistingRepo).toHaveBeenCalled()
  })

  it('calls onOpenFolder when Folder is clicked', () => {
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    const folderBtn = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('older'))!
    fireEvent.click(folderBtn)
    expect(props.onOpenFolder).toHaveBeenCalled()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const props = makeProps()
    render(<HomeView {...props} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(props.onCancel).toHaveBeenCalled()
  })

  it('shows empty state when no repos', () => {
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText(/No managed repositories yet/)).toBeTruthy()
  })

  it('shows repos when available', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: true,
    })
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText('Your Repositories')).toBeTruthy()
    expect(screen.getByText('My Project')).toBeTruthy()
  })

  it('renders New, Existing, Open buttons for each repo', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: true,
    })
    const { container } = render(<HomeView {...makeProps()} />)
    expect(container.querySelector('[title="Create a new branch worktree"]')).toBeTruthy()
    expect(container.querySelector('[title="Open an existing branch"]')).toBeTruthy()
    expect(container.querySelector('[title="Open main branch"]')).toBeTruthy()
  })

  it('shows Issues and Review buttons when ghAvailable is true', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: true,
    })
    const { container } = render(<HomeView {...makeProps()} />)
    expect(container.querySelector('[title="Browse GitHub issues"]')).toBeTruthy()
    expect(container.querySelector('[title="Review pull requests"]')).toBeTruthy()
  })

  it('hides Issues and Review buttons when ghAvailable is false', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: false,
    })
    const { container } = render(<HomeView {...makeProps()} />)
    expect(container.querySelector('[title="Browse GitHub issues"]')).toBeNull()
    expect(container.querySelector('[title="Review pull requests"]')).toBeNull()
  })

  it('shows gh not found warning when ghAvailable is false with repos', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: false,
    })
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText(/GitHub CLI.*not found/)).toBeTruthy()
  })

  it('calls onNewBranch with repo when New is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    fireEvent.click(container.querySelector('[title="Create a new branch worktree"]')!)
    expect(props.onNewBranch).toHaveBeenCalledWith(repo)
  })

  it('calls onExistingBranch with repo when Existing is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    fireEvent.click(container.querySelector('[title="Open an existing branch"]')!)
    expect(props.onExistingBranch).toHaveBeenCalledWith(repo)
  })

  it('calls onOpenMain with repo when Open is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    fireEvent.click(container.querySelector('[title="Open main branch"]')!)
    expect(props.onOpenMain).toHaveBeenCalledWith(repo)
  })

  it('calls onIssues when Issues button is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    fireEvent.click(container.querySelector('[title="Browse GitHub issues"]')!)
    expect(props.onIssues).toHaveBeenCalledWith(repo)
  })

  it('calls onReviewPrs when Review button is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    fireEvent.click(container.querySelector('[title="Review pull requests"]')!)
    expect(props.onReviewPrs).toHaveBeenCalledWith(repo)
  })

  it('calls onRepoSettings when settings button is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    fireEvent.click(container.querySelector('[title="Repository settings"]')!)
    expect(props.onRepoSettings).toHaveBeenCalledWith(repo)
  })

  it('opens cli.github.com when link is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: false })
    render(<HomeView {...makeProps()} />)
    fireEvent.click(screen.getByText('cli.github.com'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://cli.github.com')
  })

  describe('keyboard navigation', () => {
    it('C key triggers onClone', () => {
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'c' })
      expect(props.onClone).toHaveBeenCalled()
    })

    it('A key triggers onAddExistingRepo', () => {
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'a' })
      expect(props.onAddExistingRepo).toHaveBeenCalled()
    })

    it('F key triggers onOpenFolder', () => {
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'f' })
      expect(props.onOpenFolder).toHaveBeenCalled()
    })

    it('Escape triggers onCancel', () => {
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(props.onCancel).toHaveBeenCalled()
    })

    it('N key triggers onNewBranch with focused repo', () => {
      const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
      useRepoStore.setState({ repos: [repo], ghAvailable: true })
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'n' })
      expect(props.onNewBranch).toHaveBeenCalledWith(repo)
    })

    it('E key triggers onExistingBranch with focused repo', () => {
      const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
      useRepoStore.setState({ repos: [repo], ghAvailable: true })
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'e' })
      expect(props.onExistingBranch).toHaveBeenCalledWith(repo)
    })

    it('O key triggers onOpenMain with focused repo', () => {
      const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
      useRepoStore.setState({ repos: [repo], ghAvailable: true })
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'o' })
      expect(props.onOpenMain).toHaveBeenCalledWith(repo)
    })

    it('ArrowDown changes focused repo index', () => {
      const repos = [
        { id: 'repo-1', name: 'Project A', remoteUrl: '', rootDir: '/repos/a', defaultBranch: 'main' },
        { id: 'repo-2', name: 'Project B', remoteUrl: '', rootDir: '/repos/b', defaultBranch: 'main' },
      ]
      useRepoStore.setState({ repos, ghAvailable: true })
      const props = makeProps()
      const { container } = render(<HomeView {...props} />)

      // First repo should be focused initially (has ring class)
      const repoRows = container.querySelectorAll('.ring-1')
      expect(repoRows.length).toBe(1)

      // Press ArrowDown to move to second repo
      fireEvent.keyDown(window, { key: 'ArrowDown' })

      // N key should now act on the second repo
      fireEvent.keyDown(window, { key: 'n' })
      expect(props.onNewBranch).toHaveBeenCalledWith(repos[1])
    })

    it('ArrowUp changes focused repo index', () => {
      const repos = [
        { id: 'repo-1', name: 'Project A', remoteUrl: '', rootDir: '/repos/a', defaultBranch: 'main' },
        { id: 'repo-2', name: 'Project B', remoteUrl: '', rootDir: '/repos/b', defaultBranch: 'main' },
      ]
      useRepoStore.setState({ repos, ghAvailable: true })
      const props = makeProps()
      render(<HomeView {...props} />)

      // Move down then back up
      fireEvent.keyDown(window, { key: 'ArrowDown' })
      fireEvent.keyDown(window, { key: 'ArrowUp' })

      // N key should act on first repo
      fireEvent.keyDown(window, { key: 'n' })
      expect(props.onNewBranch).toHaveBeenCalledWith(repos[0])
    })

    it('ignores letter keys when input is focused', () => {
      const props = makeProps()
      const { container } = render(<HomeView {...props} />)

      // Create and focus an input (simulating a focused input inside the component)
      const input = document.createElement('input')
      container.appendChild(input)
      input.focus()

      // Dispatch from input so e.target is the input element (capture-phase handler checks this)
      fireEvent.keyDown(input, { key: 'c' })
      expect(props.onClone).not.toHaveBeenCalled()

      container.removeChild(input)
    })

    it('ignores letter keys with meta modifier', () => {
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'c', metaKey: true })
      expect(props.onClone).not.toHaveBeenCalled()
    })

    it('shows focus ring on focused repo', () => {
      const repos = [
        { id: 'repo-1', name: 'Project A', remoteUrl: '', rootDir: '/repos/a', defaultBranch: 'main' },
        { id: 'repo-2', name: 'Project B', remoteUrl: '', rootDir: '/repos/b', defaultBranch: 'main' },
      ]
      useRepoStore.setState({ repos, ghAvailable: true })
      const { container } = render(<HomeView {...makeProps()} />)

      // First repo should have the focus ring
      const repoRows = container.querySelectorAll('.ring-1')
      expect(repoRows.length).toBe(1)
    })
  })

  describe('long repo lists', () => {
    const makeRepos = (count: number) => Array.from({ length: count }, (_, i) => (
      { id: `repo-${i + 1}`, name: `Project ${i + 1}`, remoteUrl: '', rootDir: `/repos/p${i + 1}`, defaultBranch: 'main' }
    ))

    afterEach(() => {
      // jsdom has no scrollIntoView; drop the stub so other tests see the real (missing) API
      delete (Element.prototype as Partial<Element>).scrollIntoView
    })

    it('scrolls the highlighted repo into view', () => {
      useRepoStore.setState({ repos: makeRepos(5), ghAvailable: true })
      const spy = vi.fn(function (this: Element) {})
      Element.prototype.scrollIntoView = spy
      const { container } = render(<HomeView {...makeProps()} />)
      const rows = container.querySelectorAll('[data-repo-row]')
      // Opening the dialog doesn't scroll: it starts at its top
      expect(spy).not.toHaveBeenCalled()

      fireEvent.keyDown(window, { key: 'ArrowDown' })
      fireEvent.keyDown(window, { key: 'ArrowDown' })
      fireEvent.keyDown(window, { key: 'ArrowDown' })
      expect(spy.mock.contexts.at(-1)).toBe(rows[3])
      expect(spy.mock.lastCall).toEqual([{ block: 'nearest' }])

      fireEvent.keyDown(window, { key: 'ArrowUp' })
      expect(spy.mock.contexts.at(-1)).toBe(rows[2])
    })

    it('keeps arrow-key navigation working without scrollIntoView', () => {
      const repos = makeRepos(5)
      useRepoStore.setState({ repos, ghAvailable: true })
      const props = makeProps()
      render(<HomeView {...props} />)

      fireEvent.keyDown(window, { key: 'ArrowDown' })
      fireEvent.keyDown(window, { key: 'ArrowDown' })
      fireEvent.keyDown(window, { key: 'n' })
      expect(props.onNewBranch).toHaveBeenCalledWith(repos[2])
    })

    it('scrolls the body between the pinned header and the Cancel footer', () => {
      useRepoStore.setState({ repos: makeRepos(3), ghAvailable: true })
      const { container } = render(<HomeView {...makeProps()} />)
      const body = container.querySelector('[data-repo-row]')?.closest('.overflow-y-auto')
      const cloneBtn = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('lone'))!

      expect(body?.className).toContain('min-h-0')
      expect(body?.contains(cloneBtn)).toBe(true)
      expect(body?.contains(screen.getByText('New Session'))).toBe(false)
      expect(body?.contains(screen.getByText('Cancel'))).toBe(false)
    })

    it('moves DOM focus along a button column with the arrow keys', () => {
      useRepoStore.setState({ repos: makeRepos(5), ghAvailable: true })
      const { container } = render(<HomeView {...makeProps()} />)
      const newButtons = container.querySelectorAll<HTMLButtonElement>('[title="Create a new branch worktree"]')

      act(() => { newButtons[0].focus() })
      fireEvent.keyDown(newButtons[0], { key: 'ArrowDown' })
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })

      expect(document.activeElement).toBe(newButtons[2])
      expect(container.querySelector('.ring-1')?.contains(newButtons[2])).toBe(true)
    })

    it('highlights the repo whose button receives focus, without scrolling', () => {
      const repos = makeRepos(5)
      useRepoStore.setState({ repos, ghAvailable: true })
      const spy = vi.fn(function (this: Element) {})
      Element.prototype.scrollIntoView = spy
      const props = makeProps()
      const { container } = render(<HomeView {...props} />)
      const openButtons = container.querySelectorAll<HTMLButtonElement>('[title="Open main branch"]')

      act(() => { openButtons[3].focus() })

      expect(container.querySelector('.ring-1')?.contains(openButtons[3])).toBe(true)
      // A click focuses on mousedown: scrolling then would move the row away before mouseup
      expect(spy).not.toHaveBeenCalled()
      fireEvent.keyDown(openButtons[3], { key: 'e' })
      expect(props.onExistingBranch).toHaveBeenCalledWith(repos[3])
    })
  })
})

describe('HomeView repo filter (#188)', () => {
  const NAMES = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel']
  const makeNamedRepos = (count: number) => NAMES.slice(0, count).map((name) => (
    { id: `id-${name}`, name, remoteUrl: '', rootDir: `/repos/${name}`, defaultBranch: 'main' }
  ))

  // The real dialog shell: Enter in the filter box returns focus here
  function renderInDialog(props = makeProps()) {
    const utils = render(<div role="dialog" tabIndex={-1} data-testid="dialog"><HomeView {...props} /></div>)
    const dialog = screen.getByTestId('dialog')
    act(() => { dialog.focus() })
    return { ...utils, props, dialog }
  }
  const filterInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Filter repositories' })
  const rowNames = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-repo-row]')].map(r => r.getAttribute('aria-label'))
  const highlighted = (container: HTMLElement) => container.querySelector('.ring-1')?.getAttribute('aria-label')
  const body = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-home-body]')!
  const type = (value: string) => fireEvent.change(filterInput(), { target: { value } })

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  it(`hides the filter below ${REPO_FILTER_MIN_REPOS} repos, where / does nothing`, () => {
    useRepoStore.setState({ repos: makeNamedRepos(REPO_FILTER_MIN_REPOS - 1), ghAvailable: true })
    renderInDialog()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(fireEvent.keyDown(window, { key: '/' })).toBe(true)
  })

  it(`shows the filter from ${REPO_FILTER_MIN_REPOS} repos, without stealing focus on open`, () => {
    useRepoStore.setState({ repos: makeNamedRepos(REPO_FILTER_MIN_REPOS), ghAvailable: true })
    // Not renderInDialog: it focuses the dialog itself, which would hide a mount-time focus grab
    render(<div role="dialog" tabIndex={-1}><HomeView {...makeProps()} /></div>)
    expect(filterInput()).toBeTruthy()
    expect(document.activeElement).not.toBe(filterInput())
    expect(document.activeElement).toBe(document.body)
  })

  it('focuses the filter with /, without typing the slash', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    renderInDialog()
    expect(fireEvent.keyDown(window, { key: '/' })).toBe(false)
    expect(document.activeElement).toBe(filterInput())
    expect(filterInput().value).toBe('')
  })

  it('ignores / with Cmd, Ctrl or Alt, but accepts it with Shift (some layouts need Shift)', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { dialog } = renderInDialog()
    for (const mod of ['metaKey', 'ctrlKey', 'altKey']) {
      fireEvent.keyDown(window, { key: '/', [mod]: true })
      expect(document.activeElement).toBe(dialog)
    }
    fireEvent.keyDown(window, { key: '/', shiftKey: true })
    expect(document.activeElement).toBe(filterInput())
  })

  it('filters rows by name, ignoring case and surrounding spaces', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { container } = renderInDialog()
    type('  O  ')
    expect(rowNames(container)).toEqual(['bravo', 'echo', 'foxtrot', 'golf', 'hotel'])
    type('GOLF')
    expect(rowNames(container)).toEqual(['golf'])
  })

  it('types letters into the filter instead of running shortcuts', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { props } = renderInDialog()
    act(() => { filterInput().focus() })
    for (const key of ['n', 'e', 'o', 'i', 'r', 'c', 'a', 'f', '/']) {
      expect(fireEvent.keyDown(filterInput(), { key })).toBe(true)
    }
    for (const fn of [props.onNewBranch, props.onExistingBranch, props.onOpenMain, props.onIssues, props.onReviewPrs, props.onClone, props.onAddExistingRepo, props.onOpenFolder]) {
      expect(fn).not.toHaveBeenCalled()
    }
  })

  it.each([
    ['n', 'onNewBranch'], ['e', 'onExistingBranch'], ['o', 'onOpenMain'], ['i', 'onIssues'], ['r', 'onReviewPrs'],
  ] as const)('after Enter, %s acts on the highlighted match, not the repo at that index in the full list', (key, handler) => {
    const repos = makeNamedRepos(8)
    useRepoStore.setState({ repos, ghAvailable: true })
    const { props, dialog } = renderInDialog()
    fireEvent.keyDown(window, { key: '/' })
    type('golf')
    expect(fireEvent.keyDown(filterInput(), { key: 'Enter' })).toBe(false)
    expect(document.activeElement).toBe(dialog)

    fireEvent.keyDown(window, { key })
    expect(props[handler]).toHaveBeenCalledWith(repos[6])
  })

  it('moves the highlight within the matches with plain arrows while typing', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { container } = renderInDialog()
    act(() => { filterInput().focus() })
    type('o')
    expect(highlighted(container)).toBe('bravo')
    expect(fireEvent.keyDown(filterInput(), { key: 'ArrowDown' })).toBe(false)
    fireEvent.keyDown(filterInput(), { key: 'ArrowDown' })
    expect(highlighted(container)).toBe('foxtrot')
    fireEvent.keyDown(filterInput(), { key: 'ArrowUp' })
    expect(highlighted(container)).toBe('echo')
    expect(document.activeElement).toBe(filterInput())
  })

  it('leaves modified and composing keys in the filter to the text field', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { container, props } = renderInDialog()
    act(() => { filterInput().focus() })
    type('o')
    for (const init of [{ shiftKey: true }, { metaKey: true }, { ctrlKey: true }, { altKey: true }, { isComposing: true }]) {
      expect(fireEvent.keyDown(filterInput(), { key: 'ArrowDown', ...init })).toBe(true)
      expect(fireEvent.keyDown(filterInput(), { key: 'Enter', ...init })).toBe(init.shiftKey ? false : true)
      if (init.shiftKey) act(() => { filterInput().focus() })
    }
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { isComposing: true }]) {
      expect(fireEvent.keyDown(filterInput(), { key: 'Escape', ...init })).toBe(true)
    }
    expect(highlighted(container)).toBe('bravo')
    expect(filterInput().value).toBe('o')
    expect(props.onCancel).not.toHaveBeenCalled()
  })

  it('keeps focus in the filter when Enter has nothing to act on', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { props } = renderInDialog()
    act(() => { filterInput().focus() })
    type('zzz')
    fireEvent.keyDown(filterInput(), { key: 'Enter' })
    expect(document.activeElement).toBe(filterInput())
    expect(props.onNewBranch).not.toHaveBeenCalled()
  })

  it('Escape in the filter clears it first, then closes the dialog', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { container, props } = renderInDialog()
    act(() => { filterInput().focus() })
    type('golf')
    fireEvent.keyDown(filterInput(), { key: 'Escape' })
    expect(filterInput().value).toBe('')
    expect(rowNames(container)).toHaveLength(8)
    expect(props.onCancel).not.toHaveBeenCalled()
    fireEvent.keyDown(filterInput(), { key: 'Escape' })
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('Escape outside the filter clears an active filter before closing', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { container, props, dialog } = renderInDialog()
    fireEvent.keyDown(window, { key: '/' })
    type('golf')
    fireEvent.keyDown(filterInput(), { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(filterInput().value).toBe('')
    expect(rowNames(container)).toHaveLength(8)
    expect(document.activeElement).toBe(dialog)
    expect(props.onCancel).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('Escape on the × button clears the filter and hands the focus to the dialog', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { container, dialog, props } = renderInDialog()
    type('gol')
    const clear = screen.getByRole('button', { name: 'Clear filter' })
    act(() => { clear.focus() })
    fireEvent.keyDown(clear, { key: 'Escape' })
    expect(filterInput().value).toBe('')
    expect(rowNames(container)).toHaveLength(8)
    expect(document.activeElement).toBe(dialog)
    expect(props.onCancel).not.toHaveBeenCalled()
  })

  it('Escape on the no-match Clear filter button keeps the focus in the dialog', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { dialog } = renderInDialog()
    type('zzz')
    const clear = screen.getAllByRole('button', { name: 'Clear filter' }).find(b => b.textContent === 'Clear filter')!
    act(() => { clear.focus() })
    fireEvent.keyDown(clear, { key: 'Escape' })
    expect(filterInput().value).toBe('')
    expect(document.activeElement).toBe(dialog)
  })

  it('Escape on a repo button clears the filter without leaving Enter and N on different repos', () => {
    const repos = makeNamedRepos(8)
    useRepoStore.setState({ repos, ghAvailable: true })
    const { container, dialog, props } = renderInDialog()
    type('golf')
    const openGolf = container.querySelector<HTMLButtonElement>('[title="Open main branch"]')!
    act(() => { openGolf.focus() })
    fireEvent.keyDown(openGolf, { key: 'Escape' })

    expect(rowNames(container)).toHaveLength(8)
    expect(highlighted(container)).toBe('alpha')
    expect(document.activeElement).toBe(dialog)
    fireEvent.keyDown(window, { key: 'n' })
    expect(props.onNewBranch).toHaveBeenCalledWith(repos[0])
  })

  it('offers a way back when nothing matches', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { container } = renderInDialog()
    type('zzz')
    expect(rowNames(container)).toEqual([])
    expect(screen.getByText(/No repositories match “/).textContent).toContain("“zzz”")
    const clearButtons = screen.getAllByRole('button', { name: 'Clear filter' })
    expect(clearButtons).toHaveLength(2)
    fireEvent.click(clearButtons.find(b => b.textContent === 'Clear filter')!)
    expect(rowNames(container)).toHaveLength(8)
    expect(document.activeElement).toBe(filterInput())
  })

  it('clears with the × button and refocuses the filter', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { container } = renderInDialog()
    expect(screen.queryByRole('button', { name: 'Clear filter' })).toBeNull()
    type('gol')
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(filterInput().value).toBe('')
    expect(rowNames(container)).toHaveLength(8)
    expect(document.activeElement).toBe(filterInput())
  })

  it('keeps repo shortcuts inert with no matches, while C/A/F still work', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { props, dialog } = renderInDialog()
    type('zzz')
    act(() => { dialog.focus() })
    for (const key of ['n', 'e', 'o', 'i', 'r', 'ArrowDown', 'ArrowUp']) fireEvent.keyDown(window, { key })
    expect(props.onNewBranch).not.toHaveBeenCalled()
    expect(props.onExistingBranch).not.toHaveBeenCalled()
    expect(props.onOpenMain).not.toHaveBeenCalled()
    expect(props.onIssues).not.toHaveBeenCalled()
    expect(props.onReviewPrs).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'c' })
    expect(props.onClone).toHaveBeenCalled()
  })

  it('highlights and reveals the first match when the filter changes, but not on open', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const spy = vi.fn(function (this: Element) {})
    Element.prototype.scrollIntoView = spy
    const { container } = renderInDialog()
    expect(spy).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(highlighted(container)).toBe('charlie')
    type('o')
    expect(highlighted(container)).toBe('bravo')
    expect(spy.mock.contexts.at(-1)).toBe(container.querySelector('[data-repo-row]'))
  })

  it('still updates the highlight when scrollIntoView is missing', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { container } = renderInDialog()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    type('e')
    expect(highlighted(container)).toBe('charlie')
  })

  it('recovers when matches arrive after arrowing through an empty result', () => {
    const repos = makeNamedRepos(8)
    useRepoStore.setState({ repos, ghAvailable: true })
    const { props } = renderInDialog()
    act(() => { filterInput().focus() })
    type('zzz')
    fireEvent.keyDown(filterInput(), { key: 'ArrowDown' })
    fireEvent.keyDown(filterInput(), { key: 'ArrowUp' })
    const added = { id: 'id-zzz', name: 'zzz-tools', remoteUrl: '', rootDir: '/repos/zzz', defaultBranch: 'main' }
    act(() => { useRepoStore.setState({ repos: [...repos, added] }) })

    fireEvent.keyDown(filterInput(), { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'n' })
    expect(props.onNewBranch).toHaveBeenCalledWith(added)
  })

  it('drops the filter, its height lock and its focus when the list falls below the threshold', () => {
    const repos = makeNamedRepos(REPO_FILTER_MIN_REPOS)
    useRepoStore.setState({ repos, ghAvailable: true })
    const { container, dialog } = renderInDialog()
    Object.defineProperty(body(container), 'offsetHeight', { configurable: true, get: () => 400 })
    act(() => { filterInput().focus() })
    type('gol')
    expect(body(container).style.height).toBe('400px')

    act(() => { useRepoStore.setState({ repos: repos.slice(0, -1) }) })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.activeElement).toBe(dialog)
    expect(body(container).style.height).toBe('')
    expect(rowNames(container)).toHaveLength(REPO_FILTER_MIN_REPOS - 1)

    act(() => { useRepoStore.setState({ repos }) })
    expect(filterInput().value).toBe('')
    expect(rowNames(container)).toHaveLength(REPO_FILTER_MIN_REPOS)
  })

  it('moves the focus off a repo button when the threshold crossing resets the highlight', () => {
    const repos = makeNamedRepos(REPO_FILTER_MIN_REPOS)
    useRepoStore.setState({ repos, ghAvailable: true })
    const { container, dialog } = renderInDialog()
    type('fox')
    const openFoxtrot = container.querySelector<HTMLButtonElement>('[title="Open main branch"]')!
    act(() => { openFoxtrot.focus() })

    // Removing alpha hides the box; foxtrot's button survives, but the highlight goes back to the top
    act(() => { useRepoStore.setState({ repos: repos.slice(1) }) })
    expect(highlighted(container)).toBe('bravo')
    expect(document.activeElement).toBe(dialog)
  })

  it('shows the empty state when every repo is removed while filtering', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    renderInDialog()
    type('golf')
    act(() => { useRepoStore.setState({ repos: [] }) })
    expect(screen.getByText(/No managed repositories yet/)).toBeTruthy()
    expect(screen.queryByText(/No repositories match/)).toBeNull()
  })

  it('locks the body at its unfiltered height, even when the first input already narrows it', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { container } = renderInDialog()
    // Height follows the rendered rows: measuring after the filter applies would give 60, not 480
    Object.defineProperty(body(container), 'offsetHeight', {
      configurable: true, get: () => container.querySelectorAll('[data-repo-row]').length * 60,
    })
    type('golf')
    expect(rowNames(container)).toEqual(['golf'])
    expect(body(container).style.height).toBe('480px')
    type('gol')
    expect(body(container).style.height).toBe('480px')
    type('')
    expect(body(container).style.height).toBe('')
  })

  it('keeps the scrollbar space while filtering if the list scrolled, so the rows do not widen', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { container } = renderInDialog()
    const el = body(container)
    Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => 300 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 300 })
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 700 })
    type('golf')
    expect(el.style.scrollbarGutter).toBe('stable')
    type('')
    expect(el.style.scrollbarGutter).toBe('')
  })

  it('reserves no scrollbar space when the list did not scroll', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { container } = renderInDialog()
    const el = body(container)
    Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => 500 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 500 })
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 500 })
    type('golf')
    expect(el.style.height).toBe('500px')
    expect(el.style.scrollbarGutter).toBe('')
  })

  it('does not lock when the body has no layout yet', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    const { container } = renderInDialog()
    type('golf')
    expect(body(container).style.height).toBe('')
  })

  it('describes the filter and announces matches to screen readers', () => {
    useRepoStore.setState({ repos: makeNamedRepos(8), ghAvailable: true })
    renderInDialog()
    const hint = document.getElementById(filterInput().getAttribute('aria-describedby')!)
    expect(hint?.textContent).toContain('Enter returns to the shortcuts')
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')

    type('o')
    expect(status.textContent).toBe('5 repositories match, bravo highlighted')
    type('golf')
    expect(status.textContent).toBe('1 repository matches, golf highlighted')
    type('zzz')
    expect(status.textContent).toBe('No repositories match')
    expect(screen.queryAllByRole('group')).toHaveLength(0)
    type('')
    expect(screen.getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(NAMES)
  })
})
