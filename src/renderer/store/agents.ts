/**
 * Agent definitions store for managing AI coding agent configurations.
 *
 * Stores the list of available agents (each with a name and shell command) and
 * provides CRUD actions. Every mutation updates Zustand state immediately, then
 * triggers a unified debounced save via configPersistence (which assembles the
 * complete config from all stores before writing).
 */
import { create } from 'zustand'
import type { AgentData } from '../../preload/index'
import { scheduleSave, setLoadedCounts } from './configPersistence'

export type AgentConfig = AgentData

interface AgentStore {
  agents: AgentConfig[]
  isLoading: boolean
  profileId?: string

  // Actions
  loadAgents: (profileId?: string) => Promise<void>
  addAgent: (agent: Omit<AgentConfig, 'id'>) => void
  updateAgent: (id: string, updates: Partial<Omit<AgentConfig, 'id'>>) => void
  removeAgent: (id: string) => void
}

const generateId = () => `agent-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  isLoading: true,

  loadAgents: async (profileId?: string) => {
    if (profileId !== undefined) {
      set({ profileId })
    }
    const pid = profileId ?? get().profileId
    try {
      const config = await window.config.load(pid)
      set({ agents: config.agents, isLoading: false, profileId: pid })
      setLoadedCounts({ agents: config.agents.length })
    } catch {
      set({ agents: [], isLoading: false })
    }
  },

  addAgent: (agentData) => {
    const agent: AgentConfig = {
      id: generateId(),
      ...agentData,
    }

    const { agents } = get()
    const updatedAgents = [...agents, agent]
    set({ agents: updatedAgents })
    scheduleSave()
  },

  updateAgent: (id, updates) => {
    const { agents } = get()
    const updatedAgents = agents.map((a) =>
      a.id === id ? { ...a, ...updates } : a
    )
    set({ agents: updatedAgents })
    scheduleSave()
  },

  removeAgent: (id) => {
    const { agents } = get()
    const updatedAgents = agents.filter((a) => a.id !== id)
    set({ agents: updatedAgents })
    scheduleSave()
  },
}))
