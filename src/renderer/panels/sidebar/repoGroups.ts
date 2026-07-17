/**
 * Pure grouping + alphabetical sorting for the session sidebar.
 *
 * Sessions cluster by repo; groups sort A→Z by repo name (named repos first, then
 * "Unknown repository", then "No repo"); sessions sort A→Z by branch within a group.
 * Everything is computed — there is no manual order and nothing here is persisted.
 *
 * All string ordering goes through ONE shared `Intl.Collator('en-US', …)` so the
 * result is identical across dev machines and CI (bare `localeCompare` is host-locale
 * dependent). Ties fall back to the stable id, never to insertion order.
 */
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'

const UNGROUPED_KEY = 'ungrouped'

/** One shared, locale-stable collator for every name/branch comparison. */
const collator = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true })

/** Stable string compare for id tiebreaks (never locale-dependent). */
function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export type RepoGroupKind = 'repo' | 'unknown' | 'ungrouped'

export interface RepoGroup {
  /** Stable across repo resolution changes: `repo:<id>` for any defined repoId, else `ungrouped`. */
  key: string
  /** Repo name, or "Unknown repository" (repoId set but repo gone), or "No repo". */
  label: string
  kind: RepoGroupKind
  repoId?: string
  sessions: Session[]
}

export type RollupStatus = 'error' | 'unread' | 'working' | 'initializing' | 'idle'

export interface Rollup {
  /** The single highest-priority status in the group. */
  status: RollupStatus
  /** How many sessions are in that winning category (0 for a fully-idle group). */
  count: number
  total: number
}

/** Stable group key — depends only on whether a repoId exists, not on whether it resolves. */
export function groupKeyForSession(session: Pick<Session, 'repoId'>): string {
  return session.repoId ? `repo:${session.repoId}` : UNGROUPED_KEY
}

function rankForKind(kind: RepoGroupKind): number {
  return kind === 'repo' ? 0 : kind === 'unknown' ? 1 : 2
}

/**
 * Group active (non-archived) sessions by repo and sort everything alphabetically.
 * Pure and non-mutating: the input arrays and session objects are never touched.
 */
export function groupSessionsByRepo(sessions: Session[], repos: ManagedRepo[]): RepoGroup[] {
  const repoById = new Map(repos.map((r) => [r.id, r]))
  const groups = new Map<string, RepoGroup>()

  for (const session of sessions) {
    if (session.isArchived) continue
    const key = groupKeyForSession(session)
    let group = groups.get(key)
    if (!group) {
      let kind: RepoGroupKind
      let label: string
      if (!session.repoId) {
        kind = 'ungrouped'
        label = 'No repo'
      } else {
        const repo = repoById.get(session.repoId)
        if (repo) {
          kind = 'repo'
          label = repo.name
        } else {
          kind = 'unknown'
          label = 'Unknown repository'
        }
      }
      group = { key, label, kind, repoId: session.repoId, sessions: [] }
      groups.set(key, group)
    }
    group.sessions.push(session)
  }

  const result = [...groups.values()]

  // Sort sessions within each group: branch A→Z, then id. (New arrays — input untouched.)
  for (const group of result) {
    group.sessions.sort(
      (a, b) => collator.compare(a.branch, b.branch) || byId(a.id, b.id),
    )
  }

  // Sort the groups: kind rank → label A→Z → repoId (total order, deterministic).
  result.sort(
    (a, b) =>
      rankForKind(a.kind) - rankForKind(b.kind) ||
      collator.compare(a.label, b.label) ||
      byId(a.repoId ?? '', b.repoId ?? ''),
  )

  return result
}

/**
 * Highest-priority status in a group, for the collapsed-header roll-up.
 * Priority: error/initError > unread > working > initializing > idle. Raw store
 * state only — never the card's debounced `showWorking`.
 */
export function rollUpStatus(sessions: Session[]): Rollup {
  let error = 0
  let unread = 0
  let working = 0
  let initializing = 0
  for (const s of sessions) {
    if (s.status === 'error' || s.initError) error++
    else if (s.isUnread) unread++
    else if (s.status === 'working') working++
    else if (s.status === 'initializing') initializing++
  }
  const total = sessions.length
  if (error) return { status: 'error', count: error, total }
  if (unread) return { status: 'unread', count: unread, total }
  if (working) return { status: 'working', count: working, total }
  if (initializing) return { status: 'initializing', count: initializing, total }
  return { status: 'idle', count: 0, total }
}

/** The flat, alphabetically-sorted list of visible session ids across all groups. */
export function flattenGroupOrder(groups: RepoGroup[]): string[] {
  return groups.flatMap((g) => g.sessions.map((s) => s.id))
}
