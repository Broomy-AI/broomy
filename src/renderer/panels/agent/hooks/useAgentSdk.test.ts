// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAgentSdk } from './useAgentSdk'
import { useAgentChatStore } from '../../../store/agentChat'
import { useSessionStore, type StatusChip } from '../../../store/sessions'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../../../panels/system/types'
import type { AgentSdkMessage } from '../../../../shared/agentSdkTypes'

// --- Helpers ---

function makeMsg(overrides: Partial<AgentSdkMessage> & { id: string }): AgentSdkMessage {
  return { type: 'text', timestamp: Date.now(), text: 'hello', ...overrides }
}

function makeSession(id: string, sdkSessionId?: string) {
  return {
    id, name: 'test', directory: '/test', branch: 'main',
    status: 'idle' as const, agentId: null, panelVisibility: {},
    showExplorer: false, showFileViewer: false, showDiff: false,
    selectedFilePath: null, planFilePath: null,
    fileViewerPosition: 'top' as const,
    layoutSizes: { explorerWidth: 256, fileViewerSize: 300, userTerminalHeight: 192, diffPanelWidth: 320, tutorialPanelWidth: 320 },
    explorerFilter: 'files' as const,
    lastMessage: null, lastMessageTime: null, isUnread: false,
    workingStartTime: null, recentFiles: [], searchHistory: [],
    terminalTabs: { tabs: [], activeTabId: '__agent__' },
    branchStatus: 'in-progress' as const, hasFeedback: false,
    checksStatus: 'none' as const, statusChip: 'in-progress' as StatusChip,
    isArchived: false, isRestored: false,
    sdkSessionId,
  }
}

const defaultStoreState = {
  activeSessionId: 'session-1',
  isLoading: false,
  showSidebar: true,
  showSettings: false,
  sidebarWidth: 224,
  toolbarPanels: [...DEFAULT_TOOLBAR_PANELS],
  globalPanelVisibility: {
    [PANEL_IDS.SIDEBAR]: true,
    [PANEL_IDS.SETTINGS]: false,
  },
}

// --- Captured IPC callbacks ---

type MessageCb = (msg: AgentSdkMessage) => void
type DoneCb = (sdkSessionId: string) => void
type ErrorCb = (error: string) => void

let messageCb: MessageCb
let doneCb: DoneCb
let errorCb: ErrorCb

function setupIpcMocks() {
  vi.mocked(window.agentSdk.onMessage).mockImplementation((_id, cb) => {
    messageCb = cb
    return () => undefined
  })
  vi.mocked(window.agentSdk.onDone).mockImplementation((_id, cb) => {
    doneCb = cb
    return () => undefined
  })
  vi.mocked(window.agentSdk.onError).mockImplementation((_id, cb) => {
    errorCb = cb
    return () => undefined
  })
  vi.mocked(window.agentSdk.onPermissionRequest).mockReturnValue(() => undefined)
  vi.mocked(window.agentSdk.onHistoryMeta).mockReturnValue(() => undefined)
  vi.mocked(window.agentSdk.commands).mockResolvedValue([])
}

const defaultHookOptions = {
  sessionId: 'session-1',
  cwd: '/test',
}

// --- Tests ---

describe('useAgentSdk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAgentChatStore.setState({ sessions: {} })
    useSessionStore.setState({
      ...defaultStoreState,
      sessions: [makeSession('session-1', 'sdk-abc')],
    })
    setupIpcMocks()
  })

  describe('error handling (Bug 1: sdkSessionId preservation)', () => {
    it('does not clear sdkSessionId on error', () => {
      vi.mocked(window.agentSdk.loadHistory).mockResolvedValue(undefined)
      renderHook(() => useAgentSdk(defaultHookOptions))

      act(() => {
        errorCb('Rate limit exceeded')
      })

      const session = useSessionStore.getState().sessions.find(s => s.id === 'session-1')
      expect(session?.sdkSessionId).toBe('sdk-abc')
    })

    it('adds error message to chat on error', () => {
      vi.mocked(window.agentSdk.loadHistory).mockResolvedValue(undefined)
      renderHook(() => useAgentSdk(defaultHookOptions))

      act(() => {
        errorCb('Network timeout')
      })

      const chatSession = useAgentChatStore.getState().getSession('session-1')
      const errorMsg = chatSession.messages.find(m => m.type === 'error')
      expect(errorMsg).toBeDefined()
      expect(errorMsg!.text).toBe('Network timeout')
    })

    it('sets error state on chat session', () => {
      vi.mocked(window.agentSdk.loadHistory).mockResolvedValue(undefined)
      renderHook(() => useAgentSdk(defaultHookOptions))

      act(() => {
        errorCb('Something broke')
      })

      const chatSession = useAgentChatStore.getState().getSession('session-1')
      expect(chatSession.error).toBe('Something broke')
    })

    it('error transitions to idle — sendPrompt uses send() not start() after error', () => {
      vi.mocked(window.agentSdk.loadHistory).mockResolvedValue(undefined)
      const { result } = renderHook(() => useAgentSdk(defaultHookOptions))

      // First message — starts the session
      act(() => { result.current.sendPrompt('hello') })
      expect(vi.mocked(window.agentSdk.start)).toHaveBeenCalledTimes(1)

      // Done callback so isRunning resets
      act(() => { doneCb('sdk-abc') })

      // Error on some later operation
      act(() => { errorCb('transient failure') })

      // Next message should use send() (not start()) because session still exists
      act(() => { result.current.sendPrompt('retry') })
      expect(vi.mocked(window.agentSdk.send)).toHaveBeenCalledTimes(1)
      // start should still only have been called once (for the first message)
      expect(vi.mocked(window.agentSdk.start)).toHaveBeenCalledTimes(1)
    })
  })

  describe('history loading (Bug 2: atomic replacement)', () => {
    it('buffers history messages during load and replaces atomically on success', async () => {
      // Pre-populate with existing messages
      useAgentChatStore.getState().addMessage('session-1', makeMsg({ id: 'existing-1', text: 'old' }))

      let resolveLoad!: () => void
      vi.mocked(window.agentSdk.loadHistory).mockReturnValue(
        new Promise<void>((resolve) => { resolveLoad = resolve })
      )

      renderHook(() => useAgentSdk(defaultHookOptions))

      // Simulate history messages arriving during load
      const historyMsg1 = makeMsg({ id: 'history-user-1', text: 'user said hi' })
      const historyMsg2 = makeMsg({ id: 'history-asst-1', text: 'assistant replied' })
      act(() => {
        messageCb(historyMsg1)
        messageCb(historyMsg2)
      })

      // While loading, history messages should NOT be in the store yet
      // (they're buffered), and old messages should still be present
      const duringLoad = useAgentChatStore.getState().getSession('session-1')
      expect(duringLoad.messages.find(m => m.id === 'existing-1')).toBeDefined()
      expect(duringLoad.messages.find(m => m.id === 'history-user-1')).toBeUndefined()

      // Complete the load
      act(() => { resolveLoad() })

      // After load, messages are atomically replaced with history
      await waitFor(() => {
        const afterLoad = useAgentChatStore.getState().getSession('session-1')
        expect(afterLoad.messages).toHaveLength(2)
        expect(afterLoad.messages[0].id).toBe('history-user-1')
        expect(afterLoad.messages[1].id).toBe('history-asst-1')
      })
    })

    it('preserves existing messages when history load fails', async () => {
      useAgentChatStore.getState().addMessage('session-1', makeMsg({ id: 'existing-1', text: 'keep me' }))

      vi.mocked(window.agentSdk.loadHistory).mockRejectedValue(new Error('SDK error'))

      renderHook(() => useAgentSdk(defaultHookOptions))

      // Wait for the rejected promise to settle
      await waitFor(() => {
        const session = useAgentChatStore.getState().getSession('session-1')
        // Existing messages must be preserved
        expect(session.messages).toHaveLength(1)
        expect(session.messages[0].id).toBe('existing-1')
      })
    })

    it('allows retry after history load failure', async () => {
      // First call fails
      vi.mocked(window.agentSdk.loadHistory).mockRejectedValueOnce(new Error('fail'))
      const { unmount } = renderHook(() => useAgentSdk(defaultHookOptions))
      await waitFor(() => {
        expect(vi.mocked(window.agentSdk.loadHistory)).toHaveBeenCalledTimes(1)
      })
      unmount()

      // Second mount should retry (historyLoadedRef was reset on failure)
      vi.mocked(window.agentSdk.loadHistory).mockResolvedValue(undefined)
      renderHook(() => useAgentSdk(defaultHookOptions))

      await waitFor(() => {
        expect(vi.mocked(window.agentSdk.loadHistory)).toHaveBeenCalledTimes(2)
      })
    })

    it('skips history loading when no sdkSessionId exists', () => {
      useSessionStore.setState({
        ...defaultStoreState,
        sessions: [makeSession('session-1', undefined)],
      })

      renderHook(() => useAgentSdk(defaultHookOptions))

      expect(vi.mocked(window.agentSdk.loadHistory)).not.toHaveBeenCalled()
    })

    it('supersedes an in-flight load when a new load starts (generation counter)', async () => {
      // Load A starts (mount-time)
      let resolveLoadA!: () => void
      vi.mocked(window.agentSdk.loadHistory).mockReturnValueOnce(
        new Promise<void>((resolve) => { resolveLoadA = resolve })
      )

      const { result } = renderHook(() => useAgentSdk(defaultHookOptions))

      // Load A messages arrive
      act(() => {
        messageCb(makeMsg({ id: 'history-a-1', text: 'from load A' }))
      })

      // Load B starts (user clicks "load full history") before A finishes
      let resolveLoadB!: () => void
      vi.mocked(window.agentSdk.loadHistory).mockReturnValueOnce(
        new Promise<void>((resolve) => { resolveLoadB = resolve })
      )
      act(() => { result.current.loadFullHistory() })

      // Load B messages arrive
      act(() => {
        messageCb(makeMsg({ id: 'history-b-1', text: 'from load B' }))
        messageCb(makeMsg({ id: 'history-b-2', text: 'from load B too' }))
      })

      // Load A finishes — should be a no-op since Load B superseded it
      act(() => { resolveLoadA() })
      await waitFor(() => {
        // Load A's replaceMessages should NOT have fired
        const session = useAgentChatStore.getState().getSession('session-1')
        // Messages should not have been replaced with load A's stale buffer
        expect(session.messages.find(m => m.id === 'history-a-1')).toBeUndefined()
      })

      // Load B finishes — should apply its buffer
      act(() => { resolveLoadB() })
      await waitFor(() => {
        const session = useAgentChatStore.getState().getSession('session-1')
        expect(session.messages).toHaveLength(2)
        expect(session.messages[0].id).toBe('history-b-1')
        expect(session.messages[1].id).toBe('history-b-2')
      })
    })

    it('routes non-history messages to store immediately during load', async () => {
      let resolveLoad!: () => void
      vi.mocked(window.agentSdk.loadHistory).mockReturnValue(
        new Promise<void>((resolve) => { resolveLoad = resolve })
      )

      renderHook(() => useAgentSdk(defaultHookOptions))

      // Live message arrives while history is loading
      const liveMsg = makeMsg({ id: 'sdk-msg-1', type: 'text', text: 'live update' })
      act(() => { messageCb(liveMsg) })

      // Live messages go straight to the store
      const session = useAgentChatStore.getState().getSession('session-1')
      expect(session.messages.find(m => m.id === 'sdk-msg-1')).toBeDefined()

      act(() => { resolveLoad() })
    })
  })

  describe('sendPrompt', () => {
    it('uses start() for the first message', () => {
      vi.mocked(window.agentSdk.loadHistory).mockResolvedValue(undefined)
      const { result } = renderHook(() => useAgentSdk(defaultHookOptions))

      act(() => { result.current.sendPrompt('hello world') })

      expect(vi.mocked(window.agentSdk.start)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(window.agentSdk.start)).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'session-1',
          prompt: 'hello world',
          sdkSessionId: 'sdk-abc',
        })
      )
    })

    it('uses send() for subsequent messages', () => {
      vi.mocked(window.agentSdk.loadHistory).mockResolvedValue(undefined)
      const { result } = renderHook(() => useAgentSdk(defaultHookOptions))

      // First message
      act(() => { result.current.sendPrompt('first') })
      // Mark as done
      act(() => { doneCb('sdk-abc') })
      // Second message
      act(() => { result.current.sendPrompt('second') })

      expect(vi.mocked(window.agentSdk.send)).toHaveBeenCalledTimes(1)
    })

    it('queues when agent is running and sends on done', () => {
      vi.mocked(window.agentSdk.loadHistory).mockResolvedValue(undefined)
      const { result } = renderHook(() => useAgentSdk(defaultHookOptions))

      act(() => { result.current.sendPrompt('first') })
      // Agent is now running — second message should be queued locally (not injected)
      act(() => { result.current.sendPrompt('queued msg') })

      expect(vi.mocked(window.agentSdk.inject)).not.toHaveBeenCalled()
      // Message should be in the store with queued flag
      const msgs = useAgentChatStore.getState().getSession('session-1').messages
      expect(msgs.some(m => m.text === 'queued msg' && m.queued)).toBe(true)

      // When the turn finishes, the queued message should be sent as a new turn
      act(() => { doneCb('sdk-id-1') })
      expect(vi.mocked(window.agentSdk.send)).toHaveBeenCalledWith(
        'session-1', 'queued msg', expect.objectContaining({ cwd: '/test' }),
      )
    })
  })

  describe('done handler', () => {
    it('stores returned sdkSessionId', () => {
      vi.mocked(window.agentSdk.loadHistory).mockResolvedValue(undefined)
      renderHook(() => useAgentSdk(defaultHookOptions))

      act(() => { doneCb('new-sdk-id-123') })

      const session = useSessionStore.getState().sessions.find(s => s.id === 'session-1')
      expect(session?.sdkSessionId).toBe('new-sdk-id-123')
    })

    it('does not overwrite sdkSessionId with empty string', () => {
      vi.mocked(window.agentSdk.loadHistory).mockResolvedValue(undefined)
      renderHook(() => useAgentSdk(defaultHookOptions))

      act(() => { doneCb('') })

      const session = useSessionStore.getState().sessions.find(s => s.id === 'session-1')
      expect(session?.sdkSessionId).toBe('sdk-abc')
    })
  })

  describe('stopAgent', () => {
    it('calls stop IPC and resets state', () => {
      vi.mocked(window.agentSdk.loadHistory).mockResolvedValue(undefined)
      const { result } = renderHook(() => useAgentSdk(defaultHookOptions))

      act(() => { result.current.stopAgent() })

      expect(vi.mocked(window.agentSdk.stop)).toHaveBeenCalledWith('session-1')
    })

    it('allows start() to be used again after stop', () => {
      vi.mocked(window.agentSdk.loadHistory).mockResolvedValue(undefined)
      const { result } = renderHook(() => useAgentSdk(defaultHookOptions))

      // Start, then stop, then send again
      act(() => { result.current.sendPrompt('first') })
      act(() => { result.current.stopAgent() })
      act(() => { result.current.sendPrompt('after stop') })

      // Should call start again (not send) because stop destroys the session
      expect(vi.mocked(window.agentSdk.start)).toHaveBeenCalledTimes(2)
    })
  })
})
