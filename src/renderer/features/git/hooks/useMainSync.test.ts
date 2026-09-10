// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useMainSync } from './useMainSync'
import { useErrorStore } from '../../../store/errors'
import type { ManagedRepo } from '../../../../preload/apis/types'

function repo(id: string): ManagedRepo {
  return { id, name: id, remoteUrl: '', rootDir: `/root/${id}`, defaultBranch: 'main' }
}

beforeEach(() => {
  vi.mocked(window.git.pullOriginMain).mockReset().mockResolvedValue({ success: true })
  useErrorStore.setState({ detailError: null })
})
afterEach(() => cleanup())

describe('useMainSync', () => {
  it('fast-forwards the repo’s main/ clone and returns success', async () => {
    const { result } = renderHook(() => useMainSync([repo('r1')]))

    let res: { success: boolean; error?: string } | undefined
    await act(async () => { res = await result.current.syncMain('r1') })

    expect(res).toEqual({ success: true })
    expect(window.git.pullOriginMain).toHaveBeenCalledWith('/root/r1/main')
  })

  it('rejects an unknown/stale repo without calling git', async () => {
    const { result } = renderHook(() => useMainSync([]))

    let res: { success: boolean; error?: string } | undefined
    await act(async () => { res = await result.current.syncMain('ghost') })

    expect(res).toEqual({ success: false, error: 'Unknown repository.' })
    expect(window.git.pullOriginMain).not.toHaveBeenCalled()
  })

  it('returns a refused fast-forward to the caller without surfacing it itself', async () => {
    vi.mocked(window.git.pullOriginMain).mockResolvedValue({ success: false, error: 'diverged' })
    const { result } = renderHook(() => useMainSync([repo('r1')]))

    let res: { success: boolean; error?: string } | undefined
    await act(async () => { res = await result.current.syncMain('r1') })

    expect(res).toEqual({ success: false, error: 'diverged' })
    expect(useErrorStore.getState().detailError).toBeNull()
  })

  it('turns a rejected pull into a failure result', async () => {
    vi.mocked(window.git.pullOriginMain).mockRejectedValue(new Error('net down'))
    const { result } = renderHook(() => useMainSync([repo('r1')]))

    let res: { success: boolean; error?: string } | undefined
    await act(async () => { res = await result.current.syncMain('r1') })

    expect(res?.success).toBe(false)
    expect(res?.error).toContain('net down')
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
})
