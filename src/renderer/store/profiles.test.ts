import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useProfileStore } from './profiles'

describe('useProfileStore', () => {
  beforeEach(() => {
    useProfileStore.setState({
      profiles: [],
      currentProfileId: 'default',
      isLoading: true,
    })
    vi.mocked(window.profiles.list).mockResolvedValue({
      profiles: [{ id: 'default', name: 'Default', color: '#3b82f6' }],
      lastProfileId: 'default',
    })
    vi.mocked(window.profiles.save).mockResolvedValue({ success: true })
    vi.mocked(window.profiles.openWindow).mockResolvedValue({ success: true, alreadyOpen: false })
    // Reset window.location.search for getProfileIdFromUrl
    Object.defineProperty(window, 'location', {
      value: { search: '' } as Location,
      writable: true,
    })
    vi.clearAllMocks()
  })

  describe('loadProfiles', () => {
    it('loads profiles from API', async () => {
      const profiles = [{ id: 'default', name: 'Default', color: '#3b82f6' }]
      vi.mocked(window.profiles.list).mockResolvedValue({
        profiles,
        lastProfileId: 'default',
      })

      await useProfileStore.getState().loadProfiles()
      const state = useProfileStore.getState()
      expect(state.profiles).toEqual(profiles)
      expect(state.isLoading).toBe(false)
    })

    it('updates lastProfileId if different from URL', async () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?profile=custom' } as Location,
        writable: true,
      })
      vi.mocked(window.profiles.list).mockResolvedValue({
        profiles: [{ id: 'default', name: 'Default', color: '#3b82f6' }],
        lastProfileId: 'default',
      })

      await useProfileStore.getState().loadProfiles()
      expect(window.profiles.save).toHaveBeenCalled()
    })

    it('falls back to default profile on error', async () => {
      vi.mocked(window.profiles.list).mockRejectedValue(new Error('fail'))

      await useProfileStore.getState().loadProfiles()
      const state = useProfileStore.getState()
      expect(state.profiles).toEqual([{ id: 'default', name: 'Default', color: '#3b82f6' }])
      expect(state.isLoading).toBe(false)
    })
  })

  describe('addProfile', () => {
    it('adds a profile and persists', async () => {
      useProfileStore.setState({
        profiles: [{ id: 'default', name: 'Default', color: '#3b82f6' }],
        currentProfileId: 'default',
        isLoading: false,
      })

      const result = await useProfileStore.getState().addProfile('Work', '#ff0000')
      expect(result.name).toBe('Work')
      expect(result.color).toBe('#ff0000')
      expect(result.id).toMatch(/^profile-/)
      expect(useProfileStore.getState().profiles).toHaveLength(2)
      expect(window.profiles.save).toHaveBeenCalled()
    })
  })

  describe('deleteProfile', () => {
    it('deletes a non-current profile', async () => {
      useProfileStore.setState({
        profiles: [
          { id: 'default', name: 'Default', color: '#3b82f6' },
          { id: 'p2', name: 'Work', color: '#ff0000' },
        ],
        currentProfileId: 'default',
        isLoading: false,
      })

      await useProfileStore.getState().deleteProfile('p2')
      expect(useProfileStore.getState().profiles).toHaveLength(1)
      expect(window.profiles.save).toHaveBeenCalled()
    })

    it('does not delete the current profile', async () => {
      useProfileStore.setState({
        profiles: [
          { id: 'default', name: 'Default', color: '#3b82f6' },
          { id: 'p2', name: 'Work', color: '#ff0000' },
        ],
        currentProfileId: 'default',
        isLoading: false,
      })

      await useProfileStore.getState().deleteProfile('default')
      expect(useProfileStore.getState().profiles).toHaveLength(2)
    })

    it('does not delete the last profile', async () => {
      useProfileStore.setState({
        profiles: [{ id: 'only', name: 'Only', color: '#3b82f6' }],
        currentProfileId: 'other',
        isLoading: false,
      })

      await useProfileStore.getState().deleteProfile('only')
      expect(useProfileStore.getState().profiles).toHaveLength(1)
    })
  })

  describe('updateProfile', () => {
    it('updates a profile and persists', async () => {
      useProfileStore.setState({
        profiles: [{ id: 'p1', name: 'Old', color: '#000' }],
        currentProfileId: 'p1',
        isLoading: false,
      })

      await useProfileStore.getState().updateProfile('p1', { name: 'New' })
      expect(useProfileStore.getState().profiles[0].name).toBe('New')
      expect(useProfileStore.getState().profiles[0].color).toBe('#000')
      expect(window.profiles.save).toHaveBeenCalled()
    })
  })

  describe('switchProfile', () => {
    it('opens window and saves lastProfileId', async () => {
      useProfileStore.setState({
        profiles: [{ id: 'p1', name: 'P1', color: '#000' }],
        currentProfileId: 'default',
        isLoading: false,
      })

      await useProfileStore.getState().switchProfile('p1')
      expect(window.profiles.openWindow).toHaveBeenCalledWith('p1')
      expect(window.profiles.save).toHaveBeenCalled()
    })
  })

  describe('openProfileInNewWindow', () => {
    it('calls openWindow', async () => {
      await useProfileStore.getState().openProfileInNewWindow('p1')
      expect(window.profiles.openWindow).toHaveBeenCalledWith('p1')
    })
  })
})
