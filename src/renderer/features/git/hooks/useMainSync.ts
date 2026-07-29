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

/** The view-model as it's threaded down to the section components (stable `onSyncMain(repoId)`). */
export interface MainSyncProps {
  mainBehindByRepoId: ReadonlyMap<string, MainBehind>
  syncingRepoIds: ReadonlySet<string>
  onSyncMain: (repoId: string) => Promise<{ success: boolean; error?: string }>
}

/**
 * A single card's resolved sync inputs. Parents resolve the repo (so legacy path-only sessions still
 * get the affordance) and pass just these — identity-stable when unchanged, so `SessionCard`'s
 * `React.memo` isn't defeated by a whole-map/set prop that changes on any repo's update.
 */
export interface CardMainSync {
  /** Resolved managed-repo id for the card's session; undefined = unmanaged / unresolved (no chip/menu). */
  syncRepoId?: string
  mainBehind?: MainBehind
  isSyncing?: boolean
  onSyncMain: (repoId: string) => Promise<{ success: boolean; error?: string }>
}

/**
 * Resolve a card's sync inputs from an already-resolved repo id. Shared by every card render path
 * (grouped, search, archived) so the "look up behind + syncing" logic lives in one place; returns
 * identity-stable values (the `MainBehind` object is unchanged when that repo didn't change).
 */
export function resolveCardMainSync(
  repoId: string | undefined,
  mainBehindByRepoId: ReadonlyMap<string, MainBehind>,
  syncingRepoIds: ReadonlySet<string>,
): { syncRepoId?: string; mainBehind?: MainBehind; isSyncing: boolean } {
  return {
    syncRepoId: repoId,
    mainBehind: repoId ? mainBehindByRepoId.get(repoId) : undefined,
    isSyncing: repoId ? syncingRepoIds.has(repoId) : false,
  }
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
  const pendingRefresh = useRef(new Set<string>()) // a refresh requested while one was in flight — re-run after
  const refreshToken = useRef(new Map<string, number>()) // latest-wins; bumped by a completed sync too
  const lastFetchedAt = useRef(new Map<string, number>())
  // The current eligible set, synchronously readable. Publication consults it so an op that settles
  // after its repo left the sidebar can't republish (and resurrect) that repo's dropped state.
  const eligibleRef = useRef<ReadonlySet<string>>(new Set())

  const mainDirFor = useCallback((repoId: string): string | null => {
    const repo = reposRef.current.find((r) => r.id === repoId)
    return repo ? `${repo.rootDir}/main` : null
  }, [])

  // The single publication path for BOTH success and failure. Gates on mounted + still-eligible so a
  // late result never writes after unmount nor re-adds a repo that has left the sidebar. `compute` may
  // read the prior value (a failure keeps the last known behind-count as `lastKnownBehind`).
  const publish = useCallback((repoId: string, compute: MainBehind | ((prev: MainBehind | undefined) => MainBehind)) => {
    if (!mountedRef.current || !eligibleRef.current.has(repoId)) return
    setBehindByRepoId((prev) => {
      if (!eligibleRef.current.has(repoId)) return prev
      const next = new Map(prev)
      next.set(repoId, typeof compute === 'function' ? compute(prev.get(repoId)) : compute)
      return next
    })
  }, [])

  const refresh = useCallback(async (repoId: string): Promise<void> => {
    // A sync owns the count while it runs — don't queue a refresh behind it.
    if (inFlightSync.current.has(repoId)) return
    // Already refreshing: coalesce this request and re-run once after it settles. This covers a
    // drop→re-add where the in-flight result is stale (token-invalidated) — without the re-run the
    // re-added repo would show no count until the next focus.
    if (inFlightRefresh.current.has(repoId)) { pendingRefresh.current.add(repoId); return }
    const dir = mainDirFor(repoId)
    if (!dir) return
    inFlightRefresh.current.add(repoId)
    pendingRefresh.current.delete(repoId) // this call services any queued request
    const token = (refreshToken.current.get(repoId) ?? 0) + 1
    refreshToken.current.set(repoId, token)
    lastFetchedAt.current.set(repoId, Date.now())
    try {
      const result = await window.git.isBehindMain(dir)
      // Latest-wins: a newer refresh, a completed sync, or a drop (token bumped) owns the state now.
      if (refreshToken.current.get(repoId) !== token || inFlightSync.current.has(repoId)) return
      if (result.success) publish(repoId, { status: 'available', behind: result.behind })
      else publish(repoId, (prev) => toUnavailable(prev, result.error))
    } catch (err) {
      if (refreshToken.current.get(repoId) !== token) return
      publish(repoId, (prev) => toUnavailable(prev, String(err)))
    } finally {
      inFlightRefresh.current.delete(repoId)
      // Service a request that arrived mid-flight (e.g. drop→re-add) if the repo is still eligible.
      if (pendingRefresh.current.delete(repoId) && eligibleRef.current.has(repoId)) void refresh(repoId)
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
        else publish(repoId, (prev) => toUnavailable(prev, result.error))
        return result
      } catch (err) {
        const error = String(err)
        refreshToken.current.set(repoId, (refreshToken.current.get(repoId) ?? 0) + 1)
        publish(repoId, (prev) => toUnavailable(prev, error))
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
  // Keep the synchronous eligibility view (read by `publish`) current with each render.
  eligibleRef.current = eligibleRepoIds

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
    // Invalidate any in-flight refresh for a now-ineligible repo so a late result can't republish it
    // (the mounted+eligible guard in `publish` is the real backstop; this also avoids stale re-adds).
    for (const id of prevEligible.current) {
      if (!eligibleRepoIds.has(id)) refreshToken.current.set(id, (refreshToken.current.get(id) ?? 0) + 1)
    }
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
