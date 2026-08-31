// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../test/react-setup'
import SessionCard from './SessionCard'
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
    reviewState: 'none' as const,
    statusChip: 'in-progress' as StatusChip,
    isArchived: false,
    isPaused: false,
    stage: 'planning',
    isRestored: false,
    ...overrides,
  }
}

interface RenderCardOptions {
  session: Session
  onPause?: (e: React.MouseEvent, sessionId: string) => void
  onArchive?: (e: React.MouseEvent, sessionId: string) => void
}

/** Seeds the session store with a single session, then renders SessionCard for it. */
function renderCard({ session, onPause, onArchive }: RenderCardOptions) {
  useSessionStore.setState({ sessions: [session] })
  return render(
    <SessionCard
      sessionId={session.id}
      onSelect={vi.fn()}
      onDelete={vi.fn()}
      onArchive={onArchive}
      onPause={onPause}
    />
  )
}

afterEach(() => {
  cleanup()
  useSessionStore.setState({ sessions: [], activeSessionId: null })
})

beforeEach(() => {
  vi.clearAllMocks()
  useSessionStore.setState({ sessions: [], activeSessionId: null })
})

describe('SessionCard', () => {
  it('shows a pause button for a running session', async () => {
    const onPause = vi.fn()
    renderCard({ session: makeSession({ id: 'a', isPaused: false }), onPause })

    await userEvent.click(screen.getByTitle('Pause session'))

    expect(onPause).toHaveBeenCalledWith(expect.anything(), 'a')
  })

  it('shows a resume button for a paused session', () => {
    renderCard({ session: makeSession({ id: 'a', isPaused: true }), onPause: vi.fn() })

    expect(screen.getByTitle('Resume session')).toBeInTheDocument()
  })

  it('dims a paused card', () => {
    const { container } = renderCard({ session: makeSession({ id: 'a', isPaused: true }), onPause: vi.fn() })

    expect(container.querySelector('[data-session-card]')!.className).toContain('opacity-60')
  })

  it('does not dim a running card', () => {
    const { container } = renderCard({ session: makeSession({ id: 'a', isPaused: false }), onPause: vi.fn() })

    expect(container.querySelector('[data-session-card]')!.className).not.toContain('opacity-60')
  })

  it('does not show a pause button when onPause is not provided', () => {
    renderCard({ session: makeSession({ id: 'a', isPaused: false }) })

    expect(screen.queryByTitle('Pause session')).toBeNull()
  })
})
