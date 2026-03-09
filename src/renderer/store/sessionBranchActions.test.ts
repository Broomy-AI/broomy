import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSessionStore } from './sessions'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/types'
import { setLoadedCounts } from './configPersistence'

describe('sessionBranchActions', () => {
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
      terminalTabs: { tabs: [{ id: 'tab-1', name: 'Terminal' }], activeTabId: 'tab-1' },
      branchStatus: 'in-progress' as const,
      isArchived: false,
      isRestored: false,
    }
    useSessionStore.setState({ sessions: [session], activeSessionId: id })
    return session
  }

  describe('markHasHadCommits', () => {
    it('marks session as having had commits', () => {
      addTestSession()
      useSessionStore.getState().markHasHadCommits('test-session')
      expect(useSessionStore.getState().sessions[0].hasHadCommits).toBe(true)
    })

    it('is a no-op if already marked', () => {
      addTestSession()
      useSessionStore.getState().markHasHadCommits('test-session')
      useSessionStore.getState().markHasHadCommits('test-session')
      expect(useSessionStore.getState().sessions[0].hasHadCommits).toBe(true)
    })

    it('is a no-op for non-existent session', () => {
      addTestSession()
      useSessionStore.getState().markHasHadCommits('nonexistent')
      expect(useSessionStore.getState().sessions[0].hasHadCommits).toBeUndefined()
    })
  })

  describe('updateBranchStatus', () => {
    it('updates branch status for session', () => {
      addTestSession()
      useSessionStore.getState().updateBranchStatus('test-session', 'merged')
      expect(useSessionStore.getState().sessions[0].branchStatus).toBe('merged')
    })
  })

  describe('updatePrState', () => {
    it('updates PR state with number and URL', () => {
      addTestSession()
      useSessionStore.getState().updatePrState('test-session', 'OPEN', 42, 'https://github.com/pr/42')
      const session = useSessionStore.getState().sessions[0]
      expect(session.lastKnownPrState).toBe('OPEN')
      expect(session.lastKnownPrNumber).toBe(42)
      expect(session.lastKnownPrUrl).toBe('https://github.com/pr/42')
    })

    it('keeps existing prNumber/prUrl when not provided', () => {
      addTestSession()
      useSessionStore.getState().updatePrState('test-session', 'OPEN', 42, 'https://pr')
      useSessionStore.getState().updatePrState('test-session', 'MERGED')
      const session = useSessionStore.getState().sessions[0]
      expect(session.lastKnownPrState).toBe('MERGED')
      expect(session.lastKnownPrNumber).toBe(42)
      expect(session.lastKnownPrUrl).toBe('https://pr')
    })
  })

  describe('archiveSession', () => {
    it('archives a session', () => {
      addTestSession()
      useSessionStore.getState().archiveSession('test-session')
      expect(useSessionStore.getState().sessions[0].isArchived).toBe(true)
    })

    it('switches active session when archiving active session', () => {
      addTestSession('s1')
      const session2 = { ...useSessionStore.getState().sessions[0], id: 's2', name: 'other' }
      useSessionStore.setState({
        sessions: [...useSessionStore.getState().sessions, session2],
        activeSessionId: 's1',
      })

      useSessionStore.getState().archiveSession('s1')
      expect(useSessionStore.getState().activeSessionId).toBe('s2')
    })

    it('sets activeSessionId to null when all sessions are archived', () => {
      addTestSession()
      useSessionStore.getState().archiveSession('test-session')
      expect(useSessionStore.getState().activeSessionId).toBeNull()
    })
  })

  describe('unarchiveSession', () => {
    it('unarchives a session', () => {
      addTestSession()
      useSessionStore.getState().archiveSession('test-session')
      useSessionStore.getState().unarchiveSession('test-session')
      expect(useSessionStore.getState().sessions[0].isArchived).toBe(false)
    })
  })

  describe('updateReviewStatus', () => {
    it('updates review status for a session', () => {
      addTestSession()
      useSessionStore.getState().updateReviewStatus('test-session', 'reviewed')
      expect(useSessionStore.getState().sessions[0].reviewStatus).toBe('reviewed')
    })

    it('is a no-op when status is already the same', () => {
      addTestSession()
      useSessionStore.getState().updateReviewStatus('test-session', 'reviewed')
      vi.clearAllMocks()
      useSessionStore.getState().updateReviewStatus('test-session', 'reviewed')
      // Should not trigger another save since status did not change
      expect(useSessionStore.getState().sessions[0].reviewStatus).toBe('reviewed')
    })

    it('is a no-op for non-existent session', () => {
      addTestSession()
      useSessionStore.getState().updateReviewStatus('nonexistent', 'reviewed')
      expect(useSessionStore.getState().sessions[0].reviewStatus).toBeUndefined()
    })

    it('changes from reviewed back to pending', () => {
      addTestSession()
      useSessionStore.getState().updateReviewStatus('test-session', 'reviewed')
      useSessionStore.getState().updateReviewStatus('test-session', 'pending')
      expect(useSessionStore.getState().sessions[0].reviewStatus).toBe('pending')
    })
  })
})
