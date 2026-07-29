import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { allowConsoleWarn } from '../../test/console-guard'
import {
  scheduleSave,
  setCurrentProfileId,
  getCurrentProfileId,
  setLoadedCounts,
  getLoadedCounts,
  setLoadedSessionCount,
  getLoadedSessionCount,
} from './configPersistence'
import { useSessionStore } from './sessions'
import { useAgentStore } from './agents'
import { useRepoStore } from './repos'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/system/types'

describe('configPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(window.config.save).mockResolvedValue({ success: true })
    vi.mocked(window.config.load).mockResolvedValue({ agents: [], sessions: [] })
    vi.clearAllMocks()

    // Reset loaded counts
    setLoadedCounts({ sessions: 0, agents: 0, repos: 0 })
    setCurrentProfileId(undefined)

    // Reset stores to known state
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
    useAgentStore.setState({ agents: [], isLoading: false, profileId: undefined })
    useRepoStore.setState({ repos: [], defaultCloneDir: '', ghAvailable: null, profileId: undefined })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('currentProfileId', () => {
    it('starts undefined', () => {
      expect(getCurrentProfileId()).toBeUndefined()
    })

    it('can be set and retrieved', () => {
      setCurrentProfileId('profile-1')
      expect(getCurrentProfileId()).toBe('profile-1')
    })
  })

  describe('loadedCounts', () => {
    it('starts at zero', () => {
      expect(getLoadedCounts()).toEqual({ sessions: 0, agents: 0, repos: 0 })
    })

    it('can set individual counts', () => {
      setLoadedCounts({ sessions: 5 })
      expect(getLoadedCounts()).toEqual({ sessions: 5, agents: 0, repos: 0 })
    })

    it('setLoadedSessionCount updates sessions count', () => {
      setLoadedSessionCount(3)
      expect(getLoadedSessionCount()).toBe(3)
      expect(getLoadedCounts().sessions).toBe(3)
    })
  })

  describe('scheduleSave', () => {
    it('debounces saves with 500ms delay', async () => {
      useAgentStore.setState({ agents: [{ id: 'a1', name: 'Claude', command: 'claude' }] })

      scheduleSave()
      expect(window.config.save).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(600)
      expect(window.config.save).toHaveBeenCalledTimes(1)
    })

    it('collapses multiple rapid calls into one save', async () => {
      useAgentStore.setState({ agents: [{ id: 'a1', name: 'Claude', command: 'claude' }] })

      scheduleSave()
      scheduleSave()
      scheduleSave()

      await vi.advanceTimersByTimeAsync(600)
      expect(window.config.save).toHaveBeenCalledTimes(1)
    })

    it('assembles complete config from all stores', async () => {
      const agents = [{ id: 'a1', name: 'Claude', command: 'claude' }]
      const repos = [{ id: 'r1', name: 'repo', remoteUrl: 'url', rootDir: '/root', defaultBranch: 'main' }]

      useAgentStore.setState({ agents })
      useRepoStore.setState({ repos, defaultCloneDir: '/custom/dir' })
      useSessionStore.setState({
        sidebarWidth: 300,
        toolbarPanels: ['sidebar', 'explorer'],
        globalPanelVisibility: { [PANEL_IDS.SIDEBAR]: false, [PANEL_IDS.SETTINGS]: false },
      })

      scheduleSave()
      await vi.advanceTimersByTimeAsync(600)

      expect(window.config.save).toHaveBeenCalledWith(
        expect.objectContaining({
          agents,
          repos,
          defaultCloneDir: '/custom/dir',
          sidebarWidth: 300,
          toolbarPanels: ['sidebar', 'explorer'],
          showSidebar: false,
        })
      )
    })

    it('includes profileId in save', async () => {
      setCurrentProfileId('my-profile')
      useAgentStore.setState({ agents: [{ id: 'a1', name: 'Test', command: 'test' }] })

      scheduleSave()
      await vi.advanceTimersByTimeAsync(600)

      expect(window.config.save).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: 'my-profile' })
      )
    })
  })

  describe('initializing session filtering', () => {
    it('excludes initializing sessions from save', async () => {
      useAgentStore.setState({ agents: [{ id: 'a1', name: 'Claude', command: 'claude' }] })
      useSessionStore.setState({
        sessions: [
          {
            id: 's1', name: 'Ready', directory: '/d1', branch: 'main', status: 'idle',
            agentId: null, panelVisibility: {}, showExplorer: false, showFileViewer: false,
            showDiff: false, selectedFilePath: null, planFilePath: null,
            fileViewerPosition: 'top', layoutSizes: { explorerWidth: 256, fileViewerSize: 300, userTerminalHeight: 192, diffPanelWidth: 320, tutorialPanelWidth: 320 },
            explorerFilter: 'files', lastMessage: null, lastMessageTime: null,
            isUnread: false, workingStartTime: null, recentFiles: [], searchHistory: [],
            terminalTabs: { tabs: [], activeTabId: null }, branchStatus: 'in-progress',
            isArchived: false, isRestored: false,
          },
          {
            id: 's2', name: 'Setting up', directory: '/d2', branch: 'feat', status: 'initializing',
            agentId: null, panelVisibility: {}, showExplorer: false, showFileViewer: false,
            showDiff: false, selectedFilePath: null, planFilePath: null,
            fileViewerPosition: 'top', layoutSizes: { explorerWidth: 256, fileViewerSize: 300, userTerminalHeight: 192, diffPanelWidth: 320, tutorialPanelWidth: 320 },
            explorerFilter: 'files', lastMessage: null, lastMessageTime: null,
            isUnread: false, workingStartTime: null, recentFiles: [], searchHistory: [],
            terminalTabs: { tabs: [], activeTabId: null }, branchStatus: 'in-progress',
            isArchived: false, isRestored: false,
          },
        ] as never,
      })

      scheduleSave()
      await vi.advanceTimersByTimeAsync(600)

      expect(window.config.save).toHaveBeenCalledTimes(1)
      const savedConfig = vi.mocked(window.config.save).mock.calls[0][0] as { sessions: { id: string }[] }
      expect(savedConfig.sessions).toHaveLength(1)
      expect(savedConfig.sessions[0].id).toBe('s1')
    })
  })

  describe('isPaused persistence', () => {
    it('never persists isPaused', async () => {
      useAgentStore.setState({ agents: [{ id: 'a1', name: 'Claude', command: 'claude' }] })
      useSessionStore.setState({
        sessions: [
          {
            id: 's1', name: 'Ready', directory: '/d1', branch: 'main', status: 'idle',
            agentId: null, panelVisibility: {}, showExplorer: false, showFileViewer: false,
            showDiff: false, selectedFilePath: null, planFilePath: null,
            fileViewerPosition: 'top', layoutSizes: { explorerWidth: 256, fileViewerSize: 300, userTerminalHeight: 192, diffPanelWidth: 320, tutorialPanelWidth: 320 },
            explorerFilter: 'files', lastMessage: null, lastMessageTime: null,
            isUnread: false, workingStartTime: null, recentFiles: [], searchHistory: [],
            terminalTabs: { tabs: [], activeTabId: null }, branchStatus: 'in-progress',
            isArchived: false, isPaused: true, isRestored: false,
          },
        ] as never,
      })

      scheduleSave()
      await vi.advanceTimersByTimeAsync(600)

      expect(window.config.save).toHaveBeenCalledTimes(1)
      const savedConfig = vi.mocked(window.config.save).mock.calls[0][0] as { sessions: Record<string, unknown>[] }
      expect(savedConfig.sessions[0]).not.toHaveProperty('isPaused')
    })
  })

  describe('save guards', () => {
    beforeEach(() => { allowConsoleWarn() })

    it('refuses to save when sessions are empty but were previously loaded', async () => {
      setLoadedCounts({ sessions: 3 })
      useAgentStore.setState({ agents: [{ id: 'a1', name: 'Test', command: 'test' }] })
      // sessions is empty (default)

      scheduleSave()
      await vi.advanceTimersByTimeAsync(600)

      expect(window.config.save).not.toHaveBeenCalled()
    })

    it('refuses to save when agents are empty but were previously loaded', async () => {
      setLoadedCounts({ agents: 2 })
      // agents is empty (default)

      scheduleSave()
      await vi.advanceTimersByTimeAsync(600)

      expect(window.config.save).not.toHaveBeenCalled()
    })

    it('refuses to save when repos are empty but were previously loaded', async () => {
      setLoadedCounts({ repos: 5 })
      useAgentStore.setState({ agents: [{ id: 'a1', name: 'Test', command: 'test' }] })
      // repos is empty (default)

      scheduleSave()
      await vi.advanceTimersByTimeAsync(600)

      expect(window.config.save).not.toHaveBeenCalled()
    })

    it('allows saving empty arrays when nothing was loaded', async () => {
      // loadedCounts all zero — empty arrays are expected
      scheduleSave()
      await vi.advanceTimersByTimeAsync(600)

      expect(window.config.save).toHaveBeenCalledTimes(1)
    })
  })
})
