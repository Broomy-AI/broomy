import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useTutorialStore, TUTORIAL_STEPS } from './tutorial'

describe('useTutorialStore', () => {
  beforeEach(() => {
    useTutorialStore.setState({
      completedSteps: [],
      isLoaded: false,
    })
    vi.mocked(window.config.load).mockResolvedValue({ agents: [], sessions: [] })
    vi.mocked(window.config.save).mockResolvedValue({ success: true })
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('TUTORIAL_STEPS', () => {
    it('has expected steps defined', () => {
      expect(TUTORIAL_STEPS.length).toBeGreaterThan(0)
      expect(TUTORIAL_STEPS.find(s => s.id === 'toggled-tutorial')).toBeDefined()
      expect(TUTORIAL_STEPS.find(s => s.id === 'created-session')).toBeDefined()
      expect(TUTORIAL_STEPS.find(s => s.id === 'viewed-file')).toBeDefined()
      expect(TUTORIAL_STEPS.find(s => s.id === 'used-source-control')).toBeDefined()
      expect(TUTORIAL_STEPS.find(s => s.id === 'used-review')).toBeDefined()
    })

    it('has toggled-tutorial as the first step', () => {
      expect(TUTORIAL_STEPS[0].id).toBe('toggled-tutorial')
    })

    it('each step has a description', () => {
      for (const step of TUTORIAL_STEPS) {
        expect(step.description).toBeTruthy()
      }
    })
  })

  describe('loadTutorial', () => {
    it('loads tutorial progress from config', async () => {
      vi.mocked(window.config.load).mockResolvedValue({
        agents: [],
        sessions: [],
        tutorialProgress: {
          completedSteps: ['created-session', 'viewed-file'],
        },
      })

      await useTutorialStore.getState().loadTutorial()
      const state = useTutorialStore.getState()
      expect(state.completedSteps).toEqual(['created-session', 'viewed-file'])
      expect(state.isLoaded).toBe(true)
    })

    it('loads with profileId', async () => {
      await useTutorialStore.getState().loadTutorial('profile-1')
      expect(window.config.load).toHaveBeenCalledWith('profile-1')
    })

    it('handles missing tutorial progress', async () => {
      vi.mocked(window.config.load).mockResolvedValue({ agents: [], sessions: [] })

      await useTutorialStore.getState().loadTutorial()
      const state = useTutorialStore.getState()
      expect(state.completedSteps).toEqual([])
      expect(state.isLoaded).toBe(true)
    })

    it('handles errors gracefully', async () => {
      vi.mocked(window.config.load).mockRejectedValue(new Error('fail'))

      await useTutorialStore.getState().loadTutorial()
      const state = useTutorialStore.getState()
      expect(state.completedSteps).toEqual([])
      expect(state.isLoaded).toBe(true)
    })
  })

  describe('markStepComplete', () => {
    it('marks a step as complete', () => {
      useTutorialStore.getState().markStepComplete('created-session')
      const state = useTutorialStore.getState()
      expect(state.completedSteps).toContain('created-session')
    })

    it('does not duplicate completed steps', () => {
      useTutorialStore.setState({ completedSteps: ['created-session'], isLoaded: true })
      useTutorialStore.getState().markStepComplete('created-session')
      const state = useTutorialStore.getState()
      expect(state.completedSteps.filter(s => s === 'created-session')).toHaveLength(1)
    })

    it('persists after debounce', async () => {
      useTutorialStore.getState().markStepComplete('created-session')
      expect(window.config.save).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(500)
      expect(window.config.save).toHaveBeenCalled()
    })
  })

  describe('markStepIncomplete', () => {
    it('marks a completed step as incomplete', () => {
      useTutorialStore.setState({ completedSteps: ['created-session', 'viewed-file'], isLoaded: true })
      useTutorialStore.getState().markStepIncomplete('created-session')
      const state = useTutorialStore.getState()
      expect(state.completedSteps).toEqual(['viewed-file'])
    })

    it('does nothing if step is not completed', () => {
      useTutorialStore.setState({ completedSteps: ['viewed-file'], isLoaded: true })
      useTutorialStore.getState().markStepIncomplete('created-session')
      const state = useTutorialStore.getState()
      expect(state.completedSteps).toEqual(['viewed-file'])
    })

    it('persists after debounce', async () => {
      useTutorialStore.setState({ completedSteps: ['created-session'], isLoaded: true })
      useTutorialStore.getState().markStepIncomplete('created-session')
      expect(window.config.save).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(500)
      expect(window.config.save).toHaveBeenCalled()
    })
  })

  describe('resetProgress', () => {
    it('clears all completed steps', () => {
      useTutorialStore.setState({
        completedSteps: ['created-session', 'viewed-file'],
        isLoaded: true,
      })

      useTutorialStore.getState().resetProgress()
      const state = useTutorialStore.getState()
      expect(state.completedSteps).toEqual([])
    })

    it('persists after debounce', async () => {
      useTutorialStore.setState({
        completedSteps: ['created-session'],
        isLoaded: true,
      })

      useTutorialStore.getState().resetProgress()
      await vi.advanceTimersByTimeAsync(500)
      expect(window.config.save).toHaveBeenCalled()
    })
  })
})
