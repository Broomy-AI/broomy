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
    showAgentTerminal: true,
    showUserTerminal: true,
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
      reviewPanelWidth: 320,
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
})
