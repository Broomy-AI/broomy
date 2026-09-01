// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useMainSync } from './useMainSync'
import { reportMainSyncFailure } from '../mainSyncError'
import type { ManagedRepo } from '../../../../preload/apis/types'

vi.mock('../mainSyncError', () => ({ reportMainSyncFailure: vi.fn() }))

function repo(id: string): ManagedRepo {
  return { id, name: id, remoteUrl: '', rootDir: `/root/${id}`, defaultBranch: 'main' } as ManagedRepo
}

beforeEach(() => {
  vi.mocked(window.git.pullOriginMain).mockReset().mockResolvedValue({ success: true })
  vi.mocked(reportMainSyncFailure).mockReset()
})
afterEach(() => cleanup())

describe('useMainSync', () => {
  it('fast-forwards the repo’s main/ clone and returns success', async () => {
    const { result } = renderHook(() => useMainSync([repo('r1')]))

    let res: { success: boolean; error?: string } | undefined
    await act(async () => { res = await result.current.syncMain('r1') })

    expect(res).toEqual({ success: true })
    expect(window.git.pullOriginMain).toHaveBeenCalledWith('/root/r1/main')
    expect(reportMainSyncFailure).not.toHaveBeenCalled()
  })

  it('rejects an unknown/stale repo without calling git or reporting', async () => {
    const { result } = renderHook(() => useMainSync([]))

    let res: { success: boolean; error?: string } | undefined
    await act(async () => { res = await result.current.syncMain('ghost') })

    expect(res).toEqual({ success: false, error: 'Unknown repository.' })
    expect(window.git.pullOriginMain).not.toHaveBeenCalled()
    expect(reportMainSyncFailure).not.toHaveBeenCalled()
  })

  it('returns the failure and reports it once when the fast-forward is refused', async () => {
    vi.mocked(window.git.pullOriginMain).mockResolvedValue({ success: false, error: 'diverged' })
    const { result } = renderHook(() => useMainSync([repo('r1')]))

    let res: { success: boolean; error?: string } | undefined
    await act(async () => { res = await result.current.syncMain('r1') })

    expect(res).toEqual({ success: false, error: 'diverged' })
    expect(reportMainSyncFailure).toHaveBeenCalledTimes(1)
    expect(reportMainSyncFailure).toHaveBeenCalledWith('diverged')
  })

  it('surfaces a rejected pull as a failure result and reports once', async () => {
    vi.mocked(window.git.pullOriginMain).mockRejectedValue(new Error('net down'))
    const { result } = renderHook(() => useMainSync([repo('r1')]))

    let res: { success: boolean; error?: string } | undefined
    await act(async () => { res = await result.current.syncMain('r1') })

    expect(res?.success).toBe(false)
    expect(res?.error).toContain('net down')
    expect(reportMainSyncFailure).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent syncMain calls for the same repo onto one pull', async () => {
    let resolvePull!: (v: { success: boolean }) => void
    vi.mocked(window.git.pullOriginMain).mockReturnValueOnce(new Promise((r) => { resolvePull = r }))
    const { result } = renderHook(() => useMainSync([repo('r1')]))

    let p1!: Promise<unknown>, p2!: Promise<unknown>
    act(() => { p1 = result.current.syncMain('r1'); p2 = result.current.syncMain('r1') })

    expect(p1).toBe(p2)
    expect(window.git.pullOriginMain).toHaveBeenCalledTimes(1)

    await act(async () => { resolvePull({ success: true }); await p1 })

    // The op cleared its in-flight slot, so a later call starts a fresh pull.
    await act(async () => { await result.current.syncMain('r1') })
    expect(window.git.pullOriginMain).toHaveBeenCalledTimes(2)
  })

  it('reports a shared failing op exactly once even with two awaiting callers', async () => {
    vi.mocked(window.git.pullOriginMain).mockResolvedValue({ success: false, error: 'diverged' })
    const { result } = renderHook(() => useMainSync([repo('r1')]))

    await act(async () => {
      const p1 = result.current.syncMain('r1')
      const p2 = result.current.syncMain('r1')
      expect(p1).toBe(p2)
      await Promise.all([p1, p2])
    })

    expect(reportMainSyncFailure).toHaveBeenCalledTimes(1)
  })
})
