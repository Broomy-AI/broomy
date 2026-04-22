// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useGitPolling } from './useGitPolling'
import type { GitStatusResult } from '../../../../preload/index'
import type { Session } from '../../../store/sessions'

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

describe('useGitPolling', () => {
  const refreshSession = vi.fn<(sessionId: string, opts?: { includePr?: boolean }) => Promise<void>>()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    refreshSession.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  describe('polling', () => {
    it('calls refreshSession once immediately on mount (even when idle)', async () => {
      const activeSession = makeSession({ status: 'idle' })
      renderHook(() => useGitPolling({ activeSession, refreshSession }))

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(refreshSession).toHaveBeenCalledWith('session-1')
      expect(refreshSession).toHaveBeenCalledTimes(1)
    })

    it('does not set up interval polling while idle', async () => {
      const activeSession = makeSession({ status: 'idle' })
      renderHook(() => useGitPolling({ activeSession, refreshSession }))

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      refreshSession.mockClear()

      await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
      expect(refreshSession).not.toHaveBeenCalled()
    })

    it('polls every 2 seconds while agent is working', async () => {
      const activeSession = makeSession({ status: 'working' })
      renderHook(() => useGitPolling({ activeSession, refreshSession }))

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      refreshSession.mockClear()

      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(refreshSession).toHaveBeenCalledTimes(1)

      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(refreshSession).toHaveBeenCalledTimes(2)
    })

    it('stops polling when agent transitions from working to idle', async () => {
      const workingSession = makeSession({ status: 'working' })
      const { rerender } = renderHook(
        ({ s }) => useGitPolling({ activeSession: s, refreshSession }),
        { initialProps: { s: workingSession } }
      )

      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      refreshSession.mockClear()

      const idleSession = makeSession({ status: 'idle' })
      rerender({ s: idleSession })

      // The rerender fires one refresh (initial-on-mount behavior carries over).
      // After that, no further polls should occur.
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      refreshSession.mockClear()

      await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
      expect(refreshSession).not.toHaveBeenCalled()
    })

    it('does not poll without active session', async () => {
      renderHook(() => useGitPolling({ activeSession: undefined, refreshSession }))
      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      expect(refreshSession).not.toHaveBeenCalled()
    })

    it('does not poll while initializing', async () => {
      const activeSession = makeSession({ status: 'initializing' })
      renderHook(() => useGitPolling({ activeSession, refreshSession }))
      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      expect(refreshSession).not.toHaveBeenCalled()
    })

    it('stops polling on unmount', async () => {
      const activeSession = makeSession({ status: 'working' })
      const { unmount } = renderHook(() => useGitPolling({ activeSession, refreshSession }))

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      refreshSession.mockClear()
      unmount()

      await vi.advanceTimersByTimeAsync(4000)
      expect(refreshSession).not.toHaveBeenCalled()
    })
  })

  describe('agent-finished event', () => {
    it('calls refreshSession with includePr=true on broomy:agent-finished', async () => {
      const activeSession = makeSession()
      renderHook(() => useGitPolling({ activeSession, refreshSession }))

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      refreshSession.mockClear()

      await act(async () => {
        document.dispatchEvent(new CustomEvent('broomy:agent-finished'))
      })

      expect(refreshSession).toHaveBeenCalledWith('session-1', { includePr: true })
    })

    it('does not fire when no active session', () => {
      renderHook(() => useGitPolling({ activeSession: undefined, refreshSession }))
      document.dispatchEvent(new CustomEvent('broomy:agent-finished'))
      expect(refreshSession).not.toHaveBeenCalled()
    })
  })

  describe('derived values from session.gitStatus', () => {
    it('returns files from the session gitStatus', () => {
      const files = [{ path: 'file.ts', status: 'modified' as const, staged: false, indexStatus: ' ', workingDirStatus: 'M' }]
      const activeSession = makeSession({ gitStatus: makeGitStatus({ files }) })
      const { result } = renderHook(() => useGitPolling({ activeSession, refreshSession }))

      expect(result.current.activeSessionGitStatus).toEqual(files)
      expect(result.current.activeSessionGitStatusResult).toEqual(activeSession.gitStatus)
    })

    it('returns empty array when session has no gitStatus', () => {
      const activeSession = makeSession()
      const { result } = renderHook(() => useGitPolling({ activeSession, refreshSession }))

      expect(result.current.activeSessionGitStatus).toEqual([])
      expect(result.current.activeSessionGitStatusResult).toBeNull()
    })

    it('returns selectedFileStatus for a file present in gitStatus', () => {
      const files = [{ path: 'src/file.ts', status: 'modified' as const, staged: false, indexStatus: ' ', workingDirStatus: 'M' }]
      const activeSession = makeSession({
        selectedFilePath: '/test/project/src/file.ts',
        gitStatus: makeGitStatus({ files }),
      })
      const { result } = renderHook(() => useGitPolling({ activeSession, refreshSession }))

      expect(result.current.selectedFileStatus).toBe('modified')
    })

    it('returns null selectedFileStatus when no file selected', () => {
      const activeSession = makeSession()
      const { result } = renderHook(() => useGitPolling({ activeSession, refreshSession }))
      expect(result.current.selectedFileStatus).toBeNull()
    })
  })

  describe('fetchGitStatus', () => {
    it('calls refreshSession for the active session', async () => {
      const activeSession = makeSession()
      const { result } = renderHook(() => useGitPolling({ activeSession, refreshSession }))

      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      refreshSession.mockClear()

      await act(async () => { await result.current.fetchGitStatus() })
      expect(refreshSession).toHaveBeenCalledWith('session-1')
    })

    it('is a no-op when there is no active session', async () => {
      const { result } = renderHook(() => useGitPolling({ activeSession: undefined, refreshSession }))
      await result.current.fetchGitStatus()
      expect(refreshSession).not.toHaveBeenCalled()
    })
  })
})
