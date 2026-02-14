// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGitPolling } from './useGitPolling'
import type { GitStatusResult, ManagedRepo } from '../../preload/index'
import type { Session, BranchStatus } from '../store/sessions'

// Mock dependencies
vi.mock('../utils/gitStatusNormalizer', () => ({
  normalizeGitStatus: vi.fn((status: unknown) => status),
}))

vi.mock('../utils/branchStatus', () => ({
  computeBranchStatus: vi.fn().mockReturnValue('in-progress'),
}))

import { normalizeGitStatus } from '../utils/gitStatusNormalizer'
import { computeBranchStatus } from '../utils/branchStatus'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'Test Session',
    directory: '/test/project',
    branch: 'feature/test',
    status: 'idle',
    agentId: 'agent-1',
    repoId: 'repo-1',
    panelVisibility: {},
    showAgentTerminal: true,
    showUserTerminal: false,
    showExplorer: true,
    showFileViewer: false,
    showDiff: false,
    selectedFilePath: null,
    planFilePath: null,
    fileViewerPosition: 'top',
    layoutSizes: {
      explorerWidth: 250,
      fileViewerSize: 300,
      userTerminalHeight: 200,
      diffPanelWidth: 400,
      reviewPanelWidth: 400,
      tutorialPanelWidth: 300,
    },
    ...overrides,
  } as Session
}

function makeGitStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    files: [],
    ahead: 0,
    behind: 0,
    tracking: null,
    current: 'feature/test',
    ...overrides,
  }
}

function makeRepo(overrides: Partial<ManagedRepo> = {}): ManagedRepo {
  return {
    id: 'repo-1',
    name: 'test',
    remoteUrl: 'https://github.com/test/test',
    rootDir: '/test/project',
    defaultBranch: 'main',
    ...overrides,
  }
}

describe('useGitPolling', () => {
  const markHasHadCommits: (sessionId: string) => void = vi.fn()
  const updateBranchStatus: (sessionId: string, status: BranchStatus) => void = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    vi.mocked(normalizeGitStatus).mockImplementation((status: unknown) => status as GitStatusResult)
    vi.mocked(computeBranchStatus).mockReturnValue('in-progress')

    vi.mocked(window.git.status).mockResolvedValue(makeGitStatus())
    vi.mocked(window.git.isMergedInto).mockResolvedValue(false)
    vi.mocked(window.git.hasBranchCommits).mockResolvedValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const activeSession = makeSession()

  const defaultProps = {
    sessions: [activeSession],
    activeSession,
    repos: [makeRepo()],
    markHasHadCommits,
    updateBranchStatus,
  }

  describe('fetchGitStatus', () => {
    it('fetches git status for active session', async () => {
      const gitStatus = makeGitStatus({ current: 'feature/test' })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)

      const { result } = renderHook(() => useGitPolling(defaultProps))

      await act(async () => {
        await result.current.fetchGitStatus()
      })

      expect(window.git.status).toHaveBeenCalledWith('/test/project')
    })

    it('marks hasHadCommits when ahead > 0', async () => {
      const gitStatus = makeGitStatus({ ahead: 2, current: 'feature/test' })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)

      const { result } = renderHook(() => useGitPolling(defaultProps))

      await act(async () => {
        await result.current.fetchGitStatus()
      })

      expect(markHasHadCommits).toHaveBeenCalledWith('session-1')
    })

    it('checks merge status for non-main branches', async () => {
      const gitStatus = makeGitStatus({ current: 'feature/test' })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)

      const { result } = renderHook(() => useGitPolling(defaultProps))

      await act(async () => {
        await result.current.fetchGitStatus()
      })

      expect(window.git.isMergedInto).toHaveBeenCalledWith('/test/project', 'main')
      expect(window.git.hasBranchCommits).toHaveBeenCalledWith('/test/project', 'main')
    })

    it('does not check merge status for main branch', async () => {
      const gitStatus = makeGitStatus({ current: 'main' })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)

      const { result } = renderHook(() => useGitPolling(defaultProps))

      await act(async () => {
        await result.current.fetchGitStatus()
      })

      expect(window.git.isMergedInto).not.toHaveBeenCalled()
    })

    it('does not check merge status for master branch', async () => {
      const gitStatus = makeGitStatus({ current: 'master' })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)

      const { result } = renderHook(() => useGitPolling(defaultProps))

      await act(async () => {
        await result.current.fetchGitStatus()
      })

      expect(window.git.isMergedInto).not.toHaveBeenCalled()
    })

    it('marks hasHadCommits when hasBranchCommits returns true', async () => {
      const gitStatus = makeGitStatus({ current: 'feature/test' })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)
      vi.mocked(window.git.hasBranchCommits).mockResolvedValue(true)

      const { result } = renderHook(() => useGitPolling(defaultProps))

      await act(async () => {
        await result.current.fetchGitStatus()
      })

      expect(markHasHadCommits).toHaveBeenCalledWith('session-1')
    })

    it('does nothing without active session', async () => {
      const { result } = renderHook(() =>
        useGitPolling({ ...defaultProps, activeSession: undefined })
      )

      await act(async () => {
        await result.current.fetchGitStatus()
      })

      expect(window.git.status).not.toHaveBeenCalled()
    })

    it('handles errors silently', async () => {
      vi.mocked(window.git.status).mockRejectedValue(new Error('git fail'))

      const { result } = renderHook(() => useGitPolling(defaultProps))

      // Should not throw
      await act(async () => {
        await result.current.fetchGitStatus()
      })
    })

    it('uses repo defaultBranch for merge checks', async () => {
      const gitStatus = makeGitStatus({ current: 'feature/test' })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)

      const customProps = {
        ...defaultProps,
        repos: [makeRepo({ defaultBranch: 'develop' })],
      }

      const { result } = renderHook(() => useGitPolling(customProps))

      await act(async () => {
        await result.current.fetchGitStatus()
      })

      expect(window.git.isMergedInto).toHaveBeenCalledWith('/test/project', 'develop')
    })

    it('defaults to main when repo is not found', async () => {
      const gitStatus = makeGitStatus({ current: 'feature/test' })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)

      const customProps = {
        ...defaultProps,
        repos: [makeRepo({ id: 'other-repo' })],
      }

      const { result } = renderHook(() => useGitPolling(customProps))

      await act(async () => {
        await result.current.fetchGitStatus()
      })

      expect(window.git.isMergedInto).toHaveBeenCalledWith('/test/project', 'main')
    })
  })

  describe('polling', () => {
    it('polls every 2 seconds', async () => {
      vi.mocked(window.git.status).mockResolvedValue(makeGitStatus())
      vi.mocked(normalizeGitStatus).mockReturnValue(makeGitStatus())

      renderHook(() => useGitPolling(defaultProps))

      // Initial fetch
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      vi.mocked(window.git.status).mockClear()

      // After 2 seconds
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })

      expect(window.git.status).toHaveBeenCalledTimes(1)

      // After another 2 seconds
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })

      expect(window.git.status).toHaveBeenCalledTimes(2)
    })

    it('stops polling on unmount', async () => {
      vi.mocked(window.git.status).mockResolvedValue(makeGitStatus())
      vi.mocked(normalizeGitStatus).mockReturnValue(makeGitStatus())

      const { unmount } = renderHook(() => useGitPolling(defaultProps))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      vi.mocked(window.git.status).mockClear()
      unmount()

      await vi.advanceTimersByTimeAsync(4000)
      expect(window.git.status).not.toHaveBeenCalled()
    })

    it('does not poll without active session', async () => {
      renderHook(() =>
        useGitPolling({ ...defaultProps, activeSession: undefined })
      )

      await vi.advanceTimersByTimeAsync(5000)
      expect(window.git.status).not.toHaveBeenCalled()
    })
  })

  describe('branch status computation', () => {
    it('calls computeBranchStatus with correct params', async () => {
      const gitStatus = makeGitStatus({
        files: [{ path: 'file.ts', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' }],
        ahead: 1,
        tracking: 'origin/feature',
        current: 'feature/test',
      })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)
      vi.mocked(computeBranchStatus).mockReturnValue('in-progress')

      renderHook(() => useGitPolling(defaultProps))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(computeBranchStatus).toHaveBeenCalledWith({
        uncommittedFiles: 1,
        ahead: 1,
        hasTrackingBranch: true,
        isOnMainBranch: false,
        isMergedToMain: false,
        hasHadCommits: false,
        lastKnownPrState: undefined,
      })
    })

    it('updates branch status when it changes', async () => {
      const gitStatus = makeGitStatus({ current: 'feature/test' })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)
      vi.mocked(computeBranchStatus).mockReturnValue('pushed')

      const session = makeSession({ branchStatus: undefined })

      renderHook(() =>
        useGitPolling({
          ...defaultProps,
          sessions: [session],
          activeSession: session,
        })
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(updateBranchStatus).toHaveBeenCalledWith('session-1', 'pushed')
    })

    it('does not update branch status when unchanged', async () => {
      const gitStatus = makeGitStatus({ current: 'feature/test' })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)
      vi.mocked(computeBranchStatus).mockReturnValue('in-progress')

      const session = makeSession({ branchStatus: 'in-progress' as const })

      renderHook(() =>
        useGitPolling({
          ...defaultProps,
          sessions: [session],
          activeSession: session,
        })
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(updateBranchStatus).not.toHaveBeenCalled()
    })
  })

  describe('selectedFileStatus', () => {
    it('returns file status for selected file', async () => {
      const gitStatus = makeGitStatus({
        files: [{ path: 'src/file.ts', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' }],
        current: 'feature/test',
      })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)

      const session = makeSession({
        selectedFilePath: '/test/project/src/file.ts',
      })

      const { result } = renderHook(() =>
        useGitPolling({
          ...defaultProps,
          sessions: [session],
          activeSession: session,
        })
      )

      await act(async () => {
        await result.current.fetchGitStatus()
      })

      expect(result.current.selectedFileStatus).toBe('modified')
    })

    it('returns null when no file selected', () => {
      const { result } = renderHook(() => useGitPolling(defaultProps))
      expect(result.current.selectedFileStatus).toBeNull()
    })

    it('returns null when file not in git status', async () => {
      const gitStatus = makeGitStatus({ files: [], current: 'feature/test' })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)

      const session = makeSession({
        selectedFilePath: '/test/project/src/unknown.ts',
      })

      const { result } = renderHook(() =>
        useGitPolling({
          ...defaultProps,
          sessions: [session],
          activeSession: session,
        })
      )

      await act(async () => {
        await result.current.fetchGitStatus()
      })

      expect(result.current.selectedFileStatus).toBeNull()
    })
  })

  describe('activeSessionGitStatus', () => {
    it('returns files from active session git status', async () => {
      const files = [{ path: 'file.ts', status: 'modified' as const, staged: false, indexStatus: ' ', workingDirStatus: 'M' }]
      const gitStatus = makeGitStatus({ files, current: 'feature/test' })
      vi.mocked(window.git.status).mockResolvedValue(gitStatus)
      vi.mocked(normalizeGitStatus).mockReturnValue(gitStatus)

      const { result } = renderHook(() => useGitPolling(defaultProps))

      await act(async () => {
        await result.current.fetchGitStatus()
      })

      expect(result.current.activeSessionGitStatus).toEqual(files)
      expect(result.current.activeSessionGitStatusResult).toEqual(gitStatus)
    })

    it('returns empty array without active session', () => {
      const { result } = renderHook(() =>
        useGitPolling({ ...defaultProps, activeSession: undefined })
      )

      expect(result.current.activeSessionGitStatus).toEqual([])
      expect(result.current.activeSessionGitStatusResult).toBeNull()
    })
  })
})
