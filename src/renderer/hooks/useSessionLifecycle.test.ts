// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionLifecycle } from './useSessionLifecycle'
import type { Session } from '../store/sessions'
import type { ProfileData } from '../store/profiles'
import { PANEL_IDS } from '../panels'

// Mock terminalBufferRegistry
vi.mock('../utils/terminalBufferRegistry', () => ({
  terminalBufferRegistry: {
    getLastLines: vi.fn().mockReturnValue('mock terminal output'),
    getBuffer: vi.fn().mockReturnValue('mock buffer'),
    register: vi.fn(),
    unregister: vi.fn(),
  },
}))

// Mock monacoProjectContext
vi.mock('../utils/monacoProjectContext', () => ({
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
    panelVisibility: { [PANEL_IDS.AGENT_TERMINAL]: true },
    showAgentTerminal: true,
    showUserTerminal: false,
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
      reviewPanelWidth: 320,
      tutorialPanelWidth: 320,
    },
    explorerFilter: 'files',
    lastMessage: null,
    lastMessageTime: null,
    isUnread: false,
    workingStartTime: null,
    recentFiles: [],
    terminalTabs: { tabs: [{ id: 'tab-1', name: 'Terminal' }], activeTabId: 'tab-1' },
    branchStatus: { status: 'unknown' },
    isArchived: false,
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
    refreshAllBranches: vi.fn(),
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

    it('does not check directories when sessions list is empty', async () => {
      const params = makeHookParams({ sessions: [] })
      renderLifecycleHook(params)

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      // fs.exists should not be called for directory checks (may be called for other reasons)
      // but specifically not with session directories since there are none
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

  describe('branch refresh polling', () => {
    it('polls for branch changes every 2 seconds when sessions exist', () => {
      const params = makeHookParams()
      renderLifecycleHook(params)

      expect(params.refreshAllBranches).not.toHaveBeenCalled()

      act(() => { vi.advanceTimersByTime(2000) })
      expect(params.refreshAllBranches).toHaveBeenCalledTimes(1)

      act(() => { vi.advanceTimersByTime(2000) })
      expect(params.refreshAllBranches).toHaveBeenCalledTimes(2)
    })

    it('does not poll when there are no sessions', () => {
      const params = makeHookParams({ sessions: [] })
      renderLifecycleHook(params)

      act(() => { vi.advanceTimersByTime(4000) })
      expect(params.refreshAllBranches).not.toHaveBeenCalled()
    })

    it('cleans up interval on unmount', () => {
      const params = makeHookParams()
      const { unmount } = renderLifecycleHook(params)

      unmount()

      act(() => { vi.advanceTimersByTime(4000) })
      expect(params.refreshAllBranches).not.toHaveBeenCalled()
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
    it('copies terminal content and session info to clipboard', () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      })

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

      expect(mockPreventDefault).toHaveBeenCalled()
      expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('My Session'))
      expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('/my/dir'))
      expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('idle'))
      expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('Done'))

      // Clean up to avoid listener leak to next test
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
      // The handler returns early when !activeSession, so preventDefault is NOT called
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
      const { loadMonacoProjectContext } = await import('../utils/monacoProjectContext')
      const params = makeHookParams()
      renderLifecycleHook(params)

      expect(loadMonacoProjectContext).toHaveBeenCalledWith('/test/dir')
    })

    it('does not load Monaco context when activeSession has no directory', async () => {
      const { loadMonacoProjectContext } = await import('../utils/monacoProjectContext')
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
