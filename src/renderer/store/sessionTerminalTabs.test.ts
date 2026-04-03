import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSessionStore, type StatusChip } from './sessions'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/system/types'
import { setLoadedCounts } from './configPersistence'

describe('sessionTerminalTabs', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setLoadedCounts({ sessions: 0, agents: 0, repos: 0 })
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      showSidebar: true,
      showSettings: false,
      sidebarWidth: 224,
      toolbarPanels: [...DEFAULT_TOOLBAR_PANELS],
      globalPanelVisibility: {
        [PANEL_IDS.SIDEBAR]: true,
        [PANEL_IDS.SETTINGS]: false,
      },
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function addTestSession(id = 'test-session') {
    const session = {
      id,
      name: 'test',
      directory: '/test',
      branch: 'main',
      status: 'idle' as const,
      agentId: null,
      panelVisibility: { [PANEL_IDS.EXPLORER]: false, [PANEL_IDS.FILE_VIEWER]: false },
      showExplorer: false,
      showFileViewer: false,
      showDiff: false,
      selectedFilePath: null,
      planFilePath: null,
      fileViewerPosition: 'top' as const,
      layoutSizes: { explorerWidth: 256, fileViewerSize: 300, userTerminalHeight: 192, diffPanelWidth: 320, tutorialPanelWidth: 320 },
      explorerFilter: 'files' as const,
      lastMessage: null,
      lastMessageTime: null,
      isUnread: false,
      workingStartTime: null,
      recentFiles: [],
      searchHistory: [],
      terminalTabs: {
        tabs: [{ id: 'tab-1', name: 'Terminal' }],
        activeTabId: 'tab-1',
      },
      branchStatus: 'in-progress' as const,
      hasFeedback: false,
      checksStatus: 'none' as const,
      statusChip: 'in-progress' as StatusChip,
      isArchived: false,
      isRestored: false,
    }
    useSessionStore.setState({ sessions: [session], activeSessionId: id })
    return session
  }

  describe('addTerminalTab', () => {
    it('adds a new tab and makes it active', () => {
      addTestSession()
      const tabId = useSessionStore.getState().addTerminalTab('test-session')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs).toHaveLength(2)
      expect(session.terminalTabs.activeTabId).toBe(tabId)
    })

    it('uses provided name', () => {
      addTestSession()
      useSessionStore.getState().addTerminalTab('test-session', 'Custom Tab')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs[1].name).toBe('Custom Tab')
    })

    it('auto-generates tab name based on count', () => {
      addTestSession()
      useSessionStore.getState().addTerminalTab('test-session')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs[1].name).toBe('Terminal 2')
    })

    it('uses "Container N" name when isolated is true', () => {
      addTestSession()
      useSessionStore.getState().addTerminalTab('test-session', undefined, true)
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs[1].name).toBe('Container 2')
      expect(session.terminalTabs.tabs[1].isolated).toBe(true)
    })

    it('does not set isolated flag when isolated is false/undefined', () => {
      addTestSession()
      useSessionStore.getState().addTerminalTab('test-session')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs[1].isolated).toBeUndefined()
    })

    it('uses provided name even when isolated', () => {
      addTestSession()
      useSessionStore.getState().addTerminalTab('test-session', 'My Container', true)
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs[1].name).toBe('My Container')
      expect(session.terminalTabs.tabs[1].isolated).toBe(true)
    })
  })

  describe('removeTerminalTab', () => {
    it('removes a tab', () => {
      addTestSession()
      const tabId = useSessionStore.getState().addTerminalTab('test-session')
      useSessionStore.getState().removeTerminalTab('test-session', tabId)
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs).toHaveLength(1)
    })

    it('does not remove the last tab', () => {
      addTestSession()
      useSessionStore.getState().removeTerminalTab('test-session', 'tab-1')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs).toHaveLength(1)
    })

    it('selects adjacent tab when removing active tab', () => {
      addTestSession()
      const tab2 = useSessionStore.getState().addTerminalTab('test-session', 'Tab 2')
      const tab3 = useSessionStore.getState().addTerminalTab('test-session', 'Tab 3')
      // tab3 is active now. Remove it.
      useSessionStore.getState().removeTerminalTab('test-session', tab3)
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.activeTabId).toBe(tab2)
    })

    it('preserves active tab when removing non-active tab', () => {
      addTestSession()
      const tab2 = useSessionStore.getState().addTerminalTab('test-session', 'Tab 2')
      // tab2 is now active. Remove tab-1.
      useSessionStore.getState().removeTerminalTab('test-session', 'tab-1')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.activeTabId).toBe(tab2)
    })
  })

  describe('renameTerminalTab', () => {
    it('renames a tab', () => {
      addTestSession()
      useSessionStore.getState().renameTerminalTab('test-session', 'tab-1', 'New Name')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs[0].name).toBe('New Name')
    })
  })

  describe('reorderTerminalTabs', () => {
    it('reorders tabs', () => {
      addTestSession()
      const tab2Id = useSessionStore.getState().addTerminalTab('test-session', 'Tab 2')
      const tabs = useSessionStore.getState().sessions[0].terminalTabs.tabs
      const reversed = [...tabs].reverse()
      useSessionStore.getState().reorderTerminalTabs('test-session', reversed)
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs[0].id).toBe(tab2Id)
    })
  })

  describe('setActiveTerminalTab', () => {
    it('sets the active tab', () => {
      addTestSession()
      useSessionStore.getState().addTerminalTab('test-session', 'Tab 2')
      useSessionStore.getState().setActiveTerminalTab('test-session', 'tab-1')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.activeTabId).toBe('tab-1')
    })
  })

  describe('closeOtherTerminalTabs', () => {
    it('keeps only the specified tab', () => {
      addTestSession()
      useSessionStore.getState().addTerminalTab('test-session', 'Tab 2')
      useSessionStore.getState().addTerminalTab('test-session', 'Tab 3')
      useSessionStore.getState().closeOtherTerminalTabs('test-session', 'tab-1')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs).toHaveLength(1)
      expect(session.terminalTabs.tabs[0].id).toBe('tab-1')
      expect(session.terminalTabs.activeTabId).toBe('tab-1')
    })

    it('is a no-op if tab not found', () => {
      addTestSession()
      useSessionStore.getState().closeOtherTerminalTabs('test-session', 'nonexistent')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs).toHaveLength(1)
    })
  })

  describe('multi-session isolation', () => {
    function addSecondSession(id = 'other-session') {
      const current = useSessionStore.getState().sessions
      const session = {
        id,
        name: 'other',
        directory: '/other',
        branch: 'main',
        status: 'idle' as const,
        agentId: null,
        panelVisibility: { [PANEL_IDS.EXPLORER]: false, [PANEL_IDS.FILE_VIEWER]: false },
        showExplorer: false,
        showFileViewer: false,
        showDiff: false,
        selectedFilePath: null,
        planFilePath: null,
        fileViewerPosition: 'top' as const,
        layoutSizes: { explorerWidth: 256, fileViewerSize: 300, userTerminalHeight: 192, diffPanelWidth: 320, tutorialPanelWidth: 320 },
        explorerFilter: 'files' as const,
        lastMessage: null,
        lastMessageTime: null,
        isUnread: false,
        workingStartTime: null,
        recentFiles: [],
        searchHistory: [],
        terminalTabs: {
          tabs: [{ id: 'other-tab', name: 'Terminal' }],
          activeTabId: 'other-tab',
        },
        branchStatus: 'in-progress' as const,
        hasFeedback: false,
        checksStatus: 'none' as const,
        statusChip: 'in-progress' as StatusChip,
        isArchived: false,
        isRestored: false,
      }
      useSessionStore.setState({ sessions: [...current, session] })
      return session
    }

    it('addTerminalTab does not affect other sessions', () => {
      addTestSession()
      addSecondSession()
      useSessionStore.getState().addTerminalTab('test-session')
      expect(useSessionStore.getState().sessions[1].terminalTabs.tabs).toHaveLength(1)
    })

    it('removeTerminalTab does not affect other sessions', () => {
      addTestSession()
      const tab2 = useSessionStore.getState().addTerminalTab('test-session')
      addSecondSession()
      useSessionStore.getState().removeTerminalTab('test-session', tab2)
      expect(useSessionStore.getState().sessions[1].terminalTabs.tabs).toHaveLength(1)
    })

    it('renameTerminalTab does not affect other sessions', () => {
      addTestSession()
      addSecondSession()
      useSessionStore.getState().renameTerminalTab('test-session', 'tab-1', 'Renamed')
      expect(useSessionStore.getState().sessions[1].terminalTabs.tabs[0].name).toBe('Terminal')
    })

    it('reorderTerminalTabs does not affect other sessions', () => {
      addTestSession()
      addSecondSession()
      const tabs = useSessionStore.getState().sessions[0].terminalTabs.tabs
      useSessionStore.getState().reorderTerminalTabs('test-session', [...tabs].reverse())
      expect(useSessionStore.getState().sessions[1].terminalTabs.tabs[0].id).toBe('other-tab')
    })

    it('closeOtherTerminalTabs does not affect other sessions', () => {
      addTestSession()
      useSessionStore.getState().addTerminalTab('test-session', 'Tab 2')
      addSecondSession()
      useSessionStore.getState().closeOtherTerminalTabs('test-session', 'tab-1')
      expect(useSessionStore.getState().sessions[1].terminalTabs.tabs).toHaveLength(1)
    })

    it('closeTerminalTabsToRight does not affect other sessions', () => {
      addTestSession()
      useSessionStore.getState().addTerminalTab('test-session', 'Tab 2')
      addSecondSession()
      useSessionStore.getState().closeTerminalTabsToRight('test-session', 'tab-1')
      expect(useSessionStore.getState().sessions[1].terminalTabs.tabs).toHaveLength(1)
    })
  })

  describe('closeTerminalTabsToRight', () => {
    it('removes tabs to the right of the specified tab', () => {
      addTestSession()
      useSessionStore.getState().addTerminalTab('test-session', 'Tab 2')
      useSessionStore.getState().addTerminalTab('test-session', 'Tab 3')
      // Close tabs to the right of tab-1
      useSessionStore.getState().closeTerminalTabsToRight('test-session', 'tab-1')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs).toHaveLength(1)
      expect(session.terminalTabs.tabs[0].id).toBe('tab-1')
    })

    it('switches active tab when active tab is to the right', () => {
      addTestSession()
      useSessionStore.getState().addTerminalTab('test-session', 'Tab 2')
      useSessionStore.getState().addTerminalTab('test-session', 'Tab 3')
      // tab3 is active, close to right of tab-1
      useSessionStore.getState().closeTerminalTabsToRight('test-session', 'tab-1')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.activeTabId).toBe('tab-1')
    })

    it('preserves active tab when it is to the left', () => {
      addTestSession()
      const tab2 = useSessionStore.getState().addTerminalTab('test-session', 'Tab 2')
      useSessionStore.getState().addTerminalTab('test-session', 'Tab 3')
      // Set tab-1 as active
      useSessionStore.getState().setActiveTerminalTab('test-session', 'tab-1')
      // Close to right of tab2
      useSessionStore.getState().closeTerminalTabsToRight('test-session', tab2)
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.activeTabId).toBe('tab-1')
    })

    it('is a no-op for unknown tab', () => {
      addTestSession()
      useSessionStore.getState().closeTerminalTabsToRight('test-session', 'nonexistent')
      const session = useSessionStore.getState().sessions[0]
      expect(session.terminalTabs.tabs).toHaveLength(1)
    })
  })
})
