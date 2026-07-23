import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useSessionStore } from './sessions'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/system/types'
import { setLoadedCounts } from './configPersistence'
import { useAgentStore } from './agents'
import { useRepoStore } from './repos'

describe('repo-group collapse + visible-order store actions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setLoadedCounts({ sessions: 0, agents: 0, repos: 0 })
    useAgentStore.setState({ agents: [{ id: 'a1', name: 'A', command: 'a' }] })
    useRepoStore.setState({ repos: [] })
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      sidebarWidth: 224,
      toolbarPanels: [...DEFAULT_TOOLBAR_PANELS],
      collapsedRepoGroups: [],
      sidebarFullOrder: [],
      sidebarVisibleOrder: [],
      globalPanelVisibility: { [PANEL_IDS.SIDEBAR]: true, [PANEL_IDS.SETTINGS]: false },
    })
    vi.mocked(window.config.save).mockResolvedValue({ success: true })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('setRepoGroupCollapsed', () => {
    it('collapses then expands a group key', () => {
      useSessionStore.getState().setRepoGroupCollapsed('repo:r1', true)
      expect(useSessionStore.getState().collapsedRepoGroups).toEqual(['repo:r1'])
      useSessionStore.getState().setRepoGroupCollapsed('repo:r1', false)
      expect(useSessionStore.getState().collapsedRepoGroups).toEqual([])
    })

    it('never adds duplicate keys', () => {
      useSessionStore.getState().setRepoGroupCollapsed('repo:r1', true)
      useSessionStore.getState().setRepoGroupCollapsed('repo:r1', true)
      expect(useSessionStore.getState().collapsedRepoGroups).toEqual(['repo:r1'])
    })

    it('is a no-op (no save) when the state already matches', async () => {
      useSessionStore.getState().setRepoGroupCollapsed('repo:r1', false) // already expanded
      await vi.advanceTimersByTimeAsync(600)
      expect(window.config.save).not.toHaveBeenCalled()
    })

    it('persists the collapse state (round-trips non-empty and [])', async () => {
      useSessionStore.getState().setRepoGroupCollapsed('repo:r1', true)
      await vi.advanceTimersByTimeAsync(600)
      expect(window.config.save).toHaveBeenCalledWith(
        expect.objectContaining({ collapsedRepoGroups: ['repo:r1'] }),
      )
      vi.clearAllMocks()
      useSessionStore.getState().setRepoGroupCollapsed('repo:r1', false)
      await vi.advanceTimersByTimeAsync(600)
      expect(window.config.save).toHaveBeenCalledWith(
        expect.objectContaining({ collapsedRepoGroups: [] }),
      )
    })
  })

  describe('setSidebarOrder', () => {
    it('sets the runtime full + visible order without persisting', async () => {
      useSessionStore.getState().setSidebarOrder(['a', 'b', 'c'], ['a', 'c'])
      expect(useSessionStore.getState().sidebarFullOrder).toEqual(['a', 'b', 'c'])
      expect(useSessionStore.getState().sidebarVisibleOrder).toEqual(['a', 'c'])
      await vi.advanceTimersByTimeAsync(600)
      expect(window.config.save).not.toHaveBeenCalled()
    })
  })
})
