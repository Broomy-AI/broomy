/**
 * Managed repositories store for tracking git repos available to sessions.
 *
 * Stores the list of repositories (each with a name, remote URL, root directory,
 * and default branch), the default clone directory, and GitHub CLI availability.
 * Supports tilde expansion for paths via the main process. Every mutation persists
 * immediately to the profile's config file.
 */
import { create } from 'zustand'
import type { ManagedRepo } from '../../preload/index'

const generateId = () => `repo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Resolve ~ to the actual home directory using the main process
async function resolveHome(path: string): Promise<string> {
  if (path.startsWith('~/') || path === '~') {
    const home = await window.app.homedir()
    return path === '~' ? home : home + path.slice(1)
  }
  return path
}

interface RepoStore {
  repos: ManagedRepo[]
  defaultCloneDir: string
  ghAvailable: boolean | null
  profileId?: string

  loadRepos: (profileId?: string) => Promise<void>
  addRepo: (repo: Omit<ManagedRepo, 'id'>) => Promise<void>
  updateRepo: (id: string, updates: Partial<Omit<ManagedRepo, 'id'>>) => Promise<void>
  removeRepo: (id: string) => Promise<void>
  setDefaultCloneDir: (dir: string) => Promise<void>
  checkGhAvailability: () => Promise<void>
}

export const useRepoStore = create<RepoStore>((set, get) => ({
  repos: [],
  defaultCloneDir: '',
  ghAvailable: null,

  loadRepos: async (profileId?: string) => {
    if (profileId !== undefined) {
      set({ profileId })
    }
    const pid = profileId ?? get().profileId
    try {
      const config = await window.config.load(pid)
      const home = await window.app.homedir()
      const defaultDir = config.defaultCloneDir
        ? await resolveHome(config.defaultCloneDir)
        : `${home}/repos`
      set({
        repos: config.repos || [],
        defaultCloneDir: defaultDir,
        profileId: pid,
      })
    } catch {
      set({ repos: [], defaultCloneDir: '' })
    }
  },

  addRepo: async (repoData) => {
    const repo: ManagedRepo = {
      id: generateId(),
      ...repoData,
    }

    const { repos, profileId } = get()
    const updatedRepos = [...repos, repo]
    set({ repos: updatedRepos })

    const config = await window.config.load(profileId)
    await window.config.save({
      ...config,
      profileId,
      repos: updatedRepos,
    })
  },

  updateRepo: async (id, updates) => {
    const { repos, profileId } = get()
    const updatedRepos = repos.map((r) =>
      r.id === id ? { ...r, ...updates } : r
    )
    set({ repos: updatedRepos })

    const config = await window.config.load(profileId)
    await window.config.save({
      ...config,
      profileId,
      repos: updatedRepos,
    })
  },

  removeRepo: async (id) => {
    const { repos, profileId } = get()
    const updatedRepos = repos.filter((r) => r.id !== id)
    set({ repos: updatedRepos })

    const config = await window.config.load(profileId)
    await window.config.save({
      ...config,
      profileId,
      repos: updatedRepos,
    })
  },

  setDefaultCloneDir: async (dir) => {
    const resolved = await resolveHome(dir)
    set({ defaultCloneDir: resolved })

    const { profileId } = get()
    const config = await window.config.load(profileId)
    await window.config.save({
      ...config,
      profileId,
      defaultCloneDir: resolved,
    })
  },

  checkGhAvailability: async () => {
    try {
      const available = await window.gh.isInstalled()
      set({ ghAvailable: available })
    } catch {
      set({ ghAvailable: false })
    }
  },
}))
