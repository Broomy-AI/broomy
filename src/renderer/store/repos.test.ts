import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { allowConsoleWarn } from '../../test/console-guard'
import { useRepoStore } from './repos'
import { setLoadedCounts } from './configPersistence'

describe('useRepoStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useRepoStore.setState({
      repos: [],
      defaultCloneDir: '',
      ghAvailable: null,
      loadError: null,
      profileId: undefined,
    })
    setLoadedCounts({ sessions: 0, agents: 0, repos: 0 })
    vi.mocked(window.config.load).mockResolvedValue({ agents: [], sessions: [], repos: [] })
    vi.mocked(window.config.save).mockResolvedValue({ success: true })
    vi.mocked(window.app.homedir).mockResolvedValue('/Users/test')
    vi.mocked(window.gh.isInstalled).mockResolvedValue(true)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
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

    it('normalizes Windows backslashes in defaultCloneDir from config', async () => {
      vi.mocked(window.config.load).mockResolvedValue({
        agents: [],
        sessions: [],
        repos: [],
        defaultCloneDir: 'C:\\Users\\isaac\\repos',
      })

      await useRepoStore.getState().loadRepos()
      expect(useRepoStore.getState().defaultCloneDir).toBe('C:/Users/isaac/repos')
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
      allowConsoleWarn()
      vi.mocked(window.config.load).mockRejectedValue(new Error('fail'))

      await useRepoStore.getState().loadRepos()
      const state = useRepoStore.getState()
      expect(state.repos).toEqual([])
      expect(state.defaultCloneDir).toBe('')
      expect(state.loadError).toBe('Failed to load repository config')
    })
  })

  describe('addRepo', () => {
    it('adds a repo and schedules save', async () => {
      useRepoStore.setState({ repos: [], profileId: undefined })

      useRepoStore.getState().addRepo({
        name: 'new-repo',
        remoteUrl: 'https://github.com/user/new-repo',
        rootDir: '/repos/new-repo',
        defaultBranch: 'main',
      })

      const state = useRepoStore.getState()
      expect(state.repos).toHaveLength(1)
      expect(state.repos[0].name).toBe('new-repo')
      expect(state.repos[0].id).toMatch(/^repo-/)

      await vi.advanceTimersByTimeAsync(600)
      expect(window.config.save).toHaveBeenCalled()
    })
  })

  describe('updateRepo', () => {
    it('updates a repo and schedules save', async () => {
      useRepoStore.setState({
        repos: [{ id: 'r1', name: 'old', remoteUrl: 'url', rootDir: '/root', defaultBranch: 'main' }],
      })

      useRepoStore.getState().updateRepo('r1', { name: 'updated' })
      expect(useRepoStore.getState().repos[0].name).toBe('updated')

      await vi.advanceTimersByTimeAsync(600)
      expect(window.config.save).toHaveBeenCalled()
    })

    it('updates allowApproveAndMerge and schedules save', async () => {
      useRepoStore.setState({
        repos: [{ id: 'r1', name: 'repo', remoteUrl: 'url', rootDir: '/root', defaultBranch: 'main' }],
      })

      useRepoStore.getState().updateRepo('r1', { allowApproveAndMerge: true })
      expect(useRepoStore.getState().repos[0].allowApproveAndMerge).toBe(true)

      await vi.advanceTimersByTimeAsync(600)
      expect(window.config.save).toHaveBeenCalled()
    })

    it('sets allowApproveAndMerge to false', () => {
      useRepoStore.setState({
        repos: [{ id: 'r1', name: 'repo', remoteUrl: 'url', rootDir: '/root', defaultBranch: 'main', allowApproveAndMerge: true }],
      })

      useRepoStore.getState().updateRepo('r1', { allowApproveAndMerge: false })
      expect(useRepoStore.getState().repos[0].allowApproveAndMerge).toBe(false)
    })

    it('preserves allowApproveAndMerge when updating other fields', () => {
      useRepoStore.setState({
        repos: [{ id: 'r1', name: 'repo', remoteUrl: 'url', rootDir: '/root', defaultBranch: 'main', allowApproveAndMerge: true }],
      })

      useRepoStore.getState().updateRepo('r1', { name: 'updated' })
      const repo = useRepoStore.getState().repos[0]
      expect(repo.name).toBe('updated')
      expect(repo.allowApproveAndMerge).toBe(true)
    })
  })

  describe('removeRepo', () => {
    it('removes a repo and schedules save', async () => {
      useRepoStore.setState({
        repos: [
          { id: 'r1', name: 'keep', remoteUrl: 'url', rootDir: '/root', defaultBranch: 'main' },
          { id: 'r2', name: 'remove', remoteUrl: 'url', rootDir: '/root', defaultBranch: 'main' },
        ],
      })

      useRepoStore.getState().removeRepo('r2')
      expect(useRepoStore.getState().repos).toHaveLength(1)
      expect(useRepoStore.getState().repos[0].id).toBe('r1')

      await vi.advanceTimersByTimeAsync(600)
      expect(window.config.save).toHaveBeenCalled()
    })
  })

  describe('setDefaultCloneDir', () => {
    it('resolves ~ and schedules save', async () => {
      await useRepoStore.getState().setDefaultCloneDir('~/my-repos')
      expect(useRepoStore.getState().defaultCloneDir).toBe('/Users/test/my-repos')

      await vi.advanceTimersByTimeAsync(600)
      expect(window.config.save).toHaveBeenCalled()
    })

    it('handles absolute paths', async () => {
      await useRepoStore.getState().setDefaultCloneDir('/absolute/path')
      expect(useRepoStore.getState().defaultCloneDir).toBe('/absolute/path')
    })

    it('normalizes Windows backslashes to forward slashes', async () => {
      await useRepoStore.getState().setDefaultCloneDir('C:\\Users\\isaac\\repos')
      expect(useRepoStore.getState().defaultCloneDir).toBe('C:/Users/isaac/repos')
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

  describe('checkGitAvailability', () => {
    it('sets gitAvailable to true when installed', async () => {
      vi.mocked(window.git.isInstalled).mockResolvedValue(true)
      await useRepoStore.getState().checkGitAvailability()
      expect(useRepoStore.getState().gitAvailable).toBe(true)
    })

    it('sets gitAvailable to false when not installed', async () => {
      vi.mocked(window.git.isInstalled).mockResolvedValue(false)
      await useRepoStore.getState().checkGitAvailability()
      expect(useRepoStore.getState().gitAvailable).toBe(false)
    })

    it('sets gitAvailable to false on error', async () => {
      vi.mocked(window.git.isInstalled).mockRejectedValue(new Error('fail'))
      await useRepoStore.getState().checkGitAvailability()
      expect(useRepoStore.getState().gitAvailable).toBe(false)
    })
  })

  describe('setDefaultShell', () => {
    it('sets default shell and triggers save', async () => {
      vi.useFakeTimers()
      useRepoStore.getState().setDefaultShell('/bin/zsh')
      expect(useRepoStore.getState().defaultShell).toBe('/bin/zsh')
      await vi.advanceTimersByTimeAsync(600)
      expect(window.config.save).toHaveBeenCalled()
      vi.useRealTimers()
    })
  })
})
