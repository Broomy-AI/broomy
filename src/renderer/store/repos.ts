/**
 * Managed repositories store for tracking git repos available to sessions.
 *
 * Stores the list of repositories (each with a name, remote URL, root directory,
 * and default branch), the default clone directory, and GitHub CLI availability.
 * Supports tilde expansion for paths via the main process. Every mutation triggers
 * a unified debounced save via configPersistence (which assembles the complete
 * config from all stores before writing).
 */
import { create } from 'zustand'
import type { ManagedRepo } from '../../preload/index'
import { scheduleSave, setLoadedCounts } from './configPersistence'

const generateId = () => `repo-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

// Resolve ~ to the actual home directory using the main process
async function resolveHome(path: string): Promise<string> {
  if (path.startsWith('~/') || path === '~') {
    const home: string = await window.app.homedir()
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
  addRepo: (repo: Omit<ManagedRepo, 'id'>) => void
  updateRepo: (id: string, updates: Partial<Omit<ManagedRepo, 'id'>>) => void
  removeRepo: (id: string) => void
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
      const repos = config.repos || []
      set({
        repos,
        defaultCloneDir: defaultDir,
        profileId: pid,
      })
      setLoadedCounts({ repos: repos.length })
    } catch {
      set({ repos: [], defaultCloneDir: '' })
    }
  },

  addRepo: (repoData) => {
    const repo: ManagedRepo = {
      id: generateId(),
      ...repoData,
    }

    const { repos } = get()
    const updatedRepos = [...repos, repo]
    set({ repos: updatedRepos })
    scheduleSave()
  },

  updateRepo: (id, updates) => {
    const { repos } = get()
    const updatedRepos = repos.map((r) =>
      r.id === id ? { ...r, ...updates } : r
    )
    set({ repos: updatedRepos })
    scheduleSave()
  },

  removeRepo: (id) => {
    const { repos } = get()
    const updatedRepos = repos.filter((r) => r.id !== id)
    set({ repos: updatedRepos })
    scheduleSave()
  },

  setDefaultCloneDir: async (dir) => {
    const resolved = await resolveHome(dir)
    set({ defaultCloneDir: resolved })
    scheduleSave()
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
