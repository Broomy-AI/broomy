/**
 * Zustand store for Agent SDK chat sessions.
 *
 * Stores in-memory conversation messages for API-mode agent sessions.
 * Messages are not persisted to disk — the SDK's session resume handles context.
 */
import { create } from 'zustand'
import type { AgentSdkMessage, AgentSdkPermissionRequest, AgentSdkSessionState } from '../../shared/agentSdkTypes'

interface AgentChatSession {
  messages: AgentSdkMessage[]
  state: AgentSdkSessionState
  pendingPermission: AgentSdkPermissionRequest | null
  error: string | null
}

interface AgentChatStore {
  sessions: Record<string, AgentChatSession>
  getSession: (sessionId: string) => AgentChatSession
  addMessage: (sessionId: string, msg: AgentSdkMessage) => void
  setState: (sessionId: string, state: AgentSdkSessionState) => void
  setPendingPermission: (sessionId: string, req: AgentSdkPermissionRequest | null) => void
  setError: (sessionId: string, error: string | null) => void
  clearSession: (sessionId: string) => void
  replaceMessages: (sessionId: string, messages: AgentSdkMessage[]) => void
  clearQueuedFlag: (sessionId: string) => void
}

const DEFAULT_SESSION: AgentChatSession = {
  messages: [],
  state: 'idle',
  pendingPermission: null,
  error: null,
}

export const useAgentChatStore = create<AgentChatStore>((set, get) => ({
  sessions: {},

  getSession: (sessionId: string) => {
    return get().sessions[sessionId] ?? DEFAULT_SESSION
  },

  addMessage: (sessionId: string, msg: AgentSdkMessage) => {
    set((state) => {
      const session = state.sessions[sessionId] ?? { ...DEFAULT_SESSION }
      // Deduplicate by message ID (guards against double-delivery from
      // React strict mode re-registering IPC listeners)
      if (session.messages.some(m => m.id === msg.id)) return state
      // When a new agent message arrives, clear queued flags on prior user
      // messages — the agent has moved past them.
      const isAgentMsg = !msg.id.startsWith('user-') && !msg.id.startsWith('history-')
      const hasQueued = session.messages.some(m => m.queued)
      const messages = (isAgentMsg && hasQueued)
        ? session.messages.map(m => m.queued ? { ...m, queued: false } : m)
        : session.messages
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            messages: [...messages, msg],
          },
        },
      }
    })
  },

  setState: (sessionId: string, newState: AgentSdkSessionState) => {
    set((state) => {
      const session = state.sessions[sessionId] ?? { ...DEFAULT_SESSION }
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, state: newState },
        },
      }
    })
  },

  setPendingPermission: (sessionId: string, req: AgentSdkPermissionRequest | null) => {
    set((state) => {
      const session = state.sessions[sessionId] ?? { ...DEFAULT_SESSION }
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            pendingPermission: req,
            state: req ? 'awaiting_permission' : session.state,
          },
        },
      }
    })
  },

  setError: (sessionId: string, error: string | null) => {
    set((state) => {
      const session = state.sessions[sessionId] ?? { ...DEFAULT_SESSION }
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, error, state: error ? 'error' : session.state },
        },
      }
    })
  },

  clearSession: (sessionId: string) => {
    set((state) => {
      const { [sessionId]: _, ...rest } = state.sessions
      return { sessions: rest }
    })
  },

  replaceMessages: (sessionId: string, messages: AgentSdkMessage[]) => {
    set((state) => {
      const session = state.sessions[sessionId] ?? { ...DEFAULT_SESSION }
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, messages },
        },
      }
    })
  },

  clearQueuedFlag: (sessionId: string) => {
    set((state) => {
      const session = state.sessions[sessionId] ?? { ...DEFAULT_SESSION }
      if (!session.messages.some(m => m.queued)) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            messages: session.messages.map(m => m.queued ? { ...m, queued: false } : m),
          },
        },
      }
    })
  },
}))
