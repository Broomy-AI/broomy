import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRepoStore } from './repos'

describe('useRepoStore', () => {
  beforeEach(() => {
    useRepoStore.setState({
      repos: [],
      defaultCloneDir: '',
      ghAvailable: null,
      profileId: undefined,
    })
    vi.mocked(window.config.load).mockResolvedValue({ agents: [], sessions: [], repos: [] })
    vi.mocked(window.config.save).mockResolvedValue({ success: true })
    vi.mocked(window.app.homedir).mockResolvedValue('/Users/test')
    vi.mocked(window.gh.isInstalled).mockResolvedValue(true)
    vi.clearAllMocks()
  })

  describe('loadRepos', () => {
    it('loads repos from config', async () => {
      const repos = [{ id: 'r1', name: 'my-repo', remoteUrl: 'https://github.com/user/repo', rootDir: '/repos/my-repo', defaultBranch: 'main' }]
      vi.mocked(window.config.load).mockResolvedValue({
        agents: [],
        sessions: [],
        repos,
      })

      await useRepoStore.getState().loadRepos()
      const state = useRepoStore.getState()
      expect(state.repos).toEqual(repos)
    })

    it('sets defaultCloneDir from config', async () => {
      vi.mocked(window.config.load).mockResolvedValue({
        agents: [],
        sessions: [],
        repos: [],
        defaultCloneDir: '~/projects',
      })

      await useRepoStore.getState().loadRepos()
      expect(useRepoStore.getState().defaultCloneDir).toBe('/Users/test/projects')
    })

    it('defaults defaultCloneDir to ~/repos when not configured', async () => {
      vi.mocked(window.config.load).mockResolvedValue({
        agents: [],
        sessions: [],
        repos: [],
      })

      await useRepoStore.getState().loadRepos()
      expect(useRepoStore.getState().defaultCloneDir).toBe('/Users/test/repos')
    })

    it('sets profileId when provided', async () => {
      await useRepoStore.getState().loadRepos('profile-1')
      expect(window.config.load).toHaveBeenCalledWith('profile-1')
      expect(useRepoStore.getState().profileId).toBe('profile-1')
    })

    it('sets empty repos on error', async () => {
      vi.mocked(window.config.load).mockRejectedValue(new Error('fail'))

      await useRepoStore.getState().loadRepos()
      const state = useRepoStore.getState()
      expect(state.repos).toEqual([])
      expect(state.defaultCloneDir).toBe('')
    })
  })

  describe('addRepo', () => {
    it('adds a repo and persists', async () => {
      useRepoStore.setState({ repos: [], profileId: undefined })

      await useRepoStore.getState().addRepo({
        name: 'new-repo',
        remoteUrl: 'https://github.com/user/new-repo',
        rootDir: '/repos/new-repo',
        defaultBranch: 'main',
      })

      const state = useRepoStore.getState()
      expect(state.repos).toHaveLength(1)
      expect(state.repos[0].name).toBe('new-repo')
      expect(state.repos[0].id).toMatch(/^repo-/)
      expect(window.config.save).toHaveBeenCalled()
    })
  })

  describe('updateRepo', () => {
    it('updates a repo and persists', async () => {
      useRepoStore.setState({
        repos: [{ id: 'r1', name: 'old', remoteUrl: 'url', rootDir: '/root', defaultBranch: 'main' }],
      })

      await useRepoStore.getState().updateRepo('r1', { name: 'updated' })
      expect(useRepoStore.getState().repos[0].name).toBe('updated')
      expect(window.config.save).toHaveBeenCalled()
    })

    it('updates allowPushToMain and persists', async () => {
      useRepoStore.setState({
        repos: [{ id: 'r1', name: 'repo', remoteUrl: 'url', rootDir: '/root', defaultBranch: 'main' }],
      })

      await useRepoStore.getState().updateRepo('r1', { allowPushToMain: true })
      expect(useRepoStore.getState().repos[0].allowPushToMain).toBe(true)
      expect(window.config.save).toHaveBeenCalled()
    })

    it('sets allowPushToMain to false', async () => {
      useRepoStore.setState({
        repos: [{ id: 'r1', name: 'repo', remoteUrl: 'url', rootDir: '/root', defaultBranch: 'main', allowPushToMain: true }],
      })

      await useRepoStore.getState().updateRepo('r1', { allowPushToMain: false })
      expect(useRepoStore.getState().repos[0].allowPushToMain).toBe(false)
    })

    it('preserves allowPushToMain when updating other fields', async () => {
      useRepoStore.setState({
        repos: [{ id: 'r1', name: 'repo', remoteUrl: 'url', rootDir: '/root', defaultBranch: 'main', allowPushToMain: true }],
      })

      await useRepoStore.getState().updateRepo('r1', { name: 'updated' })
      const repo = useRepoStore.getState().repos[0]
      expect(repo.name).toBe('updated')
      expect(repo.allowPushToMain).toBe(true)
    })
  })

  describe('removeRepo', () => {
    it('removes a repo and persists', async () => {
      useRepoStore.setState({
        repos: [
          { id: 'r1', name: 'keep', remoteUrl: 'url', rootDir: '/root', defaultBranch: 'main' },
          { id: 'r2', name: 'remove', remoteUrl: 'url', rootDir: '/root', defaultBranch: 'main' },
        ],
      })

      await useRepoStore.getState().removeRepo('r2')
      expect(useRepoStore.getState().repos).toHaveLength(1)
      expect(useRepoStore.getState().repos[0].id).toBe('r1')
      expect(window.config.save).toHaveBeenCalled()
    })
  })

  describe('setDefaultCloneDir', () => {
    it('resolves ~ and persists', async () => {
      await useRepoStore.getState().setDefaultCloneDir('~/my-repos')
      expect(useRepoStore.getState().defaultCloneDir).toBe('/Users/test/my-repos')
      expect(window.config.save).toHaveBeenCalled()
    })

    it('handles absolute paths', async () => {
      await useRepoStore.getState().setDefaultCloneDir('/absolute/path')
      expect(useRepoStore.getState().defaultCloneDir).toBe('/absolute/path')
    })
  })

  describe('checkGhAvailability', () => {
    it('sets ghAvailable to true when installed', async () => {
      vi.mocked(window.gh.isInstalled).mockResolvedValue(true)
      await useRepoStore.getState().checkGhAvailability()
      expect(useRepoStore.getState().ghAvailable).toBe(true)
    })

    it('sets ghAvailable to false when not installed', async () => {
      vi.mocked(window.gh.isInstalled).mockResolvedValue(false)
      await useRepoStore.getState().checkGhAvailability()
      expect(useRepoStore.getState().ghAvailable).toBe(false)
    })

    it('sets ghAvailable to false on error', async () => {
      vi.mocked(window.gh.isInstalled).mockRejectedValue(new Error('fail'))
      await useRepoStore.getState().checkGhAvailability()
      expect(useRepoStore.getState().ghAvailable).toBe(false)
    })
  })
})
