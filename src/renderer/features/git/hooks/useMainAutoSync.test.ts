// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useMainAutoSync } from './useMainAutoSync'
import { useSessionStore } from '../../../store/sessions'
import type { ManagedRepo } from '../../../../preload/apis/types'
import type { Session, PrState } from '../../../store/sessions'

function repo(id: string): ManagedRepo {
  return { id, name: id, remoteUrl: '', rootDir: `/root/${id}`, defaultBranch: 'main' } as ManagedRepo
}
function sess(id: string, prState: PrState, repoId?: string): Session {
  return {
    id, lastKnownPrState: prState, repoId, directory: `/root/${repoId ?? 'x'}/wt`,
    branch: 'b', status: 'idle', isArchived: false,
  } as Session
}
/** A pre-repoId session, resolved to a repo only by its worktree path. */
function legacy(id: string, prState: PrState, rootId: string): Session {
  return { id, lastKnownPrState: prState, directory: `/root/${rootId}/wt`, branch: 'b', status: 'idle', isArchived: false } as Session
}

function setStore(sessions: Session[], isLoading = false) {
  useSessionStore.setState({ sessions, isLoading })
}

type SyncMainMock = ReturnType<typeof vi.fn<(repoId: string) => Promise<{ success: boolean; error?: string }>>>
let syncMain: SyncMainMock

beforeEach(() => {
  syncMain = vi.fn<(repoId: string) => Promise<{ success: boolean; error?: string }>>().mockResolvedValue({ success: true })
  useSessionStore.setState({ sessions: [], isLoading: false })
})
afterEach(() => cleanup())

describe('useMainAutoSync', () => {
  it('does not fire for a persisted MERGED session on an already-loaded mount', () => {
    setStore([sess('s1', 'MERGED', 'r1')], false)
    renderHook(() => useMainAutoSync([repo('r1')], syncMain))
    expect(syncMain).not.toHaveBeenCalled()
  })

  it('baselines on the isLoading falling edge, so a persisted MERGED still never fires', () => {
    setStore([sess('s1', 'MERGED', 'r1')], true) // still loading → no baseline yet
    renderHook(() => useMainAutoSync([repo('r1')], syncMain))
    act(() => { useSessionStore.setState({ isLoading: false }) }) // edge → baseline the MERGED
    expect(syncMain).not.toHaveBeenCalled()
  })

  it('fires exactly once on a real OPEN → MERGED transition', () => {
    setStore([sess('s1', 'OPEN', 'r1')], false)
    renderHook(() => useMainAutoSync([repo('r1')], syncMain))

    act(() => { setStore([sess('s1', 'MERGED', 'r1')]) })

    expect(syncMain).toHaveBeenCalledTimes(1)
    expect(syncMain).toHaveBeenCalledWith('r1')
  })

  it('fires again on a second MERGED after the PR state cycles away and back', () => {
    setStore([sess('s1', 'OPEN', 'r1')], false)
    renderHook(() => useMainAutoSync([repo('r1')], syncMain))

    act(() => { setStore([sess('s1', 'MERGED', 'r1')]) })
    act(() => { setStore([sess('s1', null, 'r1')]) })
    act(() => { setStore([sess('s1', 'MERGED', 'r1')]) })

    expect(syncMain).toHaveBeenCalledTimes(2)
  })

  it('baselines (never fires for) a session first observed already MERGED', () => {
    setStore([], false)
    renderHook(() => useMainAutoSync([repo('r1')], syncMain))

    act(() => { setStore([sess('new', 'MERGED', 'r1')]) }) // absent → MERGED is not a transition
    expect(syncMain).not.toHaveBeenCalled()
  })

  it('pends a transition whose repo has not loaded, then fires when repos arrive', () => {
    setStore([sess('s1', 'OPEN', 'r1')], false)
    const { rerender } = renderHook(
      ({ repos }: { repos: ManagedRepo[] }) => useMainAutoSync(repos, syncMain),
      { initialProps: { repos: [] as ManagedRepo[] } },
    )

    act(() => { setStore([sess('s1', 'MERGED', 'r1')]) })
    expect(syncMain).not.toHaveBeenCalled() // r1 not in repos yet → pended

    rerender({ repos: [repo('r1')] }) // repos load → retry pending
    expect(syncMain).toHaveBeenCalledWith('r1')
  })

  it('resolves a legacy (no-repoId) session to its repo by worktree path', () => {
    setStore([legacy('s1', 'OPEN', 'r1')], false)
    renderHook(() => useMainAutoSync([repo('r1')], syncMain))

    act(() => { setStore([legacy('s1', 'MERGED', 'r1')]) })
    expect(syncMain).toHaveBeenCalledWith('r1')
  })

  it('drops bookkeeping for removed sessions without firing for them', () => {
    setStore([sess('s1', 'OPEN', 'r1'), sess('s2', 'OPEN', 'r1')], false)
    renderHook(() => useMainAutoSync([repo('r1')], syncMain))

    // s2 disappears in the same snapshot where s1 merges: one fire, clean removal.
    act(() => { setStore([sess('s1', 'MERGED', 'r1')]) })
    expect(syncMain).toHaveBeenCalledTimes(1)
    expect(syncMain).toHaveBeenCalledWith('r1')
  })

  it('does not fire when a still-pending session is removed before repos load', () => {
    setStore([sess('s1', 'OPEN', 'r1')], false)
    const { rerender } = renderHook(
      ({ repos }: { repos: ManagedRepo[] }) => useMainAutoSync(repos, syncMain),
      { initialProps: { repos: [] as ManagedRepo[] } },
    )
    act(() => { setStore([sess('s1', 'MERGED', 'r1')]) }) // pended (repos empty)
    act(() => { setStore([]) })                            // session gone before repos load

    rerender({ repos: [repo('r1')] })
    expect(syncMain).not.toHaveBeenCalled()
  })
})
