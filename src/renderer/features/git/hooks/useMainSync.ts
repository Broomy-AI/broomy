/**
 * Per-repo "keep `main/` current" coordinator (#170). Owns the sidebar-facing runtime state — how far
 * each repo's primary `main/` clone is behind `origin/<default>`, which repos are currently syncing — and
 * the one `syncMain(repoId)` action shared by the auto-sync-on-merge path and the manual chip / right-click.
 *
 * Pragmatic, best-effort by design (`--ff-only` in the handler guarantees no corruption): counts refresh
 * opportunistically (newly-eligible repos + window focus, TTL-debounced — never a timer), a sync coalesces
 * concurrent calls for the same repo, and a stale count fetch that lands after a newer refresh or a sync is
 * ignored (latest-wins). Git-level serialization lives in the main process (`git:pullOriginMain`'s lock).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ManagedRepo } from '../../../../preload/apis/types'
import type { Session } from '../../../store/sessions'
import { resolveRepoId } from '../../../panels/sidebar/repoGroups'

/** A repo's `main/` behind-count, or `unavailable` when it couldn't be checked / a sync failed. */
export type MainBehind =
  | { status: 'available'; behind: number }
  | { status: 'unavailable'; lastKnownBehind?: number; error?: string }

export interface MainSyncView {
  /** Immutable snapshot; only repos with sessions in the sidebar appear. */
  mainBehindByRepoId: ReadonlyMap<string, MainBehind>
  syncingRepoIds: ReadonlySet<string>
  /** Fast-forward `main/`. Returns the result; the caller surfaces any error (manual → modal, auto → silent). */
  syncMain: (repoId: string) => Promise<{ success: boolean; error?: string }>
}

/** The view-model as it's threaded down to the sidebar components (stable `onSyncMain(repoId)`). */
export interface MainSyncProps {
  mainBehindByRepoId: ReadonlyMap<string, MainBehind>
  syncingRepoIds: ReadonlySet<string>
  onSyncMain: (repoId: string) => Promise<{ success: boolean; error?: string }>
}

/** Don't re-fetch a repo's count on focus if it was checked within this window. */
const FOCUS_TTL_MS = 30_000

function toUnavailable(prev: MainBehind | undefined, error?: string): MainBehind {
  const lastKnownBehind = prev?.status === 'available' ? prev.behind : prev?.lastKnownBehind
  return { status: 'unavailable', lastKnownBehind, error }
}

export function useMainSync(repos: ManagedRepo[], sessions: Session[]): MainSyncView {
  const [behindByRepoId, setBehindByRepoId] = useState<Map<string, MainBehind>>(() => new Map())
  const [syncingRepoIds, setSyncingRepoIds] = useState<Set<string>>(() => new Set())

  // Publication guard: gate React state writes after unmount, never the returned promise.
  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // Synchronous per-repo bookkeeping (refs, not state — read/written outside render).
  const reposRef = useRef(repos)
  reposRef.current = repos
  const inFlightSync = useRef(new Map<string, Promise<{ success: boolean; error?: string }>>())
  const inFlightRefresh = useRef(new Set<string>())
  const refreshToken = useRef(new Map<string, number>()) // latest-wins; bumped by a completed sync too
  const lastFetchedAt = useRef(new Map<string, number>())

  const mainDirFor = useCallback((repoId: string): string | null => {
    const repo = reposRef.current.find((r) => r.id === repoId)
    return repo ? `${repo.rootDir}/main` : null
  }, [])

  const publish = useCallback((repoId: string, value: MainBehind) => {
    if (!mountedRef.current) return
    setBehindByRepoId((prev) => {
      const next = new Map(prev)
      next.set(repoId, value)
      return next
    })
  }, [])

  const refresh = useCallback(async (repoId: string): Promise<void> => {
    // Skip while that repo is syncing (avoids a fetch/fetch race with the pull) or already refreshing.
    if (inFlightSync.current.has(repoId) || inFlightRefresh.current.has(repoId)) return
    const dir = mainDirFor(repoId)
    if (!dir) return
    inFlightRefresh.current.add(repoId)
    const token = (refreshToken.current.get(repoId) ?? 0) + 1
    refreshToken.current.set(repoId, token)
    lastFetchedAt.current.set(repoId, Date.now())
    try {
      const result = await window.git.isBehindMain(dir)
      // Latest-wins: a newer refresh, or a sync that finished meanwhile, owns the state now.
      if (refreshToken.current.get(repoId) !== token || inFlightSync.current.has(repoId)) return
      if (result.success) publish(repoId, { status: 'available', behind: result.behind })
      else setBehindByRepoId((prev) => new Map(prev).set(repoId, toUnavailable(prev.get(repoId), result.error)))
    } catch (err) {
      if (refreshToken.current.get(repoId) !== token) return
      setBehindByRepoId((prev) => new Map(prev).set(repoId, toUnavailable(prev.get(repoId), String(err))))
    } finally {
      inFlightRefresh.current.delete(repoId)
    }
  }, [mainDirFor, publish])

  const syncMain = useCallback((repoId: string): Promise<{ success: boolean; error?: string }> => {
    const existing = inFlightSync.current.get(repoId)
    if (existing) return existing // coalesce concurrent calls (auto ① racing manual ②) onto one op
    const dir = mainDirFor(repoId)
    if (!dir) return Promise.resolve({ success: false, error: 'Unknown repository.' })

    const run = (async (): Promise<{ success: boolean; error?: string }> => {
      try {
        const result = await window.git.pullOriginMain(dir)
        // A completed sync owns the count: bump the token so an in-flight refresh can't overwrite it.
        refreshToken.current.set(repoId, (refreshToken.current.get(repoId) ?? 0) + 1)
        if (result.success) publish(repoId, { status: 'available', behind: 0 })
        else setBehindByRepoId((prev) => new Map(prev).set(repoId, toUnavailable(prev.get(repoId), result.error)))
        return result
      } catch (err) {
        const error = String(err)
        refreshToken.current.set(repoId, (refreshToken.current.get(repoId) ?? 0) + 1)
        setBehindByRepoId((prev) => new Map(prev).set(repoId, toUnavailable(prev.get(repoId), error)))
        return { success: false, error }
      } finally {
        inFlightSync.current.delete(repoId)
        if (mountedRef.current) {
          setSyncingRepoIds((prev) => {
            const next = new Set(prev)
            next.delete(repoId)
            return next
          })
        }
      }
    })()

    inFlightSync.current.set(repoId, run)
    if (mountedRef.current) setSyncingRepoIds((prev) => new Set(prev).add(repoId))
    return run
  }, [mainDirFor, publish])

  // Repos with sessions in the sidebar — the only ones worth a network check. Resolve the repo the
  // same way sidebar grouping does (explicit `repoId`, else by worktree path) so legacy sessions
  // without a stored `repoId` still light up their group's chip.
  const repoById = useMemo(() => new Map(repos.map((r) => [r.id, r])), [repos])
  const eligibleRepoIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of sessions) {
      const repoId = resolveRepoId(s, repos)
      if (repoId && repoById.has(repoId)) ids.add(repoId)
    }
    return ids
  }, [sessions, repos, repoById])

  // Newly-eligible repos get one refresh; drop state for repos that leave the sidebar.
  const prevEligible = useRef(new Set<string>())
  useEffect(() => {
    for (const id of eligibleRepoIds) if (!prevEligible.current.has(id)) void refresh(id)
    setBehindByRepoId((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const id of prev.keys()) if (!eligibleRepoIds.has(id)) { next.delete(id); changed = true }
      return changed ? next : prev
    })
    prevEligible.current = new Set(eligibleRepoIds)
  }, [eligibleRepoIds, refresh])

  // On window focus, re-check repos not fetched within the TTL (a cheap, poll-free freshness bound).
  useEffect(() => {
    const onFocus = (): void => {
      const now = Date.now()
      for (const id of eligibleRepoIds) {
        if (now - (lastFetchedAt.current.get(id) ?? 0) >= FOCUS_TTL_MS) void refresh(id)
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [eligibleRepoIds, refresh])

  return { mainBehindByRepoId: behindByRepoId, syncingRepoIds, syncMain }
}
