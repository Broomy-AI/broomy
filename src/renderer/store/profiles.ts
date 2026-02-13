/**
 * Multi-window profile store for managing named workspace profiles.
 *
 * Each profile gets its own Electron window with isolated sessions, agents, and
 * repos. The current profile ID is read from the URL query parameter (?profile=...).
 * Switching profiles opens a new window via `window.profiles.openWindow`. Profile
 * metadata (name, color) is stored in a shared profiles file, separate from the
 * per-profile config.
 */
import { create } from 'zustand'
import type { ProfileData, ProfilesData } from '../../preload/index'

export type { ProfileData }

interface ProfileStore {
  profiles: ProfileData[]
  currentProfileId: string
  isLoading: boolean

  loadProfiles: () => Promise<void>
  switchProfile: (profileId: string) => Promise<void>
  addProfile: (name: string, color: string) => Promise<ProfileData>
  deleteProfile: (profileId: string) => Promise<void>
  updateProfile: (profileId: string, updates: Partial<Omit<ProfileData, 'id'>>) => Promise<void>
  openProfileInNewWindow: (profileId: string) => Promise<void>
}

const generateId = () => `profile-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

// Read the profile ID from the URL query parameter
function getProfileIdFromUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('profile') || 'default'
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profiles: [],
  currentProfileId: getProfileIdFromUrl(),
  isLoading: true,

  loadProfiles: async () => {
    try {
      const data: ProfilesData = await window.profiles.list()
      const urlProfileId = getProfileIdFromUrl()
      set({
        profiles: data.profiles,
        currentProfileId: urlProfileId,
        isLoading: false,
      })
      // Update lastProfileId to the current window's profile
      if (urlProfileId !== data.lastProfileId) {
        await window.profiles.save({
          ...data,
          lastProfileId: urlProfileId,
        })
      }
    } catch {
      set({
        profiles: [{ id: 'default', name: 'Default', color: '#3b82f6' }],
        currentProfileId: 'default',
        isLoading: false,
      })
    }
  },

  switchProfile: async (profileId: string) => {
    // Open the profile in a new window (or focus existing)
    await window.profiles.openWindow(profileId)
    // Update lastProfileId
    const { profiles } = get()
    await window.profiles.save({ profiles, lastProfileId: profileId })
  },

  addProfile: async (name: string, color: string) => {
    const profile: ProfileData = { id: generateId(), name, color }
    const { profiles, currentProfileId } = get()
    const updatedProfiles = [...profiles, profile]
    set({ profiles: updatedProfiles })
    await window.profiles.save({ profiles: updatedProfiles, lastProfileId: currentProfileId })
    return profile
  },

  deleteProfile: async (profileId: string) => {
    const { profiles, currentProfileId } = get()
    if (profiles.length <= 1) return
    if (profileId === currentProfileId) return
    const updatedProfiles = profiles.filter((p) => p.id !== profileId)
    set({ profiles: updatedProfiles })
    await window.profiles.save({ profiles: updatedProfiles, lastProfileId: currentProfileId })
  },

  updateProfile: async (profileId: string, updates: Partial<Omit<ProfileData, 'id'>>) => {
    const { profiles, currentProfileId } = get()
    const updatedProfiles = profiles.map((p) =>
      p.id === profileId ? { ...p, ...updates } : p
    )
    set({ profiles: updatedProfiles })
    await window.profiles.save({ profiles: updatedProfiles, lastProfileId: currentProfileId })
  },

  openProfileInNewWindow: async (profileId: string) => {
    await window.profiles.openWindow(profileId)
  },
}))
