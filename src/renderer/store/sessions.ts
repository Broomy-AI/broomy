import { create } from 'zustand'
import { basename } from 'path-browserify'

export type SessionStatus = 'working' | 'waiting' | 'idle' | 'error'

export interface Session {
  id: string
  name: string
  directory: string
  branch: string
  status: SessionStatus
  agentId: string | null
}

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null
  isLoading: boolean

  // Actions
  loadSessions: () => Promise<void>
  addSession: (directory: string, agentId: string | null) => Promise<void>
  removeSession: (id: string) => Promise<void>
  setActiveSession: (id: string | null) => void
  updateSessionBranch: (id: string, branch: string) => void
  refreshAllBranches: () => Promise<void>
}

const generateId = () => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isLoading: true,

  loadSessions: async () => {
    try {
      const config = await window.config.load()
      const sessions: Session[] = []

      for (const sessionData of config.sessions) {
        const branch = await window.git.getBranch(sessionData.directory)
        sessions.push({
          id: sessionData.id,
          name: sessionData.name,
          directory: sessionData.directory,
          branch,
          status: 'idle',
          agentId: sessionData.agentId ?? null,
        })
      }

      set({
        sessions,
        activeSessionId: sessions.length > 0 ? sessions[0].id : null,
        isLoading: false,
      })
    } catch {
      set({ sessions: [], activeSessionId: null, isLoading: false })
    }
  },

  addSession: async (directory: string, agentId: string | null) => {
    const isGitRepo = await window.git.isGitRepo(directory)
    if (!isGitRepo) {
      throw new Error('Selected directory is not a git repository')
    }

    const branch = await window.git.getBranch(directory)
    const name = basename(directory)
    const id = generateId()

    const newSession: Session = {
      id,
      name,
      directory,
      branch,
      status: 'idle',
      agentId,
    }

    const { sessions } = get()
    const updatedSessions = [...sessions, newSession]

    set({
      sessions: updatedSessions,
      activeSessionId: id,
    })

    // Persist to config - need to load existing config to preserve agents
    const config = await window.config.load()
    await window.config.save({
      agents: config.agents,
      sessions: updatedSessions.map((s) => ({
        id: s.id,
        name: s.name,
        directory: s.directory,
        agentId: s.agentId,
      })),
    })
  },

  removeSession: async (id: string) => {
    const { sessions, activeSessionId } = get()
    const updatedSessions = sessions.filter((s) => s.id !== id)

    // Update active session if we're removing the active one
    let newActiveId = activeSessionId
    if (activeSessionId === id) {
      newActiveId = updatedSessions.length > 0 ? updatedSessions[0].id : null
    }

    set({
      sessions: updatedSessions,
      activeSessionId: newActiveId,
    })

    // Persist to config - need to load existing config to preserve agents
    const config = await window.config.load()
    await window.config.save({
      agents: config.agents,
      sessions: updatedSessions.map((s) => ({
        id: s.id,
        name: s.name,
        directory: s.directory,
        agentId: s.agentId,
      })),
    })
  },

  setActiveSession: (id: string | null) => {
    set({ activeSessionId: id })
  },

  updateSessionBranch: (id: string, branch: string) => {
    const { sessions } = get()
    set({
      sessions: sessions.map((s) => (s.id === id ? { ...s, branch } : s)),
    })
  },

  refreshAllBranches: async () => {
    const { sessions, updateSessionBranch } = get()
    for (const session of sessions) {
      const branch = await window.git.getBranch(session.directory)
      if (branch !== session.branch) {
        updateSessionBranch(session.id, branch)
      }
    }
  },
}))
