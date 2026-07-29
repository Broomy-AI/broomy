import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSessionStore, type StatusChip, type Session } from './sessions'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/system/types'
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

  function addTestSession(id = 'test-session', overrides: Partial<Session> = {}) {
    const session = { ...buildSession(id), ...overrides }
    useSessionStore.setState({ sessions: [session], activeSessionId: id })
    return session
  }

  function buildSession(id = 'test-session') {
    return {
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
      terminalTabs: { tabs: [{ id: 'tab-1', name: 'Terminal' }], activeTabId: 'tab-1' },
      branchStatus: 'in-progress' as const,
      hasFeedback: false,
      checksStatus: 'none' as const,
      reviewState: 'none' as const,
      statusChip: 'in-progress' as StatusChip,
      isArchived: false,
      stage: 'planning',
      isRestored: false,
      isPaused: false,
    }
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

  describe('clearHasHadCommits', () => {
    it('clears hasHadCommits flag', () => {
      addTestSession()
      useSessionStore.getState().markHasHadCommits('test-session')
      expect(useSessionStore.getState().sessions[0].hasHadCommits).toBe(true)
      useSessionStore.getState().clearHasHadCommits('test-session')
      expect(useSessionStore.getState().sessions[0].hasHadCommits).toBe(false)
    })

    it('is a no-op if not marked', () => {
      addTestSession()
      useSessionStore.getState().clearHasHadCommits('test-session')
      expect(useSessionStore.getState().sessions[0].hasHadCommits).toBeUndefined()
    })

    it('is a no-op for non-existent session', () => {
      addTestSession()
      useSessionStore.getState().markHasHadCommits('test-session')
      useSessionStore.getState().clearHasHadCommits('nonexistent')
      expect(useSessionStore.getState().sessions[0].hasHadCommits).toBe(true)
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

  describe('updateReviewState', () => {
    it('sets statusChip to approved when open PR and reviewState approved', () => {
      addTestSession('test-session', { branchStatus: 'open', hasFeedback: false, checksStatus: 'none' })
      useSessionStore.getState().updateReviewState('test-session', 'approved')
      expect(useSessionStore.getState().sessions[0].reviewState).toBe('approved')
      expect(useSessionStore.getState().sessions[0].statusChip).toBe('approved')
    })

    it('sets statusChip to waiting when open PR and reviewState waiting', () => {
      addTestSession('test-session', { branchStatus: 'open', hasFeedback: false, checksStatus: 'none' })
      useSessionStore.getState().updateReviewState('test-session', 'waiting')
      expect(useSessionStore.getState().sessions[0].statusChip).toBe('waiting')
    })

    it('feedback still outranks approved', () => {
      addTestSession('test-session', { branchStatus: 'open', hasFeedback: true, checksStatus: 'none' })
      useSessionStore.getState().updateReviewState('test-session', 'approved')
      expect(useSessionStore.getState().sessions[0].statusChip).toBe('feedback')
    })

    it('is a no-op when reviewState is unchanged', () => {
      addTestSession('test-session', { branchStatus: 'open', hasFeedback: false, checksStatus: 'none', reviewState: 'waiting', statusChip: 'waiting' })
      useSessionStore.getState().updateReviewState('test-session', 'waiting')
      expect(useSessionStore.getState().sessions[0].statusChip).toBe('waiting')
    })

    it('is a no-op for a non-existent session', () => {
      addTestSession('test-session', { branchStatus: 'open' })
      useSessionStore.getState().updateReviewState('missing', 'approved')
      expect(useSessionStore.getState().sessions[0].reviewState).toBe('none')
    })
  })

  describe('updateSessionBranch', () => {
    it('changes branch and resets PR/commit tracking', () => {
      addTestSession('test-session', {
        branch: 'old', hasHadCommits: true, branchStatus: 'open',
        lastKnownPrState: 'OPEN', lastKnownPrNumber: 7, lastKnownPrUrl: 'http://pr/7',
      })
      useSessionStore.getState().updateSessionBranch('test-session', 'new')
      const s = useSessionStore.getState().sessions[0]
      expect(s.branch).toBe('new')
      expect(s.hasHadCommits).toBe(false)
      expect(s.lastKnownPrState).toBeUndefined()
      expect(s.lastKnownPrNumber).toBeUndefined()
      expect(s.lastKnownPrUrl).toBeUndefined()
      expect(s.branchStatus).toBe('none')
    })

    it('is a no-op when the branch is unchanged', () => {
      addTestSession('test-session', { branch: 'main', hasHadCommits: true })
      useSessionStore.getState().updateSessionBranch('test-session', 'main')
      expect(useSessionStore.getState().sessions[0].hasHadCommits).toBe(true)
    })

    it('is a no-op for a non-existent session', () => {
      addTestSession('test-session', { branch: 'main' })
      useSessionStore.getState().updateSessionBranch('missing', 'new')
      expect(useSessionStore.getState().sessions[0].branch).toBe('main')
    })
  })

  describe('updateFeedbackStatus', () => {
    it('sets statusChip to feedback when open PR has feedback', () => {
      addTestSession('test-session', { branchStatus: 'open', hasFeedback: false, checksStatus: 'none' })
      useSessionStore.getState().updateFeedbackStatus('test-session', true)
      expect(useSessionStore.getState().sessions[0].hasFeedback).toBe(true)
      expect(useSessionStore.getState().sessions[0].statusChip).toBe('feedback')
    })

    it('is a no-op when hasFeedback is unchanged', () => {
      addTestSession('test-session', { branchStatus: 'open', hasFeedback: false, statusChip: 'open' })
      useSessionStore.getState().updateFeedbackStatus('test-session', false)
      expect(useSessionStore.getState().sessions[0].statusChip).toBe('open')
    })

    it('is a no-op for a non-existent session', () => {
      addTestSession('test-session', { branchStatus: 'open', hasFeedback: false })
      useSessionStore.getState().updateFeedbackStatus('missing', true)
      expect(useSessionStore.getState().sessions[0].hasFeedback).toBe(false)
    })
  })

  describe('pauseSession / resumeSession', () => {
    it('pauses a session without changing the active session', () => {
      addTestSession('a')
      const b = { ...useSessionStore.getState().sessions[0], id: 'b' }
      useSessionStore.setState({
        sessions: [...useSessionStore.getState().sessions, b],
        activeSessionId: 'a',
      })

      useSessionStore.getState().pauseSession('a')

      expect(useSessionStore.getState().sessions.find(s => s.id === 'a')!.isPaused).toBe(true)
      expect(useSessionStore.getState().activeSessionId).toBe('a')
    })

    it('resumes a paused session', () => {
      addTestSession('a', { isPaused: true })

      useSessionStore.getState().resumeSession('a')

      expect(useSessionStore.getState().sessions.find(s => s.id === 'a')!.isPaused).toBe(false)
    })

    it('leaves other sessions untouched', () => {
      addTestSession('a')
      const b = { ...useSessionStore.getState().sessions[0], id: 'b', isPaused: false }
      useSessionStore.setState({
        sessions: [...useSessionStore.getState().sessions, b],
      })

      useSessionStore.getState().pauseSession('a')

      expect(useSessionStore.getState().sessions.find(s => s.id === 'b')!.isPaused).toBe(false)
    })
  })

  describe('pauseSession container teardown', () => {
    beforeEach(() => {
      vi.mocked(window.devcontainer.stopContainer).mockResolvedValue(undefined)
    })

    it('stops the container for the paused session directory', () => {
      addTestSession('a', { directory: '/work/a' })

      useSessionStore.getState().pauseSession('a')

      expect(window.devcontainer.stopContainer).toHaveBeenCalledWith('/work/a')
    })

    it('leaves a container alone while another running session shares the directory', () => {
      addTestSession('a', { directory: '/work/shared' })
      const b = { ...useSessionStore.getState().sessions[0], id: 'b', isPaused: false }
      useSessionStore.setState({
        sessions: [...useSessionStore.getState().sessions, b],
      })

      useSessionStore.getState().pauseSession('a')

      expect(window.devcontainer.stopContainer).not.toHaveBeenCalled()
    })

    it('does not reject when stopping fails', () => {
      vi.mocked(window.devcontainer.stopContainer).mockRejectedValue(new Error('docker down'))
      addTestSession('a', { directory: '/work/a' })

      expect(() => useSessionStore.getState().pauseSession('a')).not.toThrow()
      expect(useSessionStore.getState().sessions[0].isPaused).toBe(true)
    })
  })

  describe('updateChecksStatus', () => {
    it('sets statusChip to failed when open PR checks fail', () => {
      addTestSession('test-session', { branchStatus: 'open', hasFeedback: false, checksStatus: 'none' })
      useSessionStore.getState().updateChecksStatus('test-session', 'failed')
      expect(useSessionStore.getState().sessions[0].checksStatus).toBe('failed')
      expect(useSessionStore.getState().sessions[0].statusChip).toBe('failed')
    })

    it('is a no-op when checksStatus is unchanged', () => {
      addTestSession('test-session', { branchStatus: 'open', checksStatus: 'none', statusChip: 'open' })
      useSessionStore.getState().updateChecksStatus('test-session', 'none')
      expect(useSessionStore.getState().sessions[0].statusChip).toBe('open')
    })

    it('is a no-op for a non-existent session', () => {
      addTestSession('test-session', { branchStatus: 'open', checksStatus: 'none' })
      useSessionStore.getState().updateChecksStatus('missing', 'failed')
      expect(useSessionStore.getState().sessions[0].checksStatus).toBe('none')
    })
  })
})
