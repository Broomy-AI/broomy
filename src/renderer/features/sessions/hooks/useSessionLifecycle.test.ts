// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionLifecycle } from './useSessionLifecycle'
import type { Session, StatusChip } from '../../../store/sessions'
import type { ProfileData } from '../../../store/profiles'

// Mock terminalBufferRegistry
vi.mock('../../../shared/utils/terminalBufferRegistry', () => ({
  terminalBufferRegistry: {
    getLastLines: vi.fn().mockReturnValue('mock terminal output'),
    getBuffer: vi.fn().mockReturnValue('mock buffer'),
    register: vi.fn(),
    unregister: vi.fn(),
    getSessionIds: vi.fn().mockReturnValue([]),
  },
}))

vi.mock('../../../shared/utils/ptyCaptureRegistry', () => ({
  ptyCaptureRegistry: {
    init: vi.fn(),
    recordOutput: vi.fn(),
    recordResize: vi.fn(),
    dispose: vi.fn(),
    hasRecorder: vi.fn().mockReturnValue(true),
    serializeAsciinema: vi.fn().mockReturnValue('{"version":2,"width":80,"height":24,"timestamp":0}\n[0,"o","hello"]\n'),
  },
}))

// Mock monacoProjectContext
vi.mock('../../../shared/utils/monacoProjectContext', () => ({
  loadMonacoProjectContext: vi.fn().mockResolvedValue(undefined),
}))

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'Test Session',
    directory: '/test/dir',
    branch: 'main',
    status: 'idle',
    agentId: null,
    panelVisibility: {},
    showExplorer: false,
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
    branchStatus: 'in-progress' as const,
    hasFeedback: false,
    checksStatus: 'none' as const,
    reviewState: 'none' as const,
    statusChip: 'in-progress' as StatusChip,
    isArchived: false,
    stage: 'planning',
    isRestored: false,
    ...overrides,
  }
}

function makeProfile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    id: 'default',
    name: 'Default',
    color: '#3b82f6',
    ...overrides,
  }
}

function makeHookParams(overrides: Partial<Parameters<typeof useSessionLifecycle>[0]> = {}) {
  return {
    sessions: [makeSession()],
    activeSession: makeSession(),
    activeSessionId: 'session-1',
    currentProfileId: 'default',
    currentProfile: makeProfile(),
    profiles: [makeProfile()],
    loadProfiles: vi.fn().mockResolvedValue(undefined),
    loadSessions: vi.fn().mockResolvedValue(undefined),
    loadAgents: vi.fn().mockResolvedValue(undefined),
    loadRepos: vi.fn().mockResolvedValue(undefined),
    checkGhAvailability: vi.fn().mockResolvedValue(undefined),
    checkGitAvailability: vi.fn().mockResolvedValue(undefined),
    switchProfile: vi.fn().mockResolvedValue(undefined),
    markSessionRead: vi.fn(),
    updateReviewStatus: vi.fn(),
    ...overrides,
  }
}

describe('useSessionLifecycle', () => {
  const cleanups: (() => void)[] = []

  // Wrapper to auto-track hook unmounts for proper cleanup
  function renderLifecycleHook(params: Parameters<typeof useSessionLifecycle>[0]) {
    const hookResult = renderHook(() => useSessionLifecycle(params))
    cleanups.push(hookResult.unmount)
    return hookResult
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(window.fs.exists).mockResolvedValue(true as never)
    document.title = ''
  })

  afterEach(() => {
    // Unmount all hooks to remove event listeners
    cleanups.forEach(fn => fn())
    cleanups.length = 0
    vi.useRealTimers()
  })

  describe('initialization', () => {
    it('calls loadProfiles on mount', async () => {
      const params = makeHookParams()
      renderLifecycleHook(params)

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(params.loadProfiles).toHaveBeenCalled()
    })

    it('loads sessions, agents, repos, and checks CLI availability after profiles load', async () => {
      const params = makeHookParams()
      renderLifecycleHook(params)

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(params.loadSessions).toHaveBeenCalledWith('default')
      expect(params.loadAgents).toHaveBeenCalledWith('default')
      expect(params.loadRepos).toHaveBeenCalledWith('default')
      expect(params.checkGhAvailability).toHaveBeenCalled()
      expect(params.checkGitAvailability).toHaveBeenCalled()
    })
  })

  describe('directory existence checking', () => {
    it('checks if session directories exist', async () => {
      vi.mocked(window.fs.exists).mockResolvedValue(true as never)
      const params = makeHookParams()
      const { result } = renderLifecycleHook(params)

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(window.fs.exists).toHaveBeenCalledWith('/test/dir')
      expect(result.current.activeDirectoryExists).toBe(true)
    })

    it('returns activeDirectoryExists false when directory does not exist', async () => {
      vi.mocked(window.fs.exists).mockResolvedValue(false as never)
      const params = makeHookParams()
      const { result } = renderLifecycleHook(params)

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(result.current.activeDirectoryExists).toBe(false)
    })

    it('defaults activeDirectoryExists to true when no active session', () => {
      const params = makeHookParams({
        activeSession: undefined,
        activeSessionId: null,
        sessions: [],
      })
      const { result } = renderLifecycleHook(params)

      expect(result.current.activeDirectoryExists).toBe(true)
    })

    it('does not check directories when there is no active session', async () => {
      const params = makeHookParams({ activeSession: undefined, activeSessionId: null, sessions: [] })
      renderLifecycleHook(params)

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(window.fs.exists).not.toHaveBeenCalledWith('/test/dir')
    })
  })

  describe('window title', () => {
    it('sets title to session name when there is an active session', () => {
      const params = makeHookParams()
      renderLifecycleHook(params)

      expect(document.title).toBe('Test Session — Broomy')
    })

    it('sets title to just Broomy when there is no active session', () => {
      const params = makeHookParams({
        activeSession: undefined,
        activeSessionId: null,
      })
      renderLifecycleHook(params)

      expect(document.title).toBe('Broomy')
    })

    it('includes profile name in title when there are multiple profiles', () => {
      const profile1 = makeProfile({ id: 'p1', name: 'Work' })
      const profile2 = makeProfile({ id: 'p2', name: 'Personal' })
      const params = makeHookParams({
        currentProfile: profile1,
        profiles: [profile1, profile2],
      })
      renderLifecycleHook(params)

      expect(document.title).toBe('Test Session [Work] — Broomy')
    })

    it('does not include profile name when there is only one profile', () => {
      const params = makeHookParams()
      renderLifecycleHook(params)

      expect(document.title).toBe('Test Session — Broomy')
    })

    it('includes profile name in Broomy title when no active session and multiple profiles', () => {
      const profile1 = makeProfile({ id: 'p1', name: 'Work' })
      const profile2 = makeProfile({ id: 'p2', name: 'Personal' })
      const params = makeHookParams({
        activeSession: undefined,
        activeSessionId: null,
        currentProfile: profile1,
        profiles: [profile1, profile2],
      })
      renderLifecycleHook(params)

      expect(document.title).toBe('Broomy [Work]')
    })
  })

  describe('markSessionRead on active session change', () => {
    it('marks the active session as read', () => {
      const params = makeHookParams()
      renderLifecycleHook(params)

      expect(params.markSessionRead).toHaveBeenCalledWith('session-1')
    })

    it('does not mark session as read when no active session', () => {
      const params = makeHookParams({
        activeSessionId: null,
      })
      renderLifecycleHook(params)

      expect(params.markSessionRead).not.toHaveBeenCalled()
    })
  })

  describe('review status check on session switch', () => {
    it('checks review status when switching to a review session', async () => {
      vi.mocked(window.gh.myReviewStatus).mockResolvedValue('reviewed' as never)
      const session = makeSession({ sessionType: 'review', prNumber: 42 })
      const params = makeHookParams({ activeSession: session, sessions: [session] })
      renderLifecycleHook(params)

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(window.gh.myReviewStatus).toHaveBeenCalledWith('/test/dir', 42)
      expect(params.updateReviewStatus).toHaveBeenCalledWith('session-1', 'reviewed')
    })

    it('does not check review status for non-review sessions', async () => {
      vi.mocked(window.gh.myReviewStatus).mockClear()
      const session = makeSession({ sessionType: undefined })
      const params = makeHookParams({ activeSession: session, sessions: [session] })
      renderLifecycleHook(params)

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(window.gh.myReviewStatus).not.toHaveBeenCalled()
    })

    it('updates to pending when review is re-requested', async () => {
      vi.mocked(window.gh.myReviewStatus).mockResolvedValue('pending' as never)
      const session = makeSession({ sessionType: 'review', prNumber: 10, reviewStatus: 'reviewed' })
      const params = makeHookParams({ activeSession: session, sessions: [session] })
      renderLifecycleHook(params)

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(params.updateReviewStatus).toHaveBeenCalledWith('session-1', 'pending')
    })
  })

  describe('handleSwitchProfile', () => {
    it('calls switchProfile with the given profileId', async () => {
      const params = makeHookParams()
      const { result } = renderLifecycleHook(params)

      await act(async () => {
        await result.current.handleSwitchProfile('profile-2')
      })

      expect(params.switchProfile).toHaveBeenCalledWith('profile-2')
    })
  })

  describe('Cmd+Shift+C keyboard shortcut', () => {
    it('saves an asciinema cast plus sidecar metadata via the save dialog', async () => {
      const { ptyCaptureRegistry } = await import('../../../shared/utils/ptyCaptureRegistry')
      vi.mocked(ptyCaptureRegistry.serializeAsciinema).mockReturnValue('{"version":2}\n[0,"o","hi"]\n')
      vi.mocked(window.dialog.saveFile).mockResolvedValue('/tmp/capture.cast')
      vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })

      const params = makeHookParams({
        activeSession: makeSession({
          name: 'My Session',
          directory: '/my/dir',
          status: 'idle',
          lastMessage: 'Done',
        }),
      })
      const { unmount } = renderLifecycleHook(params)

      const mockPreventDefault = vi.fn()
      const event = new KeyboardEvent('keydown', {
        key: 'c',
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      })
      Object.defineProperty(event, 'preventDefault', { value: mockPreventDefault })

      act(() => { window.dispatchEvent(event) })
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(mockPreventDefault).toHaveBeenCalled()
      expect(window.dialog.saveFile).toHaveBeenCalledWith(expect.objectContaining({
        defaultPath: expect.stringContaining('broomy-capture-my-session-'),
        filters: expect.arrayContaining([{ name: 'Asciinema cast', extensions: ['cast'] }]),
      }))
      expect(window.fs.writeFile).toHaveBeenCalledWith('/tmp/capture.cast', expect.stringContaining('version'))
      expect(window.fs.writeFile).toHaveBeenCalledWith('/tmp/capture.meta.json', expect.stringContaining('My Session'))

      unmount()
    })

    it('aborts when the user cancels the save dialog', async () => {
      vi.mocked(window.dialog.saveFile).mockResolvedValue(null)
      vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })

      const params = makeHookParams()
      const { unmount } = renderLifecycleHook(params)

      const event = new KeyboardEvent('keydown', { key: 'c', metaKey: true, shiftKey: true, bubbles: true })
      act(() => { window.dispatchEvent(event) })
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(window.dialog.saveFile).toHaveBeenCalled()
      expect(window.fs.writeFile).not.toHaveBeenCalled()
      unmount()
    })

    it('does not call preventDefault when no active session', () => {
      const params = makeHookParams({
        activeSession: undefined,
        activeSessionId: null,
      })
      const { unmount } = renderLifecycleHook(params)

      const mockPreventDefault = vi.fn()
      const event = new KeyboardEvent('keydown', {
        key: 'c',
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      })
      Object.defineProperty(event, 'preventDefault', { value: mockPreventDefault })

      act(() => { window.dispatchEvent(event) })
      expect(mockPreventDefault).not.toHaveBeenCalled()

      unmount()
    })

    it('cleans up the keyboard listener on unmount', () => {
      const params = makeHookParams()
      const { unmount } = renderLifecycleHook(params)

      const removeSpy = vi.spyOn(window, 'removeEventListener')
      unmount()

      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
      removeSpy.mockRestore()
    })
  })

  describe('Monaco project context loading', () => {
    it('loads Monaco project context when active session directory changes', async () => {
      const { loadMonacoProjectContext } = await import('../../../shared/utils/monacoProjectContext')
      const params = makeHookParams()
      renderLifecycleHook(params)

      expect(loadMonacoProjectContext).toHaveBeenCalledWith('/test/dir')
    })

    it('does not load Monaco context when activeSession has no directory', async () => {
      const { loadMonacoProjectContext } = await import('../../../shared/utils/monacoProjectContext')
      vi.mocked(loadMonacoProjectContext).mockClear()

      const params = makeHookParams({
        activeSession: undefined,
        activeSessionId: null,
      })
      renderLifecycleHook(params)

      expect(loadMonacoProjectContext).not.toHaveBeenCalled()
    })
  })
})
