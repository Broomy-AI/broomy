/**
 * Pure grouping + ordering for the session sidebar.
 *
 * Sessions cluster by repo. Order is the user's: sessions appear in the order of the
 * persisted `sessions` array (dragged in the sidebar, appended on creation), and groups
 * appear in `repoGroupOrder`. Groups absent from that list fall back to a computed order
 * — named repos first, then "Unknown repository", then "No repo" — so a newly added repo
 * lands somewhere predictable until the user drags it.
 *
 * That fallback ordering goes through ONE shared `Intl.Collator('en-US', …)` so it is
 * identical across dev machines and CI (bare `localeCompare` is host-locale dependent).
 * Ties fall back to the stable id, never to insertion order.
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

/**
 * The repo a session belongs to.
 *
 * An explicit `repoId` always wins. Sessions created before `repoId` existed don't carry one —
 * in practice the per-repo "main" worktree — so fall back to the directory layout every repo
 * uses (`<rootDir>/main` for main, `<rootDir>/<branch>` for worktrees), the same
 * `startsWith(rootDir + '/')` rule already used in NewBranchView. Longest matching rootDir wins,
 * so a repo checked out inside another repo's root resolves to the inner one.
 *
 * A session whose `repoId` IS set but no longer resolves keeps that id: that's a deleted repo
 * ("Unknown repository"), and it must not be silently re-homed by its path.
 */
export function resolveRepoId(
  session: Pick<Session, 'repoId' | 'directory'>,
  repos: ManagedRepo[],
): string | undefined {
  if (session.repoId) return session.repoId
  const dir = session.directory
  if (!dir) return undefined
  let bestId: string | undefined
  let bestLen = -1
  for (const repo of repos) {
    // `|| ''` also covers a persisted repo that predates rootDir, which the type doesn't admit.
    const root = (repo.rootDir || '').replace(/\/+$/, '')
    if (!root) continue
    if (dir !== root && !dir.startsWith(`${root}/`)) continue
    if (root.length > bestLen) {
      bestLen = root.length
      bestId = repo.id
    }
  }
  return bestId
}

/** Stable group key — depends only on whether a repo resolves, not on whether it still exists. */
export function groupKeyForSession(
  session: Pick<Session, 'repoId' | 'directory'>,
  repos: ManagedRepo[],
): string {
  const repoId = resolveRepoId(session, repos)
  return repoId ? `repo:${repoId}` : UNGROUPED_KEY
}

function rankForKind(kind: RepoGroupKind): number {
  return kind === 'repo' ? 0 : kind === 'unknown' ? 1 : 2
}

/**
 * Group active (non-archived) sessions by repo. Pure and non-mutating: the input arrays
 * and session objects are never touched.
 */
export function groupSessionsByRepo(
  sessions: Session[],
  repos: ManagedRepo[],
  repoGroupOrder: string[] = [],
): RepoGroup[] {
  const repoById = new Map(repos.map((r) => [r.id, r]))
  const groups = new Map<string, RepoGroup>()

  for (const session of sessions) {
    if (session.isArchived) continue
    const repoId = resolveRepoId(session, repos)
    const key = repoId ? `repo:${repoId}` : UNGROUPED_KEY
    let group = groups.get(key)
    if (!group) {
      let kind: RepoGroupKind
      let label: string
      if (!repoId) {
        kind = 'ungrouped'
        label = 'No repo'
      } else {
        const repo = repoById.get(repoId)
        if (repo) {
          kind = 'repo'
          label = repo.name
        } else {
          kind = 'unknown'
          label = 'Unknown repository'
        }
      }
      group = { key, label, kind, repoId, sessions: [] }
      groups.set(key, group)
    }
    group.sessions.push(session)
  }

  const result = [...groups.values()]

  // Groups the user has dragged come first, in that order; the rest fall back to the
  // computed order. `indexOf` is fine here — the list is one entry per visible repo.
  const rank = (g: RepoGroup) => {
    const i = repoGroupOrder.indexOf(g.key)
    return i === -1 ? repoGroupOrder.length : i
  }
  result.sort(
    (a, b) =>
      rank(a) - rank(b) ||
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

/** The flat list of visible session ids across all groups, in group order then array order. */
export function flattenGroupOrder(groups: RepoGroup[]): string[] {
  return groups.flatMap((g) => g.sessions.map((s) => s.id))
}
