// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import SessionList from './SessionList'
import { useSessionStore } from '../../store/sessions'
import type { Session, StatusChip } from '../../store/sessions'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'my-repo',
    directory: '/repos/my-repo',
    branch: 'feature/foo',
    status: 'idle',
    agentId: 'agent-1',
    panelVisibility: {},
    showExplorer: true,
    showFileViewer: false,
    showDiff: false,
    selectedFilePath: null,
    planFilePath: null,
    fileViewerPosition: 'top',
    layoutSizes: {
      explorerWidth: 256,
      fileViewerSize: 300,
      userTerminalHeight: 192,
      diffPanelWidth: 320,
      tutorialPanelWidth: 320,
    },
    explorerFilter: 'files',
    lastMessage: null,
    lastMessageTime: null,
    isUnread: false,
    workingStartTime: null,
    recentFiles: [],
    searchHistory: [],
    terminalTabs: { tabs: [{ id: 'tab-1', name: 'Terminal' }], activeTabId: 'tab-1' },
    branchStatus: 'in-progress',
    hasFeedback: false,
    checksStatus: 'none' as const,
    statusChip: 'in-progress' as StatusChip,
    isArchived: false,
    isRestored: false,
    ...overrides,
  }
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    repos: [] as { id: string; name: string; remoteUrl: string; rootDir: string; defaultBranch: string }[],
    onSelectSession: vi.fn(),
    onNewSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onRefreshPrStatus: vi.fn().mockResolvedValue(undefined),
    onArchiveSession: vi.fn(),
    onUnarchiveSession: vi.fn(),
    ...overrides,
  }
}

/** Set sessions in the store before rendering. */
function setSessions(sessions: Session[]) {
  useSessionStore.setState({ sessions })
}

afterEach(() => {
  cleanup()
  useSessionStore.setState({ sessions: [], activeSessionId: null })
})

beforeEach(() => {
  vi.clearAllMocks()
  useSessionStore.setState({ sessions: [], activeSessionId: null })
})

describe('SessionList', () => {
  it('renders empty state with New Session button', () => {
    render(<SessionList {...makeProps()} />)
    expect(screen.getByText('+ New Session')).toBeTruthy()
    expect(screen.getByText(/No sessions yet/)).toBeTruthy()
  })

  it('renders sessions with branch names', () => {
    const sessions = [
      makeSession({ id: 's1', branch: 'feature/auth' }),
      makeSession({ id: 's2', branch: 'fix/bug-42' }),
    ]
    setSessions(sessions)
    render(<SessionList {...makeProps()} />)
    expect(screen.getByText('feature/auth')).toBeTruthy()
    expect(screen.getByText('fix/bug-42')).toBeTruthy()
  })

  it('highlights active session', () => {
    const sessions = [
      makeSession({ id: 's1', branch: 'active-branch' }),
      makeSession({ id: 's2', branch: 'other-branch' }),
    ]
    useSessionStore.setState({ sessions, activeSessionId: 's1' })
    const { container } = render(
      <SessionList {...makeProps()} />
    )
    const sessionCards = container.querySelectorAll('[tabindex="0"]')
    expect(sessionCards[0].className).toContain('bg-accent')
    expect(sessionCards[1].className).not.toContain('bg-accent')
  })

  it('shows unread indicator with bold text', () => {
    setSessions([makeSession({ id: 's1', branch: 'unread-branch', isUnread: true })])
    render(<SessionList {...makeProps()} />)
    const branchText = screen.getByText('unread-branch')
    expect(branchText.className).toContain('font-bold')
  })

  it('shows status labels for sessions without messages', () => {
    setSessions([makeSession({ id: 's1', branch: 'b1', status: 'idle', lastMessage: null })])
    render(<SessionList {...makeProps()} />)
    expect(screen.getByText('Idle')).toBeTruthy()
  })

  it('shows last message when available', () => {
    setSessions([makeSession({ id: 's1', branch: 'b1', lastMessage: 'Reading file.ts' })])
    render(<SessionList {...makeProps()} />)
    expect(screen.getByText(/"Reading file.ts"/)).toBeTruthy()
  })

  it('shows branch status chips', () => {
    setSessions([
      makeSession({ id: 's1', branch: 'b1', branchStatus: 'pushed', statusChip: 'pushed' }),
      makeSession({ id: 's2', branch: 'b2', branchStatus: 'open', statusChip: 'open' }),
      makeSession({ id: 's3', branch: 'b3', branchStatus: 'merged', statusChip: 'merged' }),
      makeSession({ id: 's4', branch: 'b4', branchStatus: 'closed', statusChip: 'closed' }),
    ])
    render(<SessionList {...makeProps()} />)
    expect(screen.getByText('PUSHED')).toBeTruthy()
    expect(screen.getByText('PR OPEN')).toBeTruthy()
    expect(screen.getByText('MERGED')).toBeTruthy()
    expect(screen.getByText('CLOSED')).toBeTruthy()
  })

  it('does not show chip for in-progress status', () => {
    setSessions([makeSession({ id: 's1', branch: 'b1', branchStatus: 'in-progress' })])
    render(<SessionList {...makeProps()} />)
    expect(screen.queryByText('IN-PROGRESS')).toBeNull()
  })

  it('calls onSelectSession when clicking a session', () => {
    setSessions([makeSession({ id: 's1', branch: 'b1' })])
    const props = makeProps()
    render(<SessionList {...props} />)
    fireEvent.click(screen.getByText('b1'))
    expect(props.onSelectSession).toHaveBeenCalledWith('s1')
  })

  it('calls onNewSession when clicking New Session button', () => {
    const props = makeProps()
    render(<SessionList {...props} />)
    fireEvent.click(screen.getByText('+ New Session'))
    expect(props.onNewSession).toHaveBeenCalled()
  })

  it('shows archived section when there are archived sessions', () => {
    setSessions([
      makeSession({ id: 's1', branch: 'active', isArchived: false }),
      makeSession({ id: 's2', branch: 'archived', isArchived: true }),
    ])
    render(<SessionList {...makeProps()} />)
    expect(screen.getByText(/Archived \(1\)/)).toBeTruthy()
  })

  it('toggles archived section visibility on click', () => {
    setSessions([
      makeSession({ id: 's1', branch: 'active', isArchived: false }),
      makeSession({ id: 's2', branch: 'archived-branch', isArchived: true }),
    ])
    render(<SessionList {...makeProps()} />)

    // Archived sessions not visible initially
    expect(screen.queryByText('archived-branch')).toBeNull()

    // Click to expand
    fireEvent.click(screen.getByText(/Archived \(1\)/))
    expect(screen.getByText('archived-branch')).toBeTruthy()
  })

  it('shows PR number when available', () => {
    setSessions([makeSession({ id: 's1', branch: 'b1', prNumber: 123 })])
    render(<SessionList {...makeProps()} />)
    expect(screen.getByText('PR #123')).toBeTruthy()
  })

  it('shows Review chip for review sessions', () => {
    setSessions([makeSession({ id: 's1', branch: 'b1', sessionType: 'review' })])
    render(<SessionList {...makeProps()} />)
    expect(screen.getByText('Review')).toBeTruthy()
  })

  it('shows Reviewed chip for reviewed review sessions', () => {
    setSessions([makeSession({ id: 's1', branch: 'b1', sessionType: 'review', reviewStatus: 'reviewed' })])
    render(<SessionList {...makeProps()} />)
    expect(screen.getByText('Reviewed')).toBeTruthy()
    expect(screen.queryByText('Review')).toBeNull()
  })

  describe('keyboard navigation', () => {
    it('selects session on Enter key', () => {
      setSessions([makeSession({ id: 's1', branch: 'b1' })])
      const props = makeProps()
      const { container } = render(<SessionList {...props} />)
      const card = container.querySelector('[tabindex="0"]')!
      fireEvent.keyDown(card, { key: 'Enter' })
      expect(props.onSelectSession).toHaveBeenCalledWith('s1')
    })

    it('opens delete dialog on Delete key', () => {
      setSessions([makeSession({ id: 's1', branch: 'b1' })])
      render(<SessionList {...makeProps()} />)
      const card = screen.getByText('b1').closest('[tabindex="0"]')!
      fireEvent.keyDown(card, { key: 'Delete' })
      expect(screen.getByText('Delete Session')).toBeTruthy()
    })

    it('opens delete dialog on Backspace key', () => {
      setSessions([makeSession({ id: 's1', branch: 'b1' })])
      render(<SessionList {...makeProps()} />)
      const card = screen.getByText('b1').closest('[tabindex="0"]')!
      fireEvent.keyDown(card, { key: 'Backspace' })
      expect(screen.getByText('Delete Session')).toBeTruthy()
    })

    it('ArrowDown focuses next session card', () => {
      setSessions([
        makeSession({ id: 's1', branch: 'first' }),
        makeSession({ id: 's2', branch: 'second' }),
      ])
      const { container } = render(<SessionList {...makeProps()} />)
      const cards = container.querySelectorAll('[tabindex="0"]')
      const focusSpy = vi.spyOn(cards[1] as HTMLElement, 'focus')
      fireEvent.keyDown(cards[0], { key: 'ArrowDown' })
      expect(focusSpy).toHaveBeenCalled()
    })

    it('ArrowUp focuses previous session card', () => {
      setSessions([
        makeSession({ id: 's1', branch: 'first' }),
        makeSession({ id: 's2', branch: 'second' }),
      ])
      const { container } = render(<SessionList {...makeProps()} />)
      const cards = container.querySelectorAll('[tabindex="0"]')
      const focusSpy = vi.spyOn(cards[0] as HTMLElement, 'focus')
      fireEvent.keyDown(cards[1], { key: 'ArrowUp' })
      expect(focusSpy).toHaveBeenCalled()
    })
  })

  describe('delete dialog', () => {
    it('shows delete confirmation dialog', () => {
      setSessions([makeSession({ id: 's1', branch: 'del-branch' })])
      const { container } = render(<SessionList {...makeProps()} />)
      // Click delete button (the X button)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      expect(screen.getByText('Delete Session')).toBeTruthy()
    })

    it('calls onDeleteSession on confirm', () => {
      setSessions([makeSession({ id: 's1', branch: 'b1' })])
      const props = makeProps()
      const { container } = render(<SessionList {...props} />)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      fireEvent.click(screen.getByText('Delete'))
      expect(props.onDeleteSession).toHaveBeenCalledWith('s1', false)
    })

    it('closes delete dialog on cancel', () => {
      setSessions([makeSession({ id: 's1', branch: 'b1' })])
      const { container } = render(<SessionList {...makeProps()} />)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      expect(screen.getByText('Delete Session')).toBeTruthy()
      fireEvent.click(screen.getByText('Cancel'))
      expect(screen.queryByText('Delete Session')).toBeNull()
    })

    it('shows worktree checkbox for managed worktree sessions', () => {
      const repos = [{ id: 'r1', name: 'repo', remoteUrl: '', rootDir: '/repos/repo', defaultBranch: 'main' }]
      setSessions([makeSession({ id: 's1', branch: 'feature/x', repoId: 'r1' })])
      const { container } = render(<SessionList {...makeProps({ repos })} />)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      expect(screen.getByText('Delete worktree and folder')).toBeTruthy()
    })

    it('deletes with worktree when checkbox is checked for managed worktree', () => {
      const repos = [{ id: 'r1', name: 'repo', remoteUrl: '', rootDir: '/repos/repo', defaultBranch: 'main' }]
      setSessions([makeSession({ id: 's1', branch: 'feature/x', repoId: 'r1' })])
      const props = makeProps({ repos })
      const { container } = render(<SessionList {...props} />)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      // Checkbox is checked by default
      fireEvent.click(screen.getByText('Delete'))
      expect(props.onDeleteSession).toHaveBeenCalledWith('s1', true)
    })

    it('shows warning for in-progress managed worktree', () => {
      const repos = [{ id: 'r1', name: 'repo', remoteUrl: '', rootDir: '/repos/repo', defaultBranch: 'main' }]
      setSessions([makeSession({ id: 's1', branch: 'feature/x', repoId: 'r1', branchStatus: 'in-progress' })])
      const { container } = render(<SessionList {...makeProps({ repos })} />)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      expect(screen.getByText(/work in progress/)).toBeTruthy()
    })

    it('does not show warning for merged/closed sessions', () => {
      const repos = [{ id: 'r1', name: 'repo', remoteUrl: '', rootDir: '/repos/repo', defaultBranch: 'main' }]
      setSessions([makeSession({ id: 's1', branch: 'feature/x', repoId: 'r1', branchStatus: 'merged' })])
      const { container } = render(<SessionList {...makeProps({ repos })} />)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      expect(screen.queryByText(/work in progress/)).toBeNull()
    })
  })

  describe('archive actions', () => {
    it('calls onArchiveSession when archive button is clicked', () => {
      setSessions([makeSession({ id: 's1', branch: 'b1' })])
      const props = makeProps()
      const { container } = render(<SessionList {...props} />)
      const archiveBtn = container.querySelector('[title="Archive session"]')!
      fireEvent.click(archiveBtn)
      expect(props.onArchiveSession).toHaveBeenCalledWith('s1')
    })

    it('calls onUnarchiveSession when unarchive button is clicked on archived session', () => {
      setSessions([makeSession({ id: 's1', branch: 'archived-b', isArchived: true })])
      const props = makeProps()
      render(<SessionList {...props} />)
      // Expand archived section
      fireEvent.click(screen.getByText(/Archived \(1\)/))
      // Click unarchive button
      const unarchiveBtn = screen.getByTitle('Unarchive session')
      fireEvent.click(unarchiveBtn)
      expect(props.onUnarchiveSession).toHaveBeenCalledWith('s1')
    })

    it('unarchives and selects when clicking an archived session', () => {
      setSessions([makeSession({ id: 's1', branch: 'archived-b', isArchived: true })])
      const props = makeProps()
      render(<SessionList {...props} />)
      fireEvent.click(screen.getByText(/Archived \(1\)/))
      fireEvent.click(screen.getByText('archived-b'))
      expect(props.onUnarchiveSession).toHaveBeenCalledWith('s1')
      expect(props.onSelectSession).toHaveBeenCalledWith('s1')
    })
  })

  describe('refresh PR status', () => {
    it('renders refresh button when onRefreshPrStatus is provided', () => {
      render(<SessionList {...makeProps()} />)
      expect(screen.getByTitle('Refresh PR status for all sessions')).toBeTruthy()
    })

    it('does not render refresh button when onRefreshPrStatus is not provided', () => {
      render(<SessionList {...makeProps({ onRefreshPrStatus: undefined })} />)
      expect(screen.queryByTitle('Refresh PR status for all sessions')).toBeNull()
    })

    it('calls onRefreshPrStatus when refresh button is clicked', async () => {
      const props = makeProps()
      render(<SessionList {...props} />)
      fireEvent.click(screen.getByTitle('Refresh PR status for all sessions'))
      expect(props.onRefreshPrStatus).toHaveBeenCalled()
    })
  })

  describe('status indicators', () => {
    it('shows working spinner after debounce', async () => {
      vi.useFakeTimers()
      setSessions([makeSession({ id: 's1', branch: 'b1', status: 'working' })])
      const { container } = render(<SessionList {...makeProps()} />)
      // Spinner is debounced — not shown immediately
      expect(container.querySelector('.animate-spin')).toBeNull()
      // After 1.5s debounce, spinner appears
      await vi.advanceTimersByTimeAsync(1500)
      expect(container.querySelector('.animate-spin')).toBeTruthy()
      vi.useRealTimers()
    })

    it('shows error dot', () => {
      setSessions([makeSession({ id: 's1', branch: 'b1', status: 'error' })])
      const { container } = render(<SessionList {...makeProps()} />)
      expect(container.querySelector('.bg-status-error')).toBeTruthy()
    })

    it('shows EMPTY branch status chip', () => {
      setSessions([makeSession({ id: 's1', branch: 'b1', branchStatus: 'empty', statusChip: 'empty' })])
      render(<SessionList {...makeProps()} />)
      expect(screen.getByText('EMPTY')).toBeTruthy()
    })

    it('clears working spinner when status transitions to idle before debounce', async () => {
      vi.useFakeTimers()
      setSessions([makeSession({ id: 's1', branch: 'b1', status: 'working' })])
      const { container, rerender } = render(<SessionList {...makeProps()} />)
      // Advance part way — not yet 1.5s
      await vi.advanceTimersByTimeAsync(500)
      expect(container.querySelector('.animate-spin')).toBeNull()
      // Switch to idle before debounce fires
      useSessionStore.setState({
        sessions: [makeSession({ id: 's1', branch: 'b1', status: 'idle' })],
      })
      rerender(<SessionList {...makeProps()} />)
      await vi.advanceTimersByTimeAsync(2000)
      // Should still show idle, not working
      expect(container.querySelector('.animate-spin')).toBeNull()
      vi.useRealTimers()
    })
  })

  describe('session search', () => {
    it('renders search input', () => {
      render(<SessionList {...makeProps()} />)
      expect(screen.getByPlaceholderText('Search sessions...')).toBeTruthy()
    })

    it('filters sessions by branch name', () => {
      setSessions([
        makeSession({ id: 's1', branch: 'feature/auth' }),
        makeSession({ id: 's2', branch: 'fix/bug-42' }),
      ])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'auth' } })
      expect(screen.getByText('feature/auth')).toBeTruthy()
      expect(screen.queryByText('fix/bug-42')).toBeNull()
    })

    it('filters sessions by repo name', () => {
      setSessions([
        makeSession({ id: 's1', branch: 'b1', name: 'my-app' }),
        makeSession({ id: 's2', branch: 'b2', name: 'other-project' }),
      ])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'my-app' } })
      expect(screen.getByText('b1')).toBeTruthy()
      expect(screen.queryByText('b2')).toBeNull()
    })

    it('filters sessions by last message', () => {
      setSessions([
        makeSession({ id: 's1', branch: 'b1', lastMessage: 'Implementing auth' }),
        makeSession({ id: 's2', branch: 'b2', lastMessage: 'Running tests' }),
      ])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'tests' } })
      expect(screen.queryByText('b1')).toBeNull()
      expect(screen.getByText('b2')).toBeTruthy()
    })

    it('shows no matching sessions message when search has no results', () => {
      setSessions([makeSession({ id: 's1', branch: 'b1' })])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'nonexistent' } })
      expect(screen.getByText('No matching sessions.')).toBeTruthy()
    })

    it('Escape in search clears query and blurs', () => {
      setSessions([makeSession({ id: 's1', branch: 'b1' })])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'test' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect((input as HTMLInputElement).value).toBe('')
    })

    it('search is case-insensitive', () => {
      setSessions([makeSession({ id: 's1', branch: 'Feature/Auth' })])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'feature' } })
      expect(screen.getByText('Feature/Auth')).toBeTruthy()
    })

    it('filters sessions by PR title', () => {
      setSessions([
        makeSession({ id: 's1', branch: 'b1', prTitle: 'Add OAuth login' }),
        makeSession({ id: 's2', branch: 'b2', prTitle: 'Fix memory leak' }),
      ])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'oauth' } })
      expect(screen.getByText('b1')).toBeTruthy()
      expect(screen.queryByText('b2')).toBeNull()
    })

    it('filters sessions by issue title', () => {
      setSessions([
        makeSession({ id: 's1', branch: 'b1', issueTitle: 'Button not clickable' }),
        makeSession({ id: 's2', branch: 'b2', issueTitle: 'Slow load time' }),
      ])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'clickable' } })
      expect(screen.getByText('b1')).toBeTruthy()
      expect(screen.queryByText('b2')).toBeNull()
    })

    it('filters sessions by PR number', () => {
      setSessions([
        makeSession({ id: 's1', branch: 'b1', prNumber: 42 }),
        makeSession({ id: 's2', branch: 'b2', prNumber: 99 }),
      ])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: '42' } })
      expect(screen.getByText('b1')).toBeTruthy()
      expect(screen.queryByText('b2')).toBeNull()
    })

    it('filters sessions by PR number with # prefix', () => {
      setSessions([
        makeSession({ id: 's1', branch: 'b1', prNumber: 42 }),
        makeSession({ id: 's2', branch: 'b2', prNumber: 99 }),
      ])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: '#42' } })
      expect(screen.getByText('b1')).toBeTruthy()
      expect(screen.queryByText('b2')).toBeNull()
    })

    it('filters sessions by issue number', () => {
      setSessions([
        makeSession({ id: 's1', branch: 'b1', issueNumber: 7 }),
        makeSession({ id: 's2', branch: 'b2', issueNumber: 13 }),
      ])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: '#7' } })
      expect(screen.getByText('b1')).toBeTruthy()
      expect(screen.queryByText('b2')).toBeNull()
    })

    it('shows clear button when search has a value', () => {
      setSessions([makeSession({ id: 's1', branch: 'b1' })])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      expect(screen.queryByLabelText('Clear search')).toBeNull()
      fireEvent.change(input, { target: { value: 'foo' } })
      expect(screen.getByLabelText('Clear search')).toBeTruthy()
    })

    it('clear button resets the search query', () => {
      setSessions([makeSession({ id: 's1', branch: 'b1' })])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'foo' } })
      fireEvent.click(screen.getByLabelText('Clear search'))
      expect((input as HTMLInputElement).value).toBe('')
    })

    it('also filters archived sessions', () => {
      setSessions([
        makeSession({ id: 's1', branch: 'active-match', isArchived: false }),
        makeSession({ id: 's2', branch: 'archived-match', isArchived: true }),
        makeSession({ id: 's3', branch: 'archived-other', isArchived: true }),
      ])
      render(<SessionList {...makeProps()} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'match' } })

      // Active session should show
      expect(screen.getByText('active-match')).toBeTruthy()

      // Archived count should reflect filtering
      expect(screen.getByText(/Archived \(1\)/)).toBeTruthy()
    })
  })
})
