// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionKeyboardCallbacks } from './useSessionKeyboardCallbacks'
import type { Session } from '../store/sessions'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'my-repo',
    directory: '/repos/my-repo',
    branch: 'main',
    status: 'idle',
    agentId: null,
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
    terminalTabs: { tabs: [], activeTabId: null },
    branchStatus: 'in-progress',
    isArchived: false,
    ...overrides,
  } as Session
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    sessions: [
      makeSession({ id: 's1' }),
      makeSession({ id: 's2' }),
      makeSession({ id: 's3' }),
    ],
    activeSessionId: 's1',
    globalPanelVisibility: { sidebar: true } as Record<string, boolean>,
    toggleGlobalPanel: vi.fn(),
    archiveSession: vi.fn(),
    unarchiveSession: vi.fn(),
    handleSelectSession: vi.fn(),
    setShowShortcutsModal: vi.fn(),
    setActiveTerminalTab: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSessionKeyboardCallbacks', () => {
  describe('handleNextSession', () => {
    it('selects next session', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleNextSession())
      expect(deps.handleSelectSession).toHaveBeenCalledWith('s2')
    })

    it('wraps around to first session', () => {
      const deps = makeDeps({ activeSessionId: 's3' })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleNextSession())
      expect(deps.handleSelectSession).toHaveBeenCalledWith('s1')
    })

    it('does nothing when no active sessions', () => {
      const deps = makeDeps({ sessions: [] })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleNextSession())
      expect(deps.handleSelectSession).not.toHaveBeenCalled()
    })

    it('skips archived sessions', () => {
      const deps = makeDeps({
        sessions: [
          makeSession({ id: 's1' }),
          makeSession({ id: 's2', isArchived: true }),
          makeSession({ id: 's3' }),
        ],
      })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleNextSession())
      expect(deps.handleSelectSession).toHaveBeenCalledWith('s3')
    })

    it('selects first when activeSessionId not found', () => {
      const deps = makeDeps({ activeSessionId: 'nonexistent' })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleNextSession())
      expect(deps.handleSelectSession).toHaveBeenCalledWith('s1')
    })
  })

  describe('handlePrevSession', () => {
    it('selects previous session', () => {
      const deps = makeDeps({ activeSessionId: 's2' })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handlePrevSession())
      expect(deps.handleSelectSession).toHaveBeenCalledWith('s1')
    })

    it('wraps around to last session', () => {
      const deps = makeDeps({ activeSessionId: 's1' })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handlePrevSession())
      expect(deps.handleSelectSession).toHaveBeenCalledWith('s3')
    })

    it('does nothing when no active sessions', () => {
      const deps = makeDeps({ sessions: [] })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handlePrevSession())
      expect(deps.handleSelectSession).not.toHaveBeenCalled()
    })
  })

  describe('handleFocusSessionList', () => {
    it('opens sidebar if hidden', () => {
      const deps = makeDeps({ globalPanelVisibility: { sidebar: false } })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleFocusSessionList())
      expect(deps.toggleGlobalPanel).toHaveBeenCalledWith('sidebar')
    })

    it('does not toggle sidebar if already visible', () => {
      const deps = makeDeps({ globalPanelVisibility: { sidebar: true } })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleFocusSessionList())
      expect(deps.toggleGlobalPanel).not.toHaveBeenCalled()
    })
  })

  describe('handleFocusSessionSearch', () => {
    it('opens sidebar if hidden', () => {
      const deps = makeDeps({ globalPanelVisibility: { sidebar: false } })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleFocusSessionSearch())
      expect(deps.toggleGlobalPanel).toHaveBeenCalledWith('sidebar')
    })
  })

  describe('handleArchiveSession', () => {
    it('archives active session', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleArchiveSession())
      expect(deps.archiveSession).toHaveBeenCalledWith('s1')
    })

    it('unarchives active session that is already archived', () => {
      const deps = makeDeps({
        sessions: [makeSession({ id: 's1', isArchived: true })],
        activeSessionId: 's1',
      })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleArchiveSession())
      expect(deps.unarchiveSession).toHaveBeenCalledWith('s1')
    })

    it('does nothing when no active session', () => {
      const deps = makeDeps({ activeSessionId: null })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleArchiveSession())
      expect(deps.archiveSession).not.toHaveBeenCalled()
      expect(deps.unarchiveSession).not.toHaveBeenCalled()
    })

    it('does nothing when active session not found', () => {
      const deps = makeDeps({ activeSessionId: 'nonexistent' })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleArchiveSession())
      expect(deps.archiveSession).not.toHaveBeenCalled()
    })
  })

  describe('handleToggleSettings', () => {
    it('toggles settings panel', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleToggleSettings())
      expect(deps.toggleGlobalPanel).toHaveBeenCalledWith('settings')
    })
  })

  describe('handleShowShortcuts', () => {
    it('shows shortcuts modal', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleShowShortcuts())
      expect(deps.setShowShortcutsModal).toHaveBeenCalledWith(true)
    })
  })

  describe('handleNextTerminalTab / handlePrevTerminalTab', () => {
    it('cycles to next terminal tab', () => {
      const deps = makeDeps({
        sessions: [
          makeSession({
            id: 's1',
            terminalTabs: {
              tabs: [{ id: 't1', name: 'Term 1' }, { id: 't2', name: 'Term 2' }],
              activeTabId: '__agent__',
            },
          }),
        ],
        activeSessionId: 's1',
      })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleNextTerminalTab())
      expect(deps.setActiveTerminalTab).toHaveBeenCalledWith('s1', 't1')
    })

    it('cycles to previous terminal tab', () => {
      const deps = makeDeps({
        sessions: [
          makeSession({
            id: 's1',
            terminalTabs: {
              tabs: [{ id: 't1', name: 'Term 1' }, { id: 't2', name: 'Term 2' }],
              activeTabId: 't1',
            },
          }),
        ],
        activeSessionId: 's1',
      })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handlePrevTerminalTab())
      expect(deps.setActiveTerminalTab).toHaveBeenCalledWith('s1', '__agent__')
    })

    it('wraps around when cycling next past last tab', () => {
      const deps = makeDeps({
        sessions: [
          makeSession({
            id: 's1',
            terminalTabs: {
              tabs: [{ id: 't1', name: 'Term 1' }],
              activeTabId: 't1',
            },
          }),
        ],
        activeSessionId: 's1',
      })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleNextTerminalTab())
      expect(deps.setActiveTerminalTab).toHaveBeenCalledWith('s1', '__agent__')
    })

    it('does nothing when only agent tab exists', () => {
      const deps = makeDeps({
        sessions: [
          makeSession({
            id: 's1',
            terminalTabs: { tabs: [], activeTabId: null },
          }),
        ],
        activeSessionId: 's1',
      })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleNextTerminalTab())
      expect(deps.setActiveTerminalTab).not.toHaveBeenCalled()
    })

    it('does nothing when no active session', () => {
      const deps = makeDeps({ activeSessionId: null })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleNextTerminalTab())
      expect(deps.setActiveTerminalTab).not.toHaveBeenCalled()
    })

    it('does nothing when session not found', () => {
      const deps = makeDeps({ activeSessionId: 'nonexistent' })
      const { result } = renderHook(() => useSessionKeyboardCallbacks(deps))
      act(() => result.current.handleNextTerminalTab())
      expect(deps.setActiveTerminalTab).not.toHaveBeenCalled()
    })
  })
})
