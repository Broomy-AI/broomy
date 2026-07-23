// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import SessionList from './SessionList'
import { useSessionStore } from '../../store/sessions'
import type { Session } from '../../store/sessions'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1', name: 'my-repo', directory: '/repos/my-repo', branch: 'feature/foo',
    status: 'idle', agentId: 'agent-1', panelVisibility: {}, showExplorer: true, showFileViewer: false,
    showDiff: false, selectedFilePath: null, planFilePath: null, fileViewerPosition: 'top',
    layoutSizes: { explorerWidth: 256, fileViewerSize: 300, userTerminalHeight: 192, diffPanelWidth: 320, tutorialPanelWidth: 320 },
    explorerFilter: 'files', lastMessage: null, lastMessageTime: null, isUnread: false, workingStartTime: null,
    recentFiles: [], searchHistory: [], terminalTabs: { tabs: [{ id: 'tab-1', name: 'Terminal' }], activeTabId: 'tab-1' },
    branchStatus: 'in-progress', hasFeedback: false, checksStatus: 'none', statusChip: 'in-progress',
    isArchived: false, stage: 'planning', isRestored: false, ...overrides,
  }
}

const repos = [
  { id: 'r-b', name: 'broomy', remoteUrl: '', rootDir: '/b', defaultBranch: 'main' },
  { id: 'r-a', name: 'acme-web', remoteUrl: '', rootDir: '/a', defaultBranch: 'main' },
]

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    repos,
    onSelectSession: vi.fn(), onNewSession: vi.fn(), onDeleteSession: vi.fn(),
    onRefreshPrStatus: vi.fn().mockResolvedValue(undefined),
    onArchiveSession: vi.fn(), onUnarchiveSession: vi.fn(), ...overrides,
  }
}

const reset = () => useSessionStore.setState({ sessions: [], activeSessionId: null, collapsedRepoGroups: [], sidebarFullOrder: [], sidebarVisibleOrder: [] })
beforeEach(() => { vi.clearAllMocks(); reset() })
afterEach(() => { cleanup(); reset() })

function headerButtons() {
  return screen.getAllByRole('button').filter((b) => b.getAttribute('aria-expanded') !== null)
}

describe('SessionList — repo grouping', () => {
  it('renders group headers A→Z with sessions sorted by branch', () => {
    useSessionStore.setState({ sessions: [
      makeSession({ id: '1', repoId: 'r-b', branch: 'spike/z' }),
      makeSession({ id: '2', repoId: 'r-a', branch: 'feature/x' }),
      makeSession({ id: '3', repoId: 'r-b', branch: 'feat/a' }),
    ] })
    render(<SessionList {...makeProps()} />)
    const labels = headerButtons().map((h) => h.getAttribute('aria-label') ?? '')
    expect(labels[0]).toContain('acme-web')
    expect(labels[1]).toContain('broomy')
    // within broomy: feat/a before spike/z
    const cards = Array.from(document.querySelectorAll('[data-session-card]'))
    const order = cards.map((c) => c.getAttribute('data-session-id'))
    expect(order).toEqual(['2', '3', '1'])
  })

  it('collapses a group on header click — persists the key and hides its cards', () => {
    useSessionStore.setState({ sessions: [makeSession({ id: '1', repoId: 'r-a', branch: 'feature/x' })] })
    render(<SessionList {...makeProps()} />)
    expect(screen.getByText('feature/x')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /acme-web/ }))
    expect(useSessionStore.getState().collapsedRepoGroups).toContain('repo:r-a')
    expect(screen.queryByText('feature/x')).toBeNull()
  })

  it('publishes full + visible order, keeping full but shrinking visible on collapse', () => {
    useSessionStore.setState({ sessions: [
      makeSession({ id: '1', repoId: 'r-a', branch: 'a' }),
      makeSession({ id: '2', repoId: 'r-b', branch: 'b' }),
    ] })
    render(<SessionList {...makeProps()} />)
    expect(useSessionStore.getState().sidebarFullOrder).toEqual(['1', '2'])
    expect(useSessionStore.getState().sidebarVisibleOrder).toEqual(['1', '2'])
    fireEvent.click(screen.getByRole('button', { name: /acme-web/ }))
    // full order is unchanged (directional scanning); only the visible subset shrinks.
    expect(useSessionStore.getState().sidebarFullOrder).toEqual(['1', '2'])
    expect(useSessionStore.getState().sidebarVisibleOrder).toEqual(['2'])
  })

  it('places a deleted-repo session under "Unknown repository"', () => {
    useSessionStore.setState({ sessions: [makeSession({ id: '1', repoId: 'gone', branch: 'x' })] })
    render(<SessionList {...makeProps({ repos: [] })} />)
    expect(screen.getByRole('button', { name: /Unknown repository/ })).toBeTruthy()
  })

  it('clusters a legacy "main" session with its repo instead of "No repo"', () => {
    // Sessions predating `repoId` (in practice the per-repo main worktree) carry only a
    // directory under the repo's rootDir.
    useSessionStore.setState({ sessions: [
      makeSession({ id: '1', repoId: undefined, directory: '/b/main', branch: 'main' }),
      makeSession({ id: '2', repoId: 'r-b', branch: 'feat/x' }),
    ] })
    render(<SessionList {...makeProps()} />)
    const labels = headerButtons().map((h) => h.getAttribute('aria-label') ?? '')
    expect(labels).toHaveLength(1)
    expect(labels[0]).toContain('broomy')
    expect(labels[0]).toContain('2 sessions')
    expect(screen.queryByRole('button', { name: /No repo/ })).toBeNull()
  })

  it('still shows "No repo" when the directory matches no repo root', () => {
    useSessionStore.setState({ sessions: [
      makeSession({ id: '1', repoId: undefined, directory: '/somewhere/else', branch: 'main' }),
    ] })
    render(<SessionList {...makeProps()} />)
    expect(screen.getByRole('button', { name: /No repo/ })).toBeTruthy()
  })

  it('clears the published order when the sidebar unmounts', () => {
    useSessionStore.setState({ sessions: [makeSession({ id: '1', repoId: 'r-a', branch: 'a' })] })
    const { unmount } = render(<SessionList {...makeProps()} />)
    expect(useSessionStore.getState().sidebarFullOrder).toEqual(['1'])
    unmount()
    expect(useSessionStore.getState().sidebarFullOrder).toEqual([])
    expect(useSessionStore.getState().sidebarVisibleOrder).toEqual([])
  })

  it('keeps the full order complete while searching (visible = matches only)', () => {
    useSessionStore.setState({ sessions: [
      makeSession({ id: '1', repoId: 'r-a', branch: 'alpha', name: 'Alpha' }),
      makeSession({ id: '2', repoId: 'r-a', branch: 'beta', name: 'Beta' }),
    ] })
    render(<SessionList {...makeProps()} />)
    fireEvent.change(screen.getByPlaceholderText('Search sessions...'), { target: { value: 'beta' } })
    // Full order still has BOTH (so directional Next/Prev works even when active is
    // filtered out); visible order is the match only.
    expect(useSessionStore.getState().sidebarFullOrder).toEqual(['1', '2'])
    expect(useSessionStore.getState().sidebarVisibleOrder).toEqual(['2'])
  })

  it('surfaces a matching archived session while searching (forced open, tagged)', () => {
    useSessionStore.setState({ sessions: [
      makeSession({ id: '1', repoId: 'r-a', branch: 'active-x', name: 'Active' }),
      makeSession({ id: '2', repoId: 'r-b', branch: 'archived-match', name: 'Archived', isArchived: true }),
    ] })
    render(<SessionList {...makeProps()} />)
    // Archived is collapsed by default → the archived session is hidden.
    expect(screen.queryByText('archived-match')).toBeNull()
    // Searching for it forces the Archived section open and tags it with its repo.
    fireEvent.change(screen.getByPlaceholderText('Search sessions...'), { target: { value: 'archived-match' } })
    expect(screen.getByText('archived-match')).toBeTruthy()
    expect(screen.getByText('broomy')).toBeTruthy() // repo tag for r-b
  })

  it('treats a whitespace-only query as no search (groups shown, not "no matches")', () => {
    useSessionStore.setState({ sessions: [makeSession({ id: '1', repoId: 'r-a', branch: 'alpha' })] })
    render(<SessionList {...makeProps()} />)
    fireEvent.change(screen.getByPlaceholderText('Search sessions...'), { target: { value: '   ' } })
    // grouping stays active + the session shows; the "no matches" empty state must NOT appear.
    expect(screen.getByText('alpha')).toBeTruthy()
    expect(screen.queryByText('No matching sessions.')).toBeNull()
    expect(headerButtons().length).toBeGreaterThan(0)
  })

  it('flattens to a filtered list with a neutral repo tag while searching', () => {
    useSessionStore.setState({ sessions: [
      makeSession({ id: '1', repoId: 'r-a', branch: 'feature/checkout', name: 'Checkout' }),
      makeSession({ id: '2', repoId: 'r-b', branch: 'other', name: 'Other' }),
    ] })
    render(<SessionList {...makeProps()} />)
    fireEvent.change(screen.getByPlaceholderText('Search sessions...'), { target: { value: 'checkout' } })
    // no group headers in search mode
    expect(headerButtons()).toHaveLength(0)
    // the neutral repo tag is shown, and the non-match is filtered out
    expect(screen.getByText('acme-web')).toBeTruthy()
    expect(screen.queryByText('other')).toBeNull()
  })

  it('renders a DISTINCT rail colour for each repo group (#148)', () => {
    useSessionStore.setState({ sessions: [
      makeSession({ id: '1', repoId: 'r-a', branch: 'a1' }),
      makeSession({ id: '2', repoId: 'r-b', branch: 'b1' }),
    ] })
    const { container } = render(<SessionList {...makeProps()} />)
    const rails = Array.from(container.querySelectorAll('div.ml-3.pl-2'))
      .map((el) => el.getAttribute('style') ?? '')
      .filter((s) => s.includes('border-left'))
    expect(rails).toHaveLength(2)
    expect(rails[0]).not.toBe(rails[1]) // two repos → two different rail colours reach the DOM
  })
})
