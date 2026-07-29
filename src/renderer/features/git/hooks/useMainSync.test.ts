// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { useMainSync } from './useMainSync'
import type { ManagedRepo } from '../../../../preload/apis/types'
import type { Session } from '../../../store/sessions'

function repo(id: string): ManagedRepo {
  return { id, name: id, remoteUrl: '', rootDir: `/root/${id}`, defaultBranch: 'main' } as ManagedRepo
}
function sess(id: string, repoId?: string): Session {
  return { id, repoId, directory: `/root/${repoId ?? 'x'}/wt`, branch: 'b', status: 'idle', isArchived: false } as Session
}

/** Flush pending microtasks (the awaited IPC promise + its setState) inside act. */
const flush = () => act(async () => { await Promise.resolve() })

beforeEach(() => {
  vi.mocked(window.git.isBehindMain).mockReset().mockResolvedValue({ success: true, behind: 0, defaultBranch: 'main' })
  vi.mocked(window.git.pullOriginMain).mockReset().mockResolvedValue({ success: true })
})
afterEach(() => cleanup())

describe('useMainSync', () => {
  it('refreshes a newly-eligible repo and publishes its available behind-count', async () => {
    vi.mocked(window.git.isBehindMain).mockResolvedValue({ success: true, behind: 7, defaultBranch: 'main' })
    const { result } = renderHook(() => useMainSync([repo('r1')], [sess('s1', 'r1')]))

    await waitFor(() => expect(result.current.mainBehindByRepoId.get('r1')).toEqual({ status: 'available', behind: 7 }))
    expect(window.git.isBehindMain).toHaveBeenCalledWith('/root/r1/main')
  })

  it('resolves legacy sessions (no repoId) by worktree path', async () => {
    vi.mocked(window.git.isBehindMain).mockResolvedValue({ success: true, behind: 2, defaultBranch: 'main' })
    // Session lacks repoId but sits under the repo's rootDir, so resolveRepoId maps it to r1.
    const legacy = { id: 's1', directory: '/root/r1/some-branch', branch: 'b', status: 'idle', isArchived: false } as Session
    const { result } = renderHook(() => useMainSync([repo('r1')], [legacy]))

    await waitFor(() => expect(result.current.mainBehindByRepoId.get('r1')).toEqual({ status: 'available', behind: 2 }))
  })

  it('marks a repo unavailable when the behind-check fails', async () => {
    vi.mocked(window.git.isBehindMain).mockResolvedValue({ success: false, error: 'no clone' })
    const { result } = renderHook(() => useMainSync([repo('r1')], [sess('s1', 'r1')]))

    await waitFor(() =>
      expect(result.current.mainBehindByRepoId.get('r1')).toEqual({ status: 'unavailable', lastKnownBehind: undefined, error: 'no clone' }),
    )
  })

  it('marks a repo unavailable when the behind-check rejects', async () => {
    vi.mocked(window.git.isBehindMain).mockRejectedValue(new Error('io fail'))
    const { result } = renderHook(() => useMainSync([repo('r1')], [sess('s1', 'r1')]))

    await waitFor(() => {
      const v = result.current.mainBehindByRepoId.get('r1')
      expect(v?.status).toBe('unavailable')
      expect(v?.status === 'unavailable' && v.error).toContain('io fail')
    })
  })

  it('syncMain fast-forwards, zeroes the count, and returns success', async () => {
    vi.mocked(window.git.isBehindMain).mockResolvedValue({ success: true, behind: 3, defaultBranch: 'main' })
    const { result } = renderHook(() => useMainSync([repo('r1')], [sess('s1', 'r1')]))
    await waitFor(() => expect(result.current.mainBehindByRepoId.get('r1')).toEqual({ status: 'available', behind: 3 }))

    let res: { success: boolean; error?: string } | undefined
    await act(async () => { res = await result.current.syncMain('r1') })

    expect(res).toEqual({ success: true })
    expect(window.git.pullOriginMain).toHaveBeenCalledWith('/root/r1/main')
    expect(result.current.mainBehindByRepoId.get('r1')).toEqual({ status: 'available', behind: 0 })
    expect(result.current.syncingRepoIds.has('r1')).toBe(false)
  })

  it('syncMain failure keeps the last known count and returns the error', async () => {
    vi.mocked(window.git.isBehindMain).mockResolvedValue({ success: true, behind: 5, defaultBranch: 'main' })
    vi.mocked(window.git.pullOriginMain).mockResolvedValue({ success: false, error: 'diverged' })
    const { result } = renderHook(() => useMainSync([repo('r1')], [sess('s1', 'r1')]))
    await waitFor(() => expect(result.current.mainBehindByRepoId.get('r1')).toEqual({ status: 'available', behind: 5 }))

    let res: { success: boolean; error?: string } | undefined
    await act(async () => { res = await result.current.syncMain('r1') })

    expect(res).toEqual({ success: false, error: 'diverged' })
    expect(result.current.mainBehindByRepoId.get('r1')).toEqual({ status: 'unavailable', lastKnownBehind: 5, error: 'diverged' })
  })

  it('syncMain surfaces a rejected pull as a failure result', async () => {
    vi.mocked(window.git.isBehindMain).mockResolvedValue({ success: true, behind: 4, defaultBranch: 'main' })
    vi.mocked(window.git.pullOriginMain).mockRejectedValue(new Error('net down'))
    const { result } = renderHook(() => useMainSync([repo('r1')], [sess('s1', 'r1')]))
    await waitFor(() => expect(result.current.mainBehindByRepoId.get('r1')).toEqual({ status: 'available', behind: 4 }))

    let res: { success: boolean; error?: string } | undefined
    await act(async () => { res = await result.current.syncMain('r1') })

    expect(res?.success).toBe(false)
    expect(res?.error).toContain('net down')
    const v = result.current.mainBehindByRepoId.get('r1')
    expect(v).toEqual({ status: 'unavailable', lastKnownBehind: 4, error: expect.stringContaining('net down') })
  })

  it('syncMain rejects an unknown repo without calling git', async () => {
    const { result } = renderHook(() => useMainSync([], []))
    let res: { success: boolean; error?: string } | undefined
    await act(async () => { res = await result.current.syncMain('ghost') })

    expect(res).toEqual({ success: false, error: 'Unknown repository.' })
    expect(window.git.pullOriginMain).not.toHaveBeenCalled()
  })

  it('coalesces concurrent syncMain calls for the same repo onto one pull', async () => {
    vi.mocked(window.git.isBehindMain).mockResolvedValue({ success: true, behind: 2, defaultBranch: 'main' })
    let resolvePull!: (v: { success: boolean }) => void
    vi.mocked(window.git.pullOriginMain).mockReturnValueOnce(new Promise((r) => { resolvePull = r }))
    const { result } = renderHook(() => useMainSync([repo('r1')], [sess('s1', 'r1')]))
    await waitFor(() => expect(result.current.mainBehindByRepoId.get('r1')).toEqual({ status: 'available', behind: 2 }))

    let p1!: Promise<unknown>, p2!: Promise<unknown>
    act(() => { p1 = result.current.syncMain('r1'); p2 = result.current.syncMain('r1') })

    expect(p1).toBe(p2)
    expect(window.git.pullOriginMain).toHaveBeenCalledTimes(1)
    expect(result.current.syncingRepoIds.has('r1')).toBe(true)

    await act(async () => { resolvePull({ success: true }); await p1 })
    expect(result.current.syncingRepoIds.has('r1')).toBe(false)
  })

  it('drops a repo’s state when it leaves the sidebar', async () => {
    vi.mocked(window.git.isBehindMain).mockResolvedValue({ success: true, behind: 1, defaultBranch: 'main' })
    const { result, rerender } = renderHook(
      ({ r, s }: { r: ManagedRepo[]; s: Session[] }) => useMainSync(r, s),
      { initialProps: { r: [repo('r1')], s: [sess('s1', 'r1')] } },
    )
    await waitFor(() => expect(result.current.mainBehindByRepoId.has('r1')).toBe(true))

    rerender({ r: [repo('r1')], s: [] })
    await waitFor(() => expect(result.current.mainBehindByRepoId.has('r1')).toBe(false))
  })

  describe('window focus (TTL-gated, poll-free)', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000) })
    afterEach(() => { vi.useRealTimers() })

    it('re-checks only after the freshness TTL elapses, and skips while syncing', async () => {
      vi.mocked(window.git.isBehindMain).mockResolvedValue({ success: true, behind: 2, defaultBranch: 'main' })
      let resolvePull!: (v: { success: boolean }) => void
      vi.mocked(window.git.pullOriginMain).mockReturnValueOnce(new Promise((r) => { resolvePull = r }))

      const { result } = renderHook(() => useMainSync([repo('r1')], [sess('s1', 'r1')]))
      // Mount refresh fired one check synchronously and stamped lastFetchedAt at t=1000.
      expect(window.git.isBehindMain).toHaveBeenCalledTimes(1)
      await flush() // let the mount refresh settle so it's no longer "in flight"

      // Focus within the TTL → skipped.
      vi.setSystemTime(1000 + 10_000)
      act(() => { window.dispatchEvent(new Event('focus')) })
      expect(window.git.isBehindMain).toHaveBeenCalledTimes(1)

      // Focus past the TTL → re-checks.
      vi.setSystemTime(1000 + 40_000)
      act(() => { window.dispatchEvent(new Event('focus')) })
      expect(window.git.isBehindMain).toHaveBeenCalledTimes(2)
      await flush() // settle that refresh so the next skip is attributable to the in-flight sync alone

      // Now start a sync and confirm a later focus is skipped while it's in flight.
      vi.mocked(window.git.isBehindMain).mockClear()
      act(() => { void result.current.syncMain('r1') })
      vi.setSystemTime(1000 + 100_000)
      act(() => { window.dispatchEvent(new Event('focus')) })
      expect(window.git.isBehindMain).not.toHaveBeenCalled()

      act(() => { resolvePull({ success: true }) })
      await flush()
    })
  })
})
