/**
 * Hook that connects the AgentChat UI to the Agent SDK IPC bridge.
 *
 * The main process uses the V1 query() API with `resume` for multi-turn
 * conversations.  First message triggers agentSdk:start; follow-ups use
 * agentSdk:send which creates a new query with resume — token-efficient,
 * no replayed history.
 *
 * ## Turn phase state machine
 *
 *   ┌─────┐  sendPrompt   ┌────────┐  onDone / onError   ┌──────┐
 *   │ new │ ──(start())──▶ │ active │ ──────────────────▶  │ idle │
 *   └─────┘                └────────┘                      └──────┘
 *      ▲                       ▲  │                           │
 *      │                       │  └──── sendPrompt (queues) ──┘
 *      │                       └─────── sendPrompt (send()) ──┘
 *      └──────────── stop ─── (any)
 */
import { useEffect, useCallback, useRef, useState } from 'react'
import { useAgentChatStore } from '../../../store/agentChat'
import { useSessionStore } from '../../../store/sessions'
import type { AgentSdkMessage } from '../../../../shared/agentSdkTypes'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let userMsgCounter = 0
function nextUserMsgId(): string {
  return `user-${String(++userMsgCounter)}-${String(Date.now())}`
}

/** Look up the persisted SDK session ID for a given Broomy session. */
function getStoredSdkSessionId(sessionId: string): string | undefined {
  return useSessionStore.getState().sessions.find(s => s.id === sessionId)?.sdkSessionId
}

/** Add a user-authored message to the chat store. */
function addUserMessage(sessionId: string, text: string, queued?: boolean): void {
  useAgentChatStore.getState().addMessage(sessionId, {
    id: nextUserMsgId(),
    type: 'text',
    timestamp: Date.now(),
    text,
    ...(queued ? { queued: true } : {}),
  })
}

/**
 * Resolve the SDK session ID to use for resume.
 * Prefers the persisted value from the store; falls back to the prop.
 * Returns undefined if neither has a non-empty value.
 */
function resolveResumeId(sessionId: string, sdkSessionIdProp?: string): string | undefined {
  const stored = getStoredSdkSessionId(sessionId)
  if (stored && stored.length > 0) return stored
  if (sdkSessionIdProp && sdkSessionIdProp.length > 0) return sdkSessionIdProp
  return undefined
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Turn phase tracks the lifecycle of the agent session in the main process.
 *
 * - `new`:    No query created yet (or session was stopped). Next send uses start().
 * - `idle`:   A query has completed. Next send uses send() (token-efficient resume).
 * - `active`: A query is currently running. Sends are queued via inject().
 */
type TurnPhase = 'new' | 'idle' | 'active'

interface UseAgentSdkOptions {
  sessionId: string
  cwd: string
  sdkSessionId?: string
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'
  env?: Record<string, string>
  model?: string
  effort?: 'low' | 'medium' | 'high' | 'max'
}

interface CommandInfo {
  name: string
  description: string
}

interface HistoryMeta {
  total: number
  loaded: number
}

interface UseAgentSdkReturn {
  sendPrompt: (prompt: string) => void
  stopAgent: () => void
  respondToPermission: (toolUseId: string, allowed: boolean, updatedInput?: Record<string, unknown>) => void
  availableCommands: CommandInfo[]
  historyMeta: HistoryMeta | null
  loadFullHistory: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAgentSdk(options: UseAgentSdkOptions): UseAgentSdkReturn {
  const { sessionId, cwd, sdkSessionId, permissionMode, env, model, effort } = options

  const phaseRef = useRef<TurnPhase>('new')

  // Messages queued while the agent is running, sent as a proper new turn
  // when the current turn finishes.  We don't use the SDK's streamInput
  // because it isn't reliably visible to the SDK — queued messages would be
  // lost if the local store is ever refreshed from the SDK transcript.
  const pendingQueueRef = useRef<string[]>([])
  // Ref so the onDone handler (registered once) always calls the latest version
  const sendNextQueuedRef = useRef<() => void>(() => {})

  const [availableCommands, setAvailableCommands] = useState<CommandInfo[]>([])
  const [historyMeta, setHistoryMeta] = useState<HistoryMeta | null>(null)

  // --- History loading ------------------------------------------------------
  //
  // History messages are buffered into `historyBufferRef` and atomically
  // replace existing messages via `replaceMessages` when the load completes.
  // If the load fails, existing messages are left untouched and the guard key
  // is reset so the next mount/visit can retry.
  //
  // A generation counter (`loadGenRef`) ensures that if a second load starts
  // while the first is in-flight, the first load's callbacks become no-ops.

  const historyLoadedRef = useRef<string | null>(null)
  const historyBufferRef = useRef<AgentSdkMessage[]>([])
  const isLoadingHistoryRef = useRef(false)
  const loadGenRef = useRef(0)

  const startHistoryLoad = useCallback((sdkId: string, limit?: number) => {
    const gen = ++loadGenRef.current
    historyBufferRef.current = []
    isLoadingHistoryRef.current = true

    window.agentSdk.loadHistory(sdkId, sessionId, env, limit)
      .then(() => {
        if (loadGenRef.current !== gen) return
        useAgentChatStore.getState().replaceMessages(sessionId, historyBufferRef.current)
      })
      .catch(() => {
        if (loadGenRef.current !== gen) return
        historyLoadedRef.current = null
      })
      .finally(() => {
        if (loadGenRef.current !== gen) return
        isLoadingHistoryRef.current = false
        historyBufferRef.current = []
      })
  }, [sessionId, env])

  // --- Effects --------------------------------------------------------------

  useEffect(() => {
    void window.agentSdk.commands(cwd, env).then(setAvailableCommands)
  }, [cwd, env])

  useEffect(() => {
    const currentSdkId = getStoredSdkSessionId(sessionId) ?? sdkSessionId
    if (!currentSdkId || currentSdkId.length === 0) return
    const key = `${sessionId}:${currentSdkId}`
    if (historyLoadedRef.current === key) return
    historyLoadedRef.current = key
    startHistoryLoad(currentSdkId)
  }, [sessionId, sdkSessionId, env, startHistoryLoad])

  useEffect(() => {
    const cleanups: (() => void)[] = []

    cleanups.push(window.agentSdk.onMessage(sessionId, (msg: AgentSdkMessage) => {
      const isHistory = msg.id.startsWith('history-')

      if (isHistory && isLoadingHistoryRef.current) {
        historyBufferRef.current.push(msg)
      } else {
        useAgentChatStore.getState().addMessage(sessionId, msg)
      }

      if (!isHistory && (msg.type === 'text' || msg.type === 'tool_use')) {
        useSessionStore.getState().updateAgentMonitor(sessionId, {
          status: 'working',
          lastMessage: msg.text ?? msg.toolName ?? undefined,
        })
      }
    }))

    cleanups.push(window.agentSdk.onDone(sessionId, (returnedSdkSessionId: string) => {
      phaseRef.current = 'idle'
      if (returnedSdkSessionId && returnedSdkSessionId.length > 0) {
        useSessionStore.getState().setSdkSessionId(sessionId, returnedSdkSessionId)
      }
      // If the user queued messages while the agent was working, send the
      // next one as a proper new turn now that the SDK is idle.
      if (pendingQueueRef.current.length > 0) {
        sendNextQueuedRef.current()
      } else {
        useAgentChatStore.getState().clearQueuedFlag(sessionId)
        useAgentChatStore.getState().setState(sessionId, 'idle')
        useSessionStore.getState().updateAgentMonitor(sessionId, { status: 'idle' })
      }
    }))

    cleanups.push(window.agentSdk.onError(sessionId, (error: string) => {
      // Transition to idle, NOT back to new — the session still exists in the
      // main process and errors are transient (rate limits, timeouts, etc.).
      // We intentionally preserve sdkSessionId to keep the history link.
      phaseRef.current = 'idle'
      pendingQueueRef.current = []
      useAgentChatStore.getState().setError(sessionId, error)
      useAgentChatStore.getState().addMessage(sessionId, {
        id: `error-${String(Date.now())}`,
        type: 'error',
        timestamp: Date.now(),
        text: error,
      })
      useSessionStore.getState().updateAgentMonitor(sessionId, { status: 'idle' })
    }))

    cleanups.push(window.agentSdk.onPermissionRequest(sessionId, (req) => {
      useAgentChatStore.getState().setPendingPermission(sessionId, req)
    }))

    cleanups.push(window.agentSdk.onHistoryMeta(sessionId, (meta) => {
      setHistoryMeta(meta)
    }))

    return () => { cleanups.forEach((fn) => fn()) }
  }, [sessionId])

  // --- Actions --------------------------------------------------------------

  // Send the next queued message as a proper new turn.  Called from onDone
  // (via ref) after the current turn finishes so the SDK actually sees it.
  const sendNextQueued = useCallback(() => {
    if (pendingQueueRef.current.length === 0) return
    const next = pendingQueueRef.current.shift()!
    useAgentChatStore.getState().clearQueuedFlag(sessionId)
    phaseRef.current = 'active'
    useAgentChatStore.getState().setState(sessionId, 'running')
    useSessionStore.getState().updateAgentMonitor(sessionId, { status: 'working' })
    void window.agentSdk.send(sessionId, next, {
      cwd, permissionMode, env, model, effort,
      sdkSessionId: getStoredSdkSessionId(sessionId),
    })
  }, [sessionId, cwd, permissionMode, env, model, effort])
  sendNextQueuedRef.current = sendNextQueued

  // Queue a message to be sent after the current turn finishes.
  // Only called from sendPrompt when phaseRef is 'active'.
  const queuePrompt = useCallback((prompt: string) => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    addUserMessage(sessionId, trimmed, true)
    pendingQueueRef.current.push(trimmed)
  }, [sessionId])

  // Single entry point for all user messages.
  const sendPrompt = useCallback((prompt: string) => {
    if (phaseRef.current === 'active') {
      queuePrompt(prompt)
      return
    }

    const trimmed = prompt.trim()

    // Intercept commands the SDK doesn't support
    if (trimmed === '/login') {
      addUserMessage(sessionId, trimmed)
      phaseRef.current = 'active'
      useAgentChatStore.getState().setState(sessionId, 'running')
      void window.agentSdk.login(sessionId)
      return
    }
    if (trimmed === '/status') {
      addUserMessage(sessionId, trimmed)
      void window.agentSdk.status(sessionId, env)
      return
    }

    // Capture the phase before transitioning — determines start() vs send().
    const wasNew = phaseRef.current === 'new'
    phaseRef.current = 'active'

    useAgentChatStore.getState().setState(sessionId, 'running')
    useAgentChatStore.getState().setError(sessionId, null)
    useSessionStore.getState().updateAgentMonitor(sessionId, { status: 'working' })
    addUserMessage(sessionId, prompt)

    if (wasNew) {
      void window.agentSdk.start({
        id: sessionId,
        prompt,
        cwd,
        sdkSessionId: resolveResumeId(sessionId, sdkSessionId),
        permissionMode,
        env,
        model,
        effort,
      })
    } else {
      // Use getStoredSdkSessionId (not resolveResumeId) — the send() path only
      // fires after a session has been started, so the prop fallback is unnecessary.
      void window.agentSdk.send(sessionId, prompt, {
        cwd, permissionMode, env, model, effort,
        sdkSessionId: getStoredSdkSessionId(sessionId),
      })
    }
  }, [sessionId, cwd, sdkSessionId, permissionMode, env, model, effort, queuePrompt])

  const stopAgent = useCallback(() => {
    void window.agentSdk.stop(sessionId)
    phaseRef.current = 'new'
    pendingQueueRef.current = []
    useAgentChatStore.getState().setState(sessionId, 'idle')
    useSessionStore.getState().updateAgentMonitor(sessionId, { status: 'idle' })
  }, [sessionId])

  const respondToPermission = useCallback((toolUseId: string, allowed: boolean, updatedInput?: Record<string, unknown>) => {
    void window.agentSdk.respondToPermission(sessionId, toolUseId, allowed, updatedInput)
    useAgentChatStore.getState().setPendingPermission(sessionId, null)
    if (allowed) {
      useAgentChatStore.getState().setState(sessionId, 'running')
    }
  }, [sessionId])

  const loadFullHistory = useCallback(() => {
    const sdkId = getStoredSdkSessionId(sessionId)
    if (sdkId && sdkId.length > 0) {
      setHistoryMeta(null)
      startHistoryLoad(sdkId, 9999)
    }
  }, [sessionId, startHistoryLoad])

  return { sendPrompt, stopAgent, respondToPermission, availableCommands, historyMeta, loadFullHistory }
}
