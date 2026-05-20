import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSessionStore } from './sessions'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/system/types'
import { setLoadedCounts } from './configPersistence'

describe('sessionCoreActions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setLoadedCounts({ sessions: 0, agents: 0, repos: 0 })
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
    vi.mocked(window.config.load).mockResolvedValue({ agents: [], sessions: [] })
    vi.mocked(window.config.save).mockResolvedValue({ success: true })
    vi.mocked(window.git.getBranch).mockResolvedValue('main')
    vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
    vi.mocked(window.git.remoteUrl).mockResolvedValue(null)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('addSession', () => {
    it('adds a session and sets it active', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
      vi.mocked(window.git.getBranch).mockResolvedValue('feature/test')

      await useSessionStore.getState().addSession('/test/repo', 'claude')

      const state = useSessionStore.getState()
      expect(state.sessions).toHaveLength(1)
      expect(state.sessions[0].directory).toBe('/test/repo')
      expect(state.sessions[0].agentId).toBe('claude')
      expect(state.sessions[0].branch).toBe('feature/test')
      expect(state.activeSessionId).toBe(state.sessions[0].id)
    })

    it('throws when directory is not a git repo', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(false)

      await expect(useSessionStore.getState().addSession('/test', null)).rejects.toThrow(
        'not a git repository'
      )
    })

    it('uses repo name from remote URL when available', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
      vi.mocked(window.git.remoteUrl).mockResolvedValue('https://github.com/user/my-project.git')

      await useSessionStore.getState().addSession('/test/repo', null)

      expect(useSessionStore.getState().sessions[0].name).toBe('my-project')
    })

    it('falls back to basename when remote URL fails', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
      vi.mocked(window.git.remoteUrl).mockRejectedValue(new Error('no remote'))

      await useSessionStore.getState().addSession('/test/my-dir', null)

      expect(useSessionStore.getState().sessions[0].name).toBe('my-dir')
    })

    it('uses provided name when given', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(true)

      await useSessionStore.getState().addSession('/test/repo', null, { name: 'custom-name' })

      expect(useSessionStore.getState().sessions[0].name).toBe('custom-name')
    })

    it('creates review session with review panel visibility', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(true)

      await useSessionStore.getState().addSession('/test/repo', 'claude', {
        sessionType: 'review',
        prNumber: 42,
        prTitle: 'Test PR',
      })

      const session = useSessionStore.getState().sessions[0]
      expect(session.sessionType).toBe('review')
      expect(session.panelVisibility[PANEL_IDS.EXPLORER]).toBe(true)
      expect(session.panelVisibility[PANEL_IDS.FILE_VIEWER]).toBe(false)
      expect(session.explorerFilter).toBe('review')
    })

    it('returns existing session info for active duplicate by directory', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
      vi.mocked(window.git.getBranch).mockResolvedValue('feature/test')

      await useSessionStore.getState().addSession('/test/repo', 'claude')
      const existingSession = useSessionStore.getState().sessions[0]

      const result = await useSessionStore.getState().addSession('/test/repo', 'claude')

      expect(result).toEqual({
        existingSessionId: existingSession.id,
        existingSessionName: existingSession.name,
        wasArchived: false,
      })
      expect(useSessionStore.getState().sessions).toHaveLength(1)
      expect(useSessionStore.getState().activeSessionId).toBe(existingSession.id)
    })

    it('returns existing session info for active duplicate by repoId', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
      vi.mocked(window.git.getBranch).mockResolvedValue('feature/test')

      await useSessionStore.getState().addSession('/test/repo', 'claude', { repoId: 'repo-1' })
      const existingSession = useSessionStore.getState().sessions[0]

      const result = await useSessionStore.getState().addSession('/test/other-worktree', 'claude', { repoId: 'repo-1' })

      expect(result).toEqual({
        existingSessionId: existingSession.id,
        existingSessionName: existingSession.name,
        wasArchived: false,
      })
      expect(useSessionStore.getState().sessions).toHaveLength(1)
    })

    it('allows same branch in different repos', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
      vi.mocked(window.git.getBranch).mockResolvedValue('main')

      await useSessionStore.getState().addSession('/test/repo-a', 'claude', { repoId: 'repo-1' })
      await useSessionStore.getState().addSession('/test/repo-b', 'claude', { repoId: 'repo-2' })

      expect(useSessionStore.getState().sessions).toHaveLength(2)
    })

    it('unarchives and returns info for archived duplicate', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
      vi.mocked(window.git.getBranch).mockResolvedValue('feature/test')

      await useSessionStore.getState().addSession('/test/repo', 'claude')
      const existingSession = useSessionStore.getState().sessions[0]

      // Archive the existing session
      const sessions = useSessionStore.getState().sessions
      useSessionStore.setState({
        sessions: sessions.map((s) => ({ ...s, isArchived: true })),
      })

      const result = await useSessionStore.getState().addSession('/test/repo', 'claude')

      expect(result).toEqual({
        existingSessionId: existingSession.id,
        existingSessionName: existingSession.name,
        wasArchived: true,
      })
      expect(useSessionStore.getState().sessions).toHaveLength(1)
      expect(useSessionStore.getState().sessions[0].isArchived).toBe(false)
      expect(useSessionStore.getState().activeSessionId).toBe(existingSession.id)
    })

  })

  describe('addInitializingSession', () => {
    it('creates a session with initializing status', () => {
      const id = useSessionStore.getState().addInitializingSession({
        directory: '/repos/my-project/feature/test',
        branch: 'feature/test',
        agentId: 'claude',
        extra: { repoId: 'repo-1', name: 'my-project' },
      })

      const state = useSessionStore.getState()
      expect(state.sessions).toHaveLength(1)
      expect(state.sessions[0].id).toBe(id)
      expect(state.sessions[0].status).toBe('initializing')
      expect(state.sessions[0].directory).toBe('/repos/my-project/feature/test')
      expect(state.sessions[0].branch).toBe('feature/test')
      expect(state.sessions[0].agentId).toBe('claude')
      expect(state.sessions[0].name).toBe('my-project')
      expect(state.activeSessionId).toBe(id)
    })

    it('does not trigger a save', () => {
      useSessionStore.getState().addInitializingSession({
        directory: '/repos/test',
        branch: 'test',
        agentId: null,
      })

      vi.advanceTimersByTime(1000)
      expect(window.config.save).not.toHaveBeenCalled()
    })
  })

  describe('finalizeSession', () => {
    it('transitions initializing session to idle with isUnread', () => {
      const id = useSessionStore.getState().addInitializingSession({
        directory: '/repos/test',
        branch: 'test',
        agentId: null,
      })

      useSessionStore.getState().finalizeSession(id)

      const session = useSessionStore.getState().sessions.find(s => s.id === id)
      expect(session?.status).toBe('idle')
      expect(session?.isUnread).toBe(true)
    })

    it('triggers a save after finalization', async () => {
      const id = useSessionStore.getState().addInitializingSession({
        directory: '/repos/test',
        branch: 'test',
        agentId: null,
      })

      useSessionStore.getState().finalizeSession(id)
      await vi.advanceTimersByTimeAsync(600)

      expect(window.config.save).toHaveBeenCalledTimes(1)
    })

    it('does nothing if session is not initializing', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
      await useSessionStore.getState().addSession('/test/repo', null)
      const id = useSessionStore.getState().sessions[0].id

      useSessionStore.getState().finalizeSession(id)

      // Status should remain idle (unchanged)
      expect(useSessionStore.getState().sessions[0].status).toBe('idle')
    })
  })

  describe('failSession', () => {
    it('sets status to error and records initError', () => {
      const id = useSessionStore.getState().addInitializingSession({
        directory: '/repos/test',
        branch: 'test',
        agentId: null,
      })

      useSessionStore.getState().failSession(id, 'Push failed')

      const session = useSessionStore.getState().sessions.find(s => s.id === id)
      expect(session?.status).toBe('error')
      expect(session?.initError).toBe('Push failed')
    })

    it('does not trigger a save', () => {
      const id = useSessionStore.getState().addInitializingSession({
        directory: '/repos/test',
        branch: 'test',
        agentId: null,
      })

      useSessionStore.getState().failSession(id, 'error')
      vi.advanceTimersByTime(1000)

      expect(window.config.save).not.toHaveBeenCalled()
    })
  })

  describe('updateAgentMonitor guards initializing sessions', () => {
    it('does not update status for initializing sessions', () => {
      const id = useSessionStore.getState().addInitializingSession({
        directory: '/repos/test',
        branch: 'test',
        agentId: null,
      })

      useSessionStore.getState().updateAgentMonitor(id, { status: 'working' })

      expect(useSessionStore.getState().sessions[0].status).toBe('initializing')
    })
  })

  describe('removeSession', () => {
    it('removes a session', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
      await useSessionStore.getState().addSession('/test/repo', null)
      const id = useSessionStore.getState().sessions[0].id

      useSessionStore.getState().removeSession(id)

      expect(useSessionStore.getState().sessions).toHaveLength(0)
      expect(useSessionStore.getState().activeSessionId).toBeNull()
    })

    it('switches to first session when removing active session', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
      await useSessionStore.getState().addSession('/test/repo1', null)
      await useSessionStore.getState().addSession('/test/repo2', null)
      const activeId = useSessionStore.getState().activeSessionId

      useSessionStore.getState().removeSession(activeId!)

      const remaining = useSessionStore.getState().sessions
      expect(remaining).toHaveLength(1)
      expect(useSessionStore.getState().activeSessionId).toBe(remaining[0].id)
    })

    it('calls pty.killForSession to defensively reap any surviving PTYs', async () => {
      vi.mocked(window.git.isGitRepo).mockResolvedValue(true)
      await useSessionStore.getState().addSession('/test/repo', null)
      const id = useSessionStore.getState().sessions[0].id

      useSessionStore.getState().removeSession(id)

      expect(window.pty.killForSession).toHaveBeenCalledWith(id)
    })
  })

  describe('setActiveSession', () => {
    it('sets the active session', () => {
      useSessionStore.getState().setActiveSession('some-id')
      expect(useSessionStore.getState().activeSessionId).toBe('some-id')
    })

    it('can set to null', () => {
      useSessionStore.getState().setActiveSession(null)
      expect(useSessionStore.getState().activeSessionId).toBeNull()
    })
  })

})
