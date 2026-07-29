/**
 * ① Auto fast-forward a repo's `main/` clone the moment Broomy observes one of its sessions' PR becoming
 * MERGED (#170) — the in-Broomy-merge trigger. It OBSERVES the session store (never mutates it) and fires
 * `syncMain(repoId)` exactly once per real non-MERGED→MERGED transition.
 *
 * Startup safety: the store's session array + `isLoading:false` commit atomically, so we baseline the
 * last-seen PR state on the first already-loaded snapshot (covering a cold start AND an ErrorBoundary
 * "Try Again" remount, where no `isLoading` edge occurs). A persisted-`MERGED` session therefore never
 * fires on launch, and a session first seen after arming is baselined rather than treated as a transition.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useSessionStore, type Session, type PrState } from '../../../store/sessions'
import type { ManagedRepo } from '../../../../preload/apis/types'
import { resolveRepoId } from '../../../panels/sidebar/repoGroups'

export function useMainAutoSync(repos: ManagedRepo[], syncMain: (repoId: string) => Promise<unknown>): void {
  const reposRef = useRef(repos)
  reposRef.current = repos
  const syncMainRef = useRef(syncMain)
  syncMainRef.current = syncMain

  const prevPrState = useRef(new Map<string, PrState>())
  const baselined = useRef(false)
  const pending = useRef(new Set<string>()) // sessionIds whose merge couldn't yet resolve a managed repo

  const fireOrPend = useCallback((s: Session): void => {
    const currentRepos = reposRef.current
    const repoId = resolveRepoId(s, currentRepos)
    if (repoId && currentRepos.some((r) => r.id === repoId)) {
      pending.current.delete(s.id)
      void syncMainRef.current(repoId) // fire-and-forget; a failure is silent (the chip shows 'unavailable')
    } else {
      pending.current.add(s.id) // repos may not have loaded — retry when they do
    }
  }, [])

  const retryPending = useCallback((sessions: Session[]): void => {
    if (!pending.current.size) return
    for (const id of [...pending.current]) {
      const s = sessions.find((x) => x.id === id)
      if (s) fireOrPend(s)
      else pending.current.delete(id)
    }
  }, [fireOrPend])

  const process = useCallback((sessions: Session[], isLoading: boolean): void => {
    if (!baselined.current) {
      if (isLoading) return
      for (const s of sessions) prevPrState.current.set(s.id, s.lastKnownPrState ?? null)
      baselined.current = true
      return
    }
    const seen = new Set<string>()
    for (const s of sessions) {
      seen.add(s.id)
      const firstSeen = !prevPrState.current.has(s.id)
      const prev = prevPrState.current.get(s.id)
      const cur = s.lastKnownPrState ?? null
      prevPrState.current.set(s.id, cur)
      if (!firstSeen && prev !== 'MERGED' && cur === 'MERGED') fireOrPend(s)
    }
    for (const id of [...prevPrState.current.keys()]) {
      if (!seen.has(id)) { prevPrState.current.delete(id); pending.current.delete(id) }
    }
    retryPending(sessions)
  }, [fireOrPend, retryPending])

  useEffect(() => {
    const st = useSessionStore.getState()
    process(st.sessions, st.isLoading)
    return useSessionStore.subscribe((state) => process(state.sessions, state.isLoading))
  }, [process])

  // Repos live in a separate store; when they load, retry any transitions we couldn't resolve.
  useEffect(() => {
    retryPending(useSessionStore.getState().sessions)
  }, [repos, retryPending])
}
