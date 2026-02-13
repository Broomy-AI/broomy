import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../../test/setup'
import { useSessionStore } from '../store/sessions'
import { PANEL_IDS } from '../panels/types'

beforeEach(() => {
  vi.clearAllMocks()
  useSessionStore.setState({
    sessions: [],
    activeSessionId: null,
    isLoading: false,
    showSidebar: true,
    showSettings: false,
    sidebarWidth: 224,
    toolbarPanels: [PANEL_IDS.SIDEBAR, PANEL_IDS.EXPLORER, PANEL_IDS.FILE_VIEWER, PANEL_IDS.AGENT_TERMINAL, PANEL_IDS.USER_TERMINAL, PANEL_IDS.SETTINGS],
    globalPanelVisibility: { [PANEL_IDS.SIDEBAR]: true, [PANEL_IDS.SETTINGS]: false },
  })
  vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
  vi.mocked(window.git.getBranch).mockResolvedValue('feature/test')
  vi.mocked(window.config.load).mockResolvedValue({ agents: [], sessions: [], repos: [] })
  vi.mocked(window.config.save).mockResolvedValue({ success: true })
})

describe('Session lifecycle integration', () => {
  it('create session → becomes active → has correct defaults', async () => {
    const store = useSessionStore.getState()
    await store.addSession('/repos/my-project', 'agent-1')

    const state = useSessionStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.activeSessionId).toBe(state.sessions[0].id)
    expect(state.sessions[0].name).toBe('my-project')
    expect(state.sessions[0].branch).toBe('feature/test')
    expect(state.sessions[0].status).toBe('idle')
    expect(state.sessions[0].panelVisibility[PANEL_IDS.AGENT_TERMINAL]).toBe(true)
    expect(state.sessions[0].panelVisibility[PANEL_IDS.USER_TERMINAL]).toBe(true)
    expect(state.sessions[0].panelVisibility[PANEL_IDS.EXPLORER]).toBe(true)
    expect(state.sessions[0].panelVisibility[PANEL_IDS.FILE_VIEWER]).toBe(false)
  })

  it('adding a second session makes it active', async () => {
    const store = useSessionStore.getState()
    await store.addSession('/repos/first', 'agent-1')
    const firstId = useSessionStore.getState().sessions[0].id

    await useSessionStore.getState().addSession('/repos/second', 'agent-1')
    const state = useSessionStore.getState()
    expect(state.sessions).toHaveLength(2)
    expect(state.activeSessionId).not.toBe(firstId)
    expect(state.activeSessionId).toBe(state.sessions[1].id)
  })

  it('switch sessions preserves panel visibility per session', async () => {
    const store = useSessionStore.getState()
    await store.addSession('/repos/first', 'agent-1')
    const firstId = useSessionStore.getState().sessions[0].id

    await useSessionStore.getState().addSession('/repos/second', 'agent-1')
    const secondId = useSessionStore.getState().sessions[1].id

    // Toggle explorer off on second session
    useSessionStore.getState().togglePanel(secondId, PANEL_IDS.EXPLORER)

    // Switch to first session
    useSessionStore.getState().setActiveSession(firstId)

    // First session still has explorer on
    const first = useSessionStore.getState().sessions.find(s => s.id === firstId)!
    expect(first.panelVisibility[PANEL_IDS.EXPLORER]).toBe(true)

    // Second session has explorer off
    const second = useSessionStore.getState().sessions.find(s => s.id === secondId)!
    expect(second.panelVisibility[PANEL_IDS.EXPLORER]).toBe(false)
  })

  it('delete active session → next session becomes active', async () => {
    const store = useSessionStore.getState()
    await store.addSession('/repos/first', 'agent-1')
    const firstId = useSessionStore.getState().sessions[0].id

    await useSessionStore.getState().addSession('/repos/second', 'agent-1')
    const secondId = useSessionStore.getState().sessions[1].id

    // Second is active, delete it
    expect(useSessionStore.getState().activeSessionId).toBe(secondId)
    useSessionStore.getState().removeSession(secondId)

    const state = useSessionStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.activeSessionId).toBe(firstId)
  })

  it('delete last session → activeSessionId becomes null', async () => {
    const store = useSessionStore.getState()
    await store.addSession('/repos/only', 'agent-1')
    const onlyId = useSessionStore.getState().sessions[0].id

    useSessionStore.getState().removeSession(onlyId)

    const state = useSessionStore.getState()
    expect(state.sessions).toHaveLength(0)
    expect(state.activeSessionId).toBeNull()
  })

  it('archive session → unarchive restores it', async () => {
    const store = useSessionStore.getState()
    await store.addSession('/repos/project', 'agent-1')
    const sessionId = useSessionStore.getState().sessions[0].id

    useSessionStore.getState().archiveSession(sessionId)
    expect(useSessionStore.getState().sessions[0].isArchived).toBe(true)

    useSessionStore.getState().unarchiveSession(sessionId)
    expect(useSessionStore.getState().sessions[0].isArchived).toBe(false)
  })

  it('agent monitoring: working → idle transition marks as unread after 3s', async () => {
    vi.useFakeTimers()
    try {
      const store = useSessionStore.getState()
      await store.addSession('/repos/project', 'agent-1')
      const sessionId = useSessionStore.getState().sessions[0].id

      // Simulate agent working
      useSessionStore.getState().updateAgentMonitor(sessionId, { status: 'working', lastMessage: 'Reading file...' })
      expect(useSessionStore.getState().sessions[0].status).toBe('working')

      // Advance time past the 3-second minimum working duration
      vi.advanceTimersByTime(4000)

      // Simulate agent going idle — should mark as unread since working > 3s
      useSessionStore.getState().updateAgentMonitor(sessionId, { status: 'idle' })
      const session = useSessionStore.getState().sessions[0]
      expect(session.status).toBe('idle')
      expect(session.isUnread).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('brief working period does not mark as unread', async () => {
    const store = useSessionStore.getState()
    await store.addSession('/repos/project', 'agent-1')
    const sessionId = useSessionStore.getState().sessions[0].id

    // Working then immediately idle (< 3s)
    useSessionStore.getState().updateAgentMonitor(sessionId, { status: 'working' })
    useSessionStore.getState().updateAgentMonitor(sessionId, { status: 'idle' })

    expect(useSessionStore.getState().sessions[0].isUnread).toBe(false)
  })

  it('review session has different default panel visibility', async () => {
    const store = useSessionStore.getState()
    await store.addSession('/repos/review-project', 'agent-1', {
      sessionType: 'review',
      prNumber: 42,
      prTitle: 'Fix bug',
      prUrl: 'https://github.com/org/repo/pull/42',
    })

    const session = useSessionStore.getState().sessions[0]
    expect(session.sessionType).toBe('review')
    expect(session.prNumber).toBe(42)
    expect(session.panelVisibility[PANEL_IDS.AGENT_TERMINAL]).toBe(true)
    expect(session.panelVisibility[PANEL_IDS.USER_TERMINAL]).toBe(false)
    expect(session.panelVisibility[PANEL_IDS.EXPLORER]).toBe(false)
  })

  it('loadSessions hydrates from config', async () => {
    vi.mocked(window.config.load).mockResolvedValue({
      agents: [],
      repos: [],
      sessions: [
        {
          id: 'existing-1',
          name: 'my-repo',
          directory: '/repos/my-repo',
          agentId: 'agent-1',
          panelVisibility: {
            [PANEL_IDS.AGENT_TERMINAL]: true,
            [PANEL_IDS.USER_TERMINAL]: false,
            [PANEL_IDS.EXPLORER]: true,
            [PANEL_IDS.FILE_VIEWER]: false,
          },
        },
      ],
    })
    vi.mocked(window.git.getBranch).mockResolvedValue('main')

    await useSessionStore.getState().loadSessions('test-profile')

    const state = useSessionStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0].id).toBe('existing-1')
    expect(state.sessions[0].branch).toBe('main')
    expect(state.activeSessionId).toBe('existing-1')
  })
})
