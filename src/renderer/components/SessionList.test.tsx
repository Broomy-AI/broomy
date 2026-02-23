// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import SessionList from './SessionList'
import type { Session } from '../store/sessions'

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
    terminalTabs: { tabs: [{ id: 'tab-1', name: 'Terminal' }], activeTabId: 'tab-1' },
    branchStatus: 'in-progress',
    isArchived: false,
    ...overrides,
  }
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    sessions: [] as Session[],
    activeSessionId: null as string | null,
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

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
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
    render(<SessionList {...makeProps({ sessions })} />)
    expect(screen.getByText('feature/auth')).toBeTruthy()
    expect(screen.getByText('fix/bug-42')).toBeTruthy()
  })

  it('highlights active session', () => {
    const sessions = [
      makeSession({ id: 's1', branch: 'active-branch' }),
      makeSession({ id: 's2', branch: 'other-branch' }),
    ]
    const { container } = render(
      <SessionList {...makeProps({ sessions, activeSessionId: 's1' })} />
    )
    const sessionCards = container.querySelectorAll('[tabindex="0"]')
    expect(sessionCards[0].className).toContain('bg-accent')
    expect(sessionCards[1].className).not.toContain('bg-accent')
  })

  it('shows unread indicator with bold text', () => {
    const sessions = [makeSession({ id: 's1', branch: 'unread-branch', isUnread: true })]
    render(<SessionList {...makeProps({ sessions })} />)
    const branchText = screen.getByText('unread-branch')
    expect(branchText.className).toContain('font-bold')
  })

  it('shows status labels for sessions without messages', () => {
    const sessions = [makeSession({ id: 's1', branch: 'b1', status: 'idle', lastMessage: null })]
    render(<SessionList {...makeProps({ sessions })} />)
    expect(screen.getByText('Idle')).toBeTruthy()
  })

  it('shows last message when available', () => {
    const sessions = [makeSession({ id: 's1', branch: 'b1', lastMessage: 'Reading file.ts' })]
    render(<SessionList {...makeProps({ sessions })} />)
    expect(screen.getByText(/"Reading file.ts"/)).toBeTruthy()
  })

  it('shows branch status chips', () => {
    const sessions = [
      makeSession({ id: 's1', branch: 'b1', branchStatus: 'pushed' }),
      makeSession({ id: 's2', branch: 'b2', branchStatus: 'open' }),
      makeSession({ id: 's3', branch: 'b3', branchStatus: 'merged' }),
      makeSession({ id: 's4', branch: 'b4', branchStatus: 'closed' }),
    ]
    render(<SessionList {...makeProps({ sessions })} />)
    expect(screen.getByText('PUSHED')).toBeTruthy()
    expect(screen.getByText('PR OPEN')).toBeTruthy()
    expect(screen.getByText('MERGED')).toBeTruthy()
    expect(screen.getByText('CLOSED')).toBeTruthy()
  })

  it('does not show chip for in-progress status', () => {
    const sessions = [makeSession({ id: 's1', branch: 'b1', branchStatus: 'in-progress' })]
    render(<SessionList {...makeProps({ sessions })} />)
    expect(screen.queryByText('IN-PROGRESS')).toBeNull()
  })

  it('calls onSelectSession when clicking a session', () => {
    const props = makeProps({ sessions: [makeSession({ id: 's1', branch: 'b1' })] })
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
    const sessions = [
      makeSession({ id: 's1', branch: 'active', isArchived: false }),
      makeSession({ id: 's2', branch: 'archived', isArchived: true }),
    ]
    render(<SessionList {...makeProps({ sessions })} />)
    expect(screen.getByText(/Archived \(1\)/)).toBeTruthy()
  })

  it('toggles archived section visibility on click', () => {
    const sessions = [
      makeSession({ id: 's1', branch: 'active', isArchived: false }),
      makeSession({ id: 's2', branch: 'archived-branch', isArchived: true }),
    ]
    render(<SessionList {...makeProps({ sessions })} />)

    // Archived sessions not visible initially
    expect(screen.queryByText('archived-branch')).toBeNull()

    // Click to expand
    fireEvent.click(screen.getByText(/Archived \(1\)/))
    expect(screen.getByText('archived-branch')).toBeTruthy()
  })

  it('shows PR number when available', () => {
    const sessions = [makeSession({ id: 's1', branch: 'b1', prNumber: 123 })]
    render(<SessionList {...makeProps({ sessions })} />)
    expect(screen.getByText('PR #123')).toBeTruthy()
  })

  it('shows Review chip for review sessions', () => {
    const sessions = [makeSession({ id: 's1', branch: 'b1', sessionType: 'review' })]
    render(<SessionList {...makeProps({ sessions })} />)
    expect(screen.getByText('Review')).toBeTruthy()
  })

  describe('keyboard navigation', () => {
    it('selects session on Enter key', () => {
      const props = makeProps({ sessions: [makeSession({ id: 's1', branch: 'b1' })] })
      const { container } = render(<SessionList {...props} />)
      const card = container.querySelector('[tabindex="0"]')!
      fireEvent.keyDown(card, { key: 'Enter' })
      expect(props.onSelectSession).toHaveBeenCalledWith('s1')
    })

    it('opens delete dialog on Delete key', () => {
      const sessions = [makeSession({ id: 's1', branch: 'b1' })]
      render(<SessionList {...makeProps({ sessions })} />)
      const card = screen.getByText('b1').closest('[tabindex="0"]')!
      fireEvent.keyDown(card, { key: 'Delete' })
      expect(screen.getByText('Delete Session')).toBeTruthy()
    })

    it('opens delete dialog on Backspace key', () => {
      const sessions = [makeSession({ id: 's1', branch: 'b1' })]
      render(<SessionList {...makeProps({ sessions })} />)
      const card = screen.getByText('b1').closest('[tabindex="0"]')!
      fireEvent.keyDown(card, { key: 'Backspace' })
      expect(screen.getByText('Delete Session')).toBeTruthy()
    })
  })

  describe('delete dialog', () => {
    it('shows delete confirmation dialog', () => {
      const sessions = [makeSession({ id: 's1', branch: 'del-branch' })]
      const { container } = render(<SessionList {...makeProps({ sessions })} />)
      // Click delete button (the X button)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      expect(screen.getByText('Delete Session')).toBeTruthy()
    })

    it('calls onDeleteSession on confirm', () => {
      const sessions = [makeSession({ id: 's1', branch: 'b1' })]
      const props = makeProps({ sessions })
      const { container } = render(<SessionList {...props} />)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      fireEvent.click(screen.getByText('Delete'))
      expect(props.onDeleteSession).toHaveBeenCalledWith('s1', false)
    })

    it('closes delete dialog on cancel', () => {
      const sessions = [makeSession({ id: 's1', branch: 'b1' })]
      const { container } = render(<SessionList {...makeProps({ sessions })} />)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      expect(screen.getByText('Delete Session')).toBeTruthy()
      fireEvent.click(screen.getByText('Cancel'))
      expect(screen.queryByText('Delete Session')).toBeNull()
    })

    it('shows worktree checkbox for managed worktree sessions', () => {
      const repos = [{ id: 'r1', name: 'repo', remoteUrl: '', rootDir: '/repos/repo', defaultBranch: 'main' }]
      const sessions = [makeSession({ id: 's1', branch: 'feature/x', repoId: 'r1' })]
      const { container } = render(<SessionList {...makeProps({ sessions, repos })} />)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      expect(screen.getByText('Delete worktree and folder')).toBeTruthy()
    })

    it('deletes with worktree when checkbox is checked for managed worktree', () => {
      const repos = [{ id: 'r1', name: 'repo', remoteUrl: '', rootDir: '/repos/repo', defaultBranch: 'main' }]
      const sessions = [makeSession({ id: 's1', branch: 'feature/x', repoId: 'r1' })]
      const props = makeProps({ sessions, repos })
      const { container } = render(<SessionList {...props} />)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      // Checkbox is checked by default
      fireEvent.click(screen.getByText('Delete'))
      expect(props.onDeleteSession).toHaveBeenCalledWith('s1', true)
    })

    it('shows warning for in-progress managed worktree', () => {
      const repos = [{ id: 'r1', name: 'repo', remoteUrl: '', rootDir: '/repos/repo', defaultBranch: 'main' }]
      const sessions = [makeSession({ id: 's1', branch: 'feature/x', repoId: 'r1', branchStatus: 'in-progress' })]
      const { container } = render(<SessionList {...makeProps({ sessions, repos })} />)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      expect(screen.getByText(/work in progress/)).toBeTruthy()
    })

    it('does not show warning for merged/closed sessions', () => {
      const repos = [{ id: 'r1', name: 'repo', remoteUrl: '', rootDir: '/repos/repo', defaultBranch: 'main' }]
      const sessions = [makeSession({ id: 's1', branch: 'feature/x', repoId: 'r1', branchStatus: 'merged' })]
      const { container } = render(<SessionList {...makeProps({ sessions, repos })} />)
      const deleteBtn = container.querySelector('[title="Delete session"]')!
      fireEvent.click(deleteBtn)
      expect(screen.queryByText(/work in progress/)).toBeNull()
    })
  })

  describe('archive actions', () => {
    it('calls onArchiveSession when archive button is clicked', () => {
      const sessions = [makeSession({ id: 's1', branch: 'b1' })]
      const props = makeProps({ sessions })
      const { container } = render(<SessionList {...props} />)
      const archiveBtn = container.querySelector('[title="Archive session"]')!
      fireEvent.click(archiveBtn)
      expect(props.onArchiveSession).toHaveBeenCalledWith('s1')
    })

    it('calls onUnarchiveSession when unarchive button is clicked on archived session', () => {
      const sessions = [makeSession({ id: 's1', branch: 'archived-b', isArchived: true })]
      const props = makeProps({ sessions })
      render(<SessionList {...props} />)
      // Expand archived section
      fireEvent.click(screen.getByText(/Archived \(1\)/))
      // Click unarchive button
      const unarchiveBtn = screen.getByTitle('Unarchive session')
      fireEvent.click(unarchiveBtn)
      expect(props.onUnarchiveSession).toHaveBeenCalledWith('s1')
    })

    it('unarchives and selects when clicking an archived session', () => {
      const sessions = [makeSession({ id: 's1', branch: 'archived-b', isArchived: true })]
      const props = makeProps({ sessions })
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
    it('shows working spinner', () => {
      const sessions = [makeSession({ id: 's1', branch: 'b1', status: 'working' })]
      const { container } = render(<SessionList {...makeProps({ sessions })} />)
      expect(container.querySelector('.animate-spin')).toBeTruthy()
    })

    it('shows error dot', () => {
      const sessions = [makeSession({ id: 's1', branch: 'b1', status: 'error' })]
      const { container } = render(<SessionList {...makeProps({ sessions })} />)
      expect(container.querySelector('.bg-status-error')).toBeTruthy()
    })

    it('shows EMPTY branch status chip', () => {
      const sessions = [makeSession({ id: 's1', branch: 'b1', branchStatus: 'empty' })]
      render(<SessionList {...makeProps({ sessions })} />)
      expect(screen.getByText('EMPTY')).toBeTruthy()
    })
  })

  describe('session search', () => {
    it('renders search input', () => {
      render(<SessionList {...makeProps()} />)
      expect(screen.getByPlaceholderText('Search sessions...')).toBeTruthy()
    })

    it('filters sessions by branch name', () => {
      const sessions = [
        makeSession({ id: 's1', branch: 'feature/auth' }),
        makeSession({ id: 's2', branch: 'fix/bug-42' }),
      ]
      render(<SessionList {...makeProps({ sessions })} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'auth' } })
      expect(screen.getByText('feature/auth')).toBeTruthy()
      expect(screen.queryByText('fix/bug-42')).toBeNull()
    })

    it('filters sessions by repo name', () => {
      const sessions = [
        makeSession({ id: 's1', branch: 'b1', name: 'my-app' }),
        makeSession({ id: 's2', branch: 'b2', name: 'other-project' }),
      ]
      render(<SessionList {...makeProps({ sessions })} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'my-app' } })
      expect(screen.getByText('b1')).toBeTruthy()
      expect(screen.queryByText('b2')).toBeNull()
    })

    it('filters sessions by last message', () => {
      const sessions = [
        makeSession({ id: 's1', branch: 'b1', lastMessage: 'Implementing auth' }),
        makeSession({ id: 's2', branch: 'b2', lastMessage: 'Running tests' }),
      ]
      render(<SessionList {...makeProps({ sessions })} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'tests' } })
      expect(screen.queryByText('b1')).toBeNull()
      expect(screen.getByText('b2')).toBeTruthy()
    })

    it('shows no matching sessions message when search has no results', () => {
      const sessions = [makeSession({ id: 's1', branch: 'b1' })]
      render(<SessionList {...makeProps({ sessions })} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'nonexistent' } })
      expect(screen.getByText('No matching sessions.')).toBeTruthy()
    })

    it('Escape in search clears query and blurs', () => {
      const sessions = [makeSession({ id: 's1', branch: 'b1' })]
      render(<SessionList {...makeProps({ sessions })} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'test' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect((input as HTMLInputElement).value).toBe('')
    })

    it('search is case-insensitive', () => {
      const sessions = [makeSession({ id: 's1', branch: 'Feature/Auth' })]
      render(<SessionList {...makeProps({ sessions })} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'feature' } })
      expect(screen.getByText('Feature/Auth')).toBeTruthy()
    })

    it('also filters archived sessions', () => {
      const sessions = [
        makeSession({ id: 's1', branch: 'active-match', isArchived: false }),
        makeSession({ id: 's2', branch: 'archived-match', isArchived: true }),
        makeSession({ id: 's3', branch: 'archived-other', isArchived: true }),
      ]
      render(<SessionList {...makeProps({ sessions })} />)
      const input = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(input, { target: { value: 'match' } })

      // Active session should show
      expect(screen.getByText('active-match')).toBeTruthy()

      // Archived count should reflect filtering
      expect(screen.getByText(/Archived \(1\)/)).toBeTruthy()
    })
  })
})
