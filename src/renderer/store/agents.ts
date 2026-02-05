import { create } from 'zustand'
import type { AgentData } from '../../preload/index'

export type AgentConfig = AgentData

interface AgentStore {
  agents: AgentConfig[]
  isLoading: boolean
  profileId?: string

  // Actions
  loadAgents: (profileId?: string) => Promise<void>
  addAgent: (agent: Omit<AgentConfig, 'id'>) => Promise<void>
  updateAgent: (id: string, updates: Partial<Omit<AgentConfig, 'id'>>) => Promise<void>
  removeAgent: (id: string) => Promise<void>
}

const generateId = () => `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

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
      set({ agents: config.agents || [], isLoading: false, profileId: pid })
    } catch {
      set({ agents: [], isLoading: false })
    }
  },

  addAgent: async (agentData) => {
    const agent: AgentConfig = {
      id: generateId(),
      ...agentData,
    }

    const { agents, profileId } = get()
    const updatedAgents = [...agents, agent]
    set({ agents: updatedAgents })

    // Persist to config
    const config = await window.config.load(profileId)
    await window.config.save({
      ...config,
      profileId,
      agents: updatedAgents,
    })
  },

  updateAgent: async (id, updates) => {
    const { agents, profileId } = get()
    const updatedAgents = agents.map((a) =>
      a.id === id ? { ...a, ...updates } : a
    )
    set({ agents: updatedAgents })

    // Persist to config
    const config = await window.config.load(profileId)
    await window.config.save({
      ...config,
      profileId,
      agents: updatedAgents,
    })
  },

  removeAgent: async (id) => {
    const { agents, profileId } = get()
    const updatedAgents = agents.filter((a) => a.id !== id)
    set({ agents: updatedAgents })

    // Persist to config
    const config = await window.config.load(profileId)
    await window.config.save({
      ...config,
      profileId,
      agents: updatedAgents,
    })
  },
}))
