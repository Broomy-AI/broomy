import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSessionStore } from './sessions'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/types'

describe('useSessionStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
      isLoading: true,
      showSidebar: true,
      showSettings: false,
      sidebarWidth: 224,
      toolbarPanels: [...DEFAULT_TOOLBAR_PANELS],
      globalPanelVisibility: {
        [PANEL_IDS.SIDEBAR]: true,
        [PANEL_IDS.SETTINGS]: false,
      },
    })
    vi.mocked(window.config.load).mockResolvedValue({
      agents: [],
      sessions: [],
    })
    vi.mocked(window.config.save).mockResolvedValue({ success: true })
    vi.mocked(window.git.getBranch).mockResolvedValue('main')
    vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Helper to create a session in the store
  function createTestSession(overrides: Partial<{ id: string; name: string; directory: string }> = {}) {
    const id = overrides.id ?? 'test-session'
    const session = {
      id,
      name: overrides.name ?? 'test',
      directory: overrides.directory ?? '/test/dir',
      branch: 'main',
      status: 'idle' as const,
      agentId: null,
      panelVisibility: {
        [PANEL_IDS.AGENT_TERMINAL]: true,
        [PANEL_IDS.USER_TERMINAL]: false,
        [PANEL_IDS.EXPLORER]: false,
        [PANEL_IDS.FILE_VIEWER]: false,
      },
      showAgentTerminal: true,
      showUserTerminal: false,
      showExplorer: false,
      showFileViewer: false,
      showDiff: false,
      selectedFilePath: null,
      fileViewerPosition: 'top' as const,
      layoutSizes: {
        explorerWidth: 256,
        fileViewerSize: 300,
        userTerminalHeight: 192,
        diffPanelWidth: 320,
      },
      explorerFilter: 'files' as const,
      lastMessage: null,
      lastMessageTime: null,
      isUnread: false,
      recentFiles: [],
      terminalTabs: {
        tabs: [{ id: 'tab-1', name: 'Terminal' }],
        activeTabId: 'tab-1',
      },
    }
    return session
  }

  describe('loadSessions', () => {
    it('loads sessions from config', async () => {
      vi.mocked(window.config.load).mockResolvedValue({
        agents: [],
        sessions: [
          { id: 's1', name: 'Session 1', directory: '/repo1' },
        ],
      })
      vi.mocked(window.git.getBranch).mockResolvedValue('feature/test')

      await useSessionStore.getState().loadSessions()
      const state = useSessionStore.getState()
      expect(state.sessions).toHaveLength(1)
      expect(state.sessions[0].name).toBe('Session 1')
      expect(state.sessions[0].branch).toBe('feature/test')
      expect(state.activeSessionId).toBe('s1')
      expect(state.isLoading).toBe(false)
    })

    it('migrates legacy explorerFilter "all" to "files"', async () => {
      vi.mocked(window.config.load).mockResolvedValue({
        agents: [],
        sessions: [
          { id: 's1', name: 'S', directory: '/d', explorerFilter: 'all' },
        ],
      })

      await useSessionStore.getState().loadSessions()
      expect(useSessionStore.getState().sessions[0].explorerFilter).toBe('files')
    })

    it('migrates legacy explorerFilter "changed" to "source-control"', async () => {
      vi.mocked(window.config.load).mockResolvedValue({
        agents: [],
        sessions: [
          { id: 's1', name: 'S', directory: '/d', explorerFilter: 'changed' },
        ],
      })

      await useSessionStore.getState().loadSessions()
      expect(useSessionStore.getState().sessions[0].explorerFilter).toBe('source-control')
    })

    it('creates panelVisibility from legacy fields', async () => {
      vi.mocked(window.config.load).mockResolvedValue({
        agents: [],
        sessions: [
          {
            id: 's1', name: 'S', directory: '/d',
            showAgentTerminal: true,
            showUserTerminal: true,
            showExplorer: false,
            showFileViewer: true,
          },
        ],
      })

      await useSessionStore.getState().loadSessions()
      const session = useSessionStore.getState().sessions[0]
      expect(session.panelVisibility[PANEL_IDS.AGENT_TERMINAL]).toBe(true)
      expect(session.panelVisibility[PANEL_IDS.USER_TERMINAL]).toBe(true)
      expect(session.panelVisibility[PANEL_IDS.EXPLORER]).toBe(false)
      expect(session.panelVisibility[PANEL_IDS.FILE_VIEWER]).toBe(true)
    })

    it('uses existing panelVisibility if present', async () => {
      const pv = { [PANEL_IDS.AGENT_TERMINAL]: false, [PANEL_IDS.USER_TERMINAL]: true }
      vi.mocked(window.config.load).mockResolvedValue({
        agents: [],
        sessions: [
          { id: 's1', name: 'S', directory: '/d', panelVisibility: pv },
        ],
      })

      await useSessionStore.getState().loadSessions()
      const session = useSessionStore.getState().sessions[0]
      expect(session.panelVisibility[PANEL_IDS.AGENT_TERMINAL]).toBe(false)
      expect(session.panelVisibility[PANEL_IDS.USER_TERMINAL]).toBe(true)
    })

    it('loads global panel state from config', async () => {
      vi.mocked(window.config.load).mockResolvedValue({
        agents: [],
        sessions: [],
        showSidebar: false,
        sidebarWidth: 300,
        toolbarPanels: ['sidebar', 'explorer'],
      })

      await useSessionStore.getState().loadSessions()
      const state = useSessionStore.getState()
      expect(state.showSidebar).toBe(false)
      expect(state.sidebarWidth).toBe(300)
      expect(state.toolbarPanels).toEqual(['sidebar', 'explorer'])
    })

    it('sets empty state on error', async () => {
      vi.mocked(window.config.load).mockRejectedValue(new Error('fail'))

      await useSessionStore.getState().loadSessions()
      const state = useSessionStore.getState()
      expect(state.sessions).toEqual([])
      expect(state.activeSessionId).toBeNull()
      expect(state.isLoading).toBe(false)
    })
  })

  describe('addSession', () => {
    it('adds a session and sets it as active', async () => {
      await useSessionStore.getState().addSession('/test/repo', 'agent-1')
      const state = useSessionStore.getState()
      expect(state.sessions).toHaveLength(1)
      expect(state.sessions[0].directory).toBe('/test/repo')
      expect(state.sessions[0].agentId).toBe('agent-1')
      expect(state.sessions[0].name).toBe('repo')
      expect(state.activeSessionId).toBe(state.sessions[0].id)
    })

    it('uses custom name when provided', async () => {
      await useSessionStore.getState().addSession('/test/repo', null, { name: 'Custom Name' })
      expect(useSessionStore.getState().sessions[0].name).toBe('Custom Name')
    })

    it('throws if directory is not a git repo', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(false)
      await expect(
        useSessionStore.getState().addSession('/not-a-repo', null)
      ).rejects.toThrow('not a git repository')
    })

    it('includes extra fields', async () => {
      await useSessionStore.getState().addSession('/test/repo', null, {
        repoId: 'r1',
        issueNumber: 42,
        issueTitle: 'Fix bug',
      })
      const session = useSessionStore.getState().sessions[0]
      expect(session.repoId).toBe('r1')
      expect(session.issueNumber).toBe(42)
      expect(session.issueTitle).toBe('Fix bug')
    })
  })

  describe('removeSession', () => {
    it('removes a session', async () => {
      const s1 = createTestSession({ id: 's1' })
      const s2 = createTestSession({ id: 's2' })
      useSessionStore.setState({ sessions: [s1, s2], activeSessionId: 's2', isLoading: false })

      await useSessionStore.getState().removeSession('s2')
      const state = useSessionStore.getState()
      expect(state.sessions).toHaveLength(1)
      expect(state.sessions[0].id).toBe('s1')
    })

    it('updates activeSessionId when removing active session', async () => {
      const s1 = createTestSession({ id: 's1' })
      const s2 = createTestSession({ id: 's2' })
      useSessionStore.setState({ sessions: [s1, s2], activeSessionId: 's1', isLoading: false })

      await useSessionStore.getState().removeSession('s1')
      expect(useSessionStore.getState().activeSessionId).toBe('s2')
    })

    it('sets activeSessionId to null when removing last session', async () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], activeSessionId: 's1', isLoading: false })

      await useSessionStore.getState().removeSession('s1')
      expect(useSessionStore.getState().activeSessionId).toBeNull()
    })
  })

  describe('setActiveSession', () => {
    it('sets the active session id', () => {
      useSessionStore.getState().setActiveSession('s2')
      expect(useSessionStore.getState().activeSessionId).toBe('s2')
    })

    it('accepts null', () => {
      useSessionStore.getState().setActiveSession(null)
      expect(useSessionStore.getState().activeSessionId).toBeNull()
    })
  })

  describe('panel visibility', () => {
    it('togglePanel toggles a session panel', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().togglePanel('s1', PANEL_IDS.EXPLORER)
      expect(useSessionStore.getState().sessions[0].panelVisibility[PANEL_IDS.EXPLORER]).toBe(true)
      expect(useSessionStore.getState().sessions[0].showExplorer).toBe(true)

      useSessionStore.getState().togglePanel('s1', PANEL_IDS.EXPLORER)
      expect(useSessionStore.getState().sessions[0].panelVisibility[PANEL_IDS.EXPLORER]).toBe(false)
      expect(useSessionStore.getState().sessions[0].showExplorer).toBe(false)
    })

    it('toggleGlobalPanel toggles sidebar', () => {
      useSessionStore.getState().toggleGlobalPanel(PANEL_IDS.SIDEBAR)
      expect(useSessionStore.getState().showSidebar).toBe(false)
      expect(useSessionStore.getState().globalPanelVisibility[PANEL_IDS.SIDEBAR]).toBe(false)

      useSessionStore.getState().toggleGlobalPanel(PANEL_IDS.SIDEBAR)
      expect(useSessionStore.getState().showSidebar).toBe(true)
    })

    it('toggleGlobalPanel toggles settings', () => {
      useSessionStore.getState().toggleGlobalPanel(PANEL_IDS.SETTINGS)
      expect(useSessionStore.getState().showSettings).toBe(true)
    })

    it('setPanelVisibility sets a specific panel', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().setPanelVisibility('s1', PANEL_IDS.FILE_VIEWER, true)
      expect(useSessionStore.getState().sessions[0].panelVisibility[PANEL_IDS.FILE_VIEWER]).toBe(true)
      expect(useSessionStore.getState().sessions[0].showFileViewer).toBe(true)
    })

    it('setToolbarPanels updates toolbar panels', () => {
      useSessionStore.getState().setToolbarPanels(['sidebar', 'explorer'])
      expect(useSessionStore.getState().toolbarPanels).toEqual(['sidebar', 'explorer'])
    })
  })

  describe('legacy toggle functions', () => {
    it('toggleSidebar toggles sidebar via global panel', () => {
      useSessionStore.getState().toggleSidebar()
      expect(useSessionStore.getState().showSidebar).toBe(false)
    })

    it('toggleAgentTerminal toggles agent terminal', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().toggleAgentTerminal('s1')
      expect(useSessionStore.getState().sessions[0].showAgentTerminal).toBe(false)
    })

    it('toggleUserTerminal toggles user terminal', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().toggleUserTerminal('s1')
      expect(useSessionStore.getState().sessions[0].showUserTerminal).toBe(true)
    })

    it('toggleExplorer toggles explorer', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().toggleExplorer('s1')
      expect(useSessionStore.getState().sessions[0].showExplorer).toBe(true)
    })

    it('toggleFileViewer toggles file viewer', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().toggleFileViewer('s1')
      expect(useSessionStore.getState().sessions[0].showFileViewer).toBe(true)
    })
  })

  describe('UI state actions', () => {
    it('selectFile sets selected file and opens file viewer', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().selectFile('s1', '/test/file.ts')
      const session = useSessionStore.getState().sessions[0]
      expect(session.selectedFilePath).toBe('/test/file.ts')
      expect(session.panelVisibility[PANEL_IDS.FILE_VIEWER]).toBe(true)
      expect(session.showFileViewer).toBe(true)
    })

    it('selectFile tracks recent files', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().selectFile('s1', '/a.ts')
      useSessionStore.getState().selectFile('s1', '/b.ts')
      useSessionStore.getState().selectFile('s1', '/a.ts') // re-select moves to front
      const session = useSessionStore.getState().sessions[0]
      expect(session.recentFiles[0]).toBe('/a.ts')
      expect(session.recentFiles[1]).toBe('/b.ts')
      expect(session.recentFiles).toHaveLength(2)
    })

    it('setFileViewerPosition updates position', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().setFileViewerPosition('s1', 'left')
      expect(useSessionStore.getState().sessions[0].fileViewerPosition).toBe('left')
    })

    it('updateLayoutSize updates a layout dimension', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().updateLayoutSize('s1', 'explorerWidth', 400)
      expect(useSessionStore.getState().sessions[0].layoutSizes.explorerWidth).toBe(400)
    })

    it('setExplorerFilter updates the filter', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().setExplorerFilter('s1', 'source-control')
      expect(useSessionStore.getState().sessions[0].explorerFilter).toBe('source-control')
    })

    it('setSidebarWidth updates width', () => {
      useSessionStore.getState().setSidebarWidth(300)
      expect(useSessionStore.getState().sidebarWidth).toBe(300)
    })
  })

  describe('agent monitoring', () => {
    it('updateAgentMonitor updates status', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().updateAgentMonitor('s1', { status: 'working' })
      expect(useSessionStore.getState().sessions[0].status).toBe('working')
    })

    it('updateAgentMonitor updates lastMessage', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().updateAgentMonitor('s1', { lastMessage: 'Reading file...' })
      const session = useSessionStore.getState().sessions[0]
      expect(session.lastMessage).toBe('Reading file...')
      expect(session.lastMessageTime).toBeGreaterThan(0)
    })

    it('marks as unread when transitioning from working to idle', () => {
      const s1 = { ...createTestSession({ id: 's1' }), status: 'working' as const }
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().updateAgentMonitor('s1', { status: 'idle' })
      expect(useSessionStore.getState().sessions[0].isUnread).toBe(true)
    })

    it('does not mark as unread when already idle', () => {
      const s1 = createTestSession({ id: 's1' }) // status is 'idle'
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().updateAgentMonitor('s1', { status: 'idle' })
      expect(useSessionStore.getState().sessions[0].isUnread).toBe(false)
    })

    it('markSessionRead clears unread flag', () => {
      const s1 = { ...createTestSession({ id: 's1' }), isUnread: true }
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().markSessionRead('s1')
      expect(useSessionStore.getState().sessions[0].isUnread).toBe(false)
    })
  })

  describe('terminal tabs', () => {
    it('addTerminalTab adds a tab and makes it active', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      const newTabId = useSessionStore.getState().addTerminalTab('s1')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs).toHaveLength(2)
      expect(session.terminalTabs.activeTabId).toBe(newTabId)
    })

    it('addTerminalTab uses custom name', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().addTerminalTab('s1', 'Build')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs[1].name).toBe('Build')
    })

    it('addTerminalTab auto-names with number', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().addTerminalTab('s1')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs[1].name).toBe('Terminal 2')
    })

    it('removeTerminalTab removes a tab', () => {
      const s1 = createTestSession({ id: 's1' })
      s1.terminalTabs = {
        tabs: [{ id: 't1', name: 'Tab 1' }, { id: 't2', name: 'Tab 2' }],
        activeTabId: 't1',
      }
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().removeTerminalTab('s1', 't2')
      expect(useSessionStore.getState().sessions[0].terminalTabs.tabs).toHaveLength(1)
    })

    it('removeTerminalTab does not remove the last tab', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().removeTerminalTab('s1', 'tab-1')
      expect(useSessionStore.getState().sessions[0].terminalTabs.tabs).toHaveLength(1)
    })

    it('removeTerminalTab selects adjacent tab when removing active', () => {
      const s1 = createTestSession({ id: 's1' })
      s1.terminalTabs = {
        tabs: [{ id: 't1', name: 'T1' }, { id: 't2', name: 'T2' }, { id: 't3', name: 'T3' }],
        activeTabId: 't2',
      }
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().removeTerminalTab('s1', 't2')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.activeTabId).toBe('t3')
    })

    it('removeTerminalTab selects left tab when removing rightmost active', () => {
      const s1 = createTestSession({ id: 's1' })
      s1.terminalTabs = {
        tabs: [{ id: 't1', name: 'T1' }, { id: 't2', name: 'T2' }],
        activeTabId: 't2',
      }
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().removeTerminalTab('s1', 't2')
      expect(useSessionStore.getState().sessions[0].terminalTabs.activeTabId).toBe('t1')
    })

    it('renameTerminalTab renames a tab', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().renameTerminalTab('s1', 'tab-1', 'Renamed')
      expect(useSessionStore.getState().sessions[0].terminalTabs.tabs[0].name).toBe('Renamed')
    })

    it('reorderTerminalTabs replaces tabs array', () => {
      const s1 = createTestSession({ id: 's1' })
      s1.terminalTabs = {
        tabs: [{ id: 't1', name: 'T1' }, { id: 't2', name: 'T2' }],
        activeTabId: 't1',
      }
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      const reordered = [{ id: 't2', name: 'T2' }, { id: 't1', name: 'T1' }]
      useSessionStore.getState().reorderTerminalTabs('s1', reordered)
      expect(useSessionStore.getState().sessions[0].terminalTabs.tabs).toEqual(reordered)
    })

    it('setActiveTerminalTab sets the active tab', () => {
      const s1 = createTestSession({ id: 's1' })
      s1.terminalTabs = {
        tabs: [{ id: 't1', name: 'T1' }, { id: 't2', name: 'T2' }],
        activeTabId: 't1',
      }
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().setActiveTerminalTab('s1', 't2')
      expect(useSessionStore.getState().sessions[0].terminalTabs.activeTabId).toBe('t2')
    })

    it('closeOtherTerminalTabs keeps only the specified tab', () => {
      const s1 = createTestSession({ id: 's1' })
      s1.terminalTabs = {
        tabs: [{ id: 't1', name: 'T1' }, { id: 't2', name: 'T2' }, { id: 't3', name: 'T3' }],
        activeTabId: 't1',
      }
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().closeOtherTerminalTabs('s1', 't2')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs).toHaveLength(1)
      expect(session.terminalTabs.tabs[0].id).toBe('t2')
      expect(session.terminalTabs.activeTabId).toBe('t2')
    })

    it('closeTerminalTabsToRight keeps tabs up to and including specified', () => {
      const s1 = createTestSession({ id: 's1' })
      s1.terminalTabs = {
        tabs: [{ id: 't1', name: 'T1' }, { id: 't2', name: 'T2' }, { id: 't3', name: 'T3' }],
        activeTabId: 't1',
      }
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().closeTerminalTabsToRight('s1', 't2')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs).toHaveLength(2)
      expect(session.terminalTabs.tabs.map(t => t.id)).toEqual(['t1', 't2'])
    })

    it('closeTerminalTabsToRight updates active tab if it was to the right', () => {
      const s1 = createTestSession({ id: 's1' })
      s1.terminalTabs = {
        tabs: [{ id: 't1', name: 'T1' }, { id: 't2', name: 'T2' }, { id: 't3', name: 'T3' }],
        activeTabId: 't3',
      }
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().closeTerminalTabsToRight('s1', 't1')
      expect(useSessionStore.getState().sessions[0].terminalTabs.activeTabId).toBe('t1')
    })
  })

  describe('push tracking', () => {
    it('recordPushToMain sets timestamp and commit', () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().recordPushToMain('s1', 'abc123')
      const session = useSessionStore.getState().sessions[0]
      expect(session.pushedToMainAt).toBeGreaterThan(0)
      expect(session.pushedToMainCommit).toBe('abc123')
    })

    it('clearPushToMain clears push tracking', () => {
      const s1 = { ...createTestSession({ id: 's1' }), pushedToMainAt: 123, pushedToMainCommit: 'abc' }
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().clearPushToMain('s1')
      const session = useSessionStore.getState().sessions[0]
      expect(session.pushedToMainAt).toBeUndefined()
      expect(session.pushedToMainCommit).toBeUndefined()
    })
  })

  describe('debouncedSave', () => {
    it('saves after debounce timeout', async () => {
      const s1 = createTestSession({ id: 's1' })
      useSessionStore.setState({ sessions: [s1], isLoading: false })

      useSessionStore.getState().togglePanel('s1', PANEL_IDS.EXPLORER)

      // Should not have saved yet
      expect(window.config.save).not.toHaveBeenCalled()

      // Advance timers past debounce
      await vi.advanceTimersByTimeAsync(600)

      expect(window.config.load).toHaveBeenCalled()
      expect(window.config.save).toHaveBeenCalled()
    })
  })
})
