import { create } from 'zustand'
import type { AgentData } from '../../preload/index'

export type AgentConfig = AgentData

interface AgentStore {
  agents: AgentConfig[]
  isLoading: boolean

  // Actions
  loadAgents: () => Promise<void>
  addAgent: (agent: Omit<AgentConfig, 'id'>) => Promise<void>
  updateAgent: (id: string, updates: Partial<Omit<AgentConfig, 'id'>>) => Promise<void>
  removeAgent: (id: string) => Promise<void>
}

const generateId = () => `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  isLoading: true,

  loadAgents: async () => {
    try {
      const config = await window.config.load()
      set({ agents: config.agents || [], isLoading: false })
    } catch {
      set({ agents: [], isLoading: false })
    }
  },

  addAgent: async (agentData) => {
    const agent: AgentConfig = {
      id: generateId(),
      ...agentData,
    }

    const { agents } = get()
    const updatedAgents = [...agents, agent]
    set({ agents: updatedAgents })

    // Persist to config
    const config = await window.config.load()
    await window.config.save({
      ...config,
      agents: updatedAgents,
    })
  },

  updateAgent: async (id, updates) => {
    const { agents } = get()
    const updatedAgents = agents.map((a) =>
      a.id === id ? { ...a, ...updates } : a
    )
    set({ agents: updatedAgents })

    // Persist to config
    const config = await window.config.load()
    await window.config.save({
      ...config,
      agents: updatedAgents,
    })
  },

  removeAgent: async (id) => {
    const { agents } = get()
    const updatedAgents = agents.filter((a) => a.id !== id)
    set({ agents: updatedAgents })

    // Persist to config
    const config = await window.config.load()
    await window.config.save({
      ...config,
      agents: updatedAgents,
    })
  },
}))
