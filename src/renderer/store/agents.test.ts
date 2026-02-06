import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAgentStore } from './agents'

describe('useAgentStore', () => {
  beforeEach(() => {
    useAgentStore.setState({ agents: [], isLoading: true, profileId: undefined })
    vi.mocked(window.config.load).mockResolvedValue({ agents: [], sessions: [] })
    vi.mocked(window.config.save).mockResolvedValue({ success: true })
    vi.clearAllMocks()
  })

  describe('loadAgents', () => {
    it('loads agents from config', async () => {
      const agents = [{ id: 'a1', name: 'Claude', command: 'claude' }]
      vi.mocked(window.config.load).mockResolvedValue({ agents, sessions: [] })

      await useAgentStore.getState().loadAgents()
      const state = useAgentStore.getState()
      expect(state.agents).toEqual(agents)
      expect(state.isLoading).toBe(false)
    })

    it('loads agents with profileId', async () => {
      const agents = [{ id: 'a1', name: 'Claude', command: 'claude' }]
      vi.mocked(window.config.load).mockResolvedValue({ agents, sessions: [] })

      await useAgentStore.getState().loadAgents('profile-1')
      expect(window.config.load).toHaveBeenCalledWith('profile-1')
      expect(useAgentStore.getState().profileId).toBe('profile-1')
    })

    it('sets empty agents on error', async () => {
      vi.mocked(window.config.load).mockRejectedValue(new Error('fail'))

      await useAgentStore.getState().loadAgents()
      const state = useAgentStore.getState()
      expect(state.agents).toEqual([])
      expect(state.isLoading).toBe(false)
    })
  })

  describe('addAgent', () => {
    it('adds an agent and persists', async () => {
      useAgentStore.setState({ agents: [], isLoading: false })
      vi.mocked(window.config.load).mockResolvedValue({ agents: [], sessions: [] })

      await useAgentStore.getState().addAgent({ name: 'New', command: 'new-cmd' })
      const state = useAgentStore.getState()
      expect(state.agents).toHaveLength(1)
      expect(state.agents[0].name).toBe('New')
      expect(state.agents[0].command).toBe('new-cmd')
      expect(state.agents[0].id).toMatch(/^agent-/)
      expect(window.config.save).toHaveBeenCalled()
    })
  })

  describe('updateAgent', () => {
    it('updates an existing agent and persists', async () => {
      useAgentStore.setState({
        agents: [{ id: 'a1', name: 'Old', command: 'old-cmd' }],
        isLoading: false,
      })
      vi.mocked(window.config.load).mockResolvedValue({ agents: [], sessions: [] })

      await useAgentStore.getState().updateAgent('a1', { name: 'Updated' })
      const state = useAgentStore.getState()
      expect(state.agents[0].name).toBe('Updated')
      expect(state.agents[0].command).toBe('old-cmd')
      expect(window.config.save).toHaveBeenCalled()
    })
  })

  describe('removeAgent', () => {
    it('removes an agent and persists', async () => {
      useAgentStore.setState({
        agents: [
          { id: 'a1', name: 'Keep', command: 'cmd' },
          { id: 'a2', name: 'Remove', command: 'cmd' },
        ],
        isLoading: false,
      })
      vi.mocked(window.config.load).mockResolvedValue({ agents: [], sessions: [] })

      await useAgentStore.getState().removeAgent('a2')
      const state = useAgentStore.getState()
      expect(state.agents).toHaveLength(1)
      expect(state.agents[0].id).toBe('a1')
      expect(window.config.save).toHaveBeenCalled()
    })
  })
})
