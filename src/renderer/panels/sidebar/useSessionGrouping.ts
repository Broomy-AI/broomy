/**
 * Derives the sidebar's grouped/sorted view from the session + repo state, and
 * publishes the visible session-id order (for keyboard Next/Prev) from an effect.
 */
import { useMemo, useEffect, useCallback } from 'react'
import { useSessionStore } from '../../store/sessions'
import { useSettingsStore } from '../../store/settings'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import { groupSessionsByRepo, resolveRepoId, rollUpStatus } from './repoGroups'
import { railColorsForGroups } from './repoRail'

export function useSessionGrouping(
  allActive: Session[],
  activeSessions: Session[],
  archivedSessions: Session[],
  repos: ManagedRepo[],
  searching: boolean,
) {
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme)
  const railColored = useSettingsStore((s) => s.appearance.sidebarRailColored)
  const collapsedRepoGroups = useSessionStore((s) => s.collapsedRepoGroups)
  const setRepoGroupCollapsed = useSessionStore((s) => s.setRepoGroupCollapsed)
  const setSidebarOrder = useSessionStore((s) => s.setSidebarOrder)
  const collapsedSet = useMemo(() => new Set(collapsedRepoGroups), [collapsedRepoGroups])

  const repoById = useMemo(() => new Map(repos.map((r) => [r.id, r])), [repos])
  // Resolved the same way as the grouped view, so a session tagged in search mode lands under
  // the same repo name it clusters under when grouped.
  const repoLabelFor = useCallback(
    (s: Session) => {
      const repoId = resolveRepoId(s, repos)
      return !repoId ? 'No repo' : repoById.get(repoId)?.name ?? 'Unknown repository'
    },
    [repoById, repos],
  )

  // Grouped view is built from ALL non-archived sessions; the search render uses the
  // filtered subset flattened alphabetically.
  const groups = useMemo(() => groupSessionsByRepo(allActive, repos), [allActive, repos])
  const orderedSessions = useMemo(
    () => groupSessionsByRepo(activeSessions, repos).flatMap((g) => g.sessions),
    [activeSessions, repos],
  )
  const archivedRollup = useMemo(() => rollUpStatus(archivedSessions), [archivedSessions])

  // Full order = every non-archived session in display order (for directional keyboard
  // scanning, independent of search). Visible subset = what's currently shown.
  const fullIds = useMemo(() => groups.flatMap((g) => g.sessions.map((s) => s.id)), [groups])
  const visibleIds = useMemo(
    () =>
      searching
        ? orderedSessions.map((s) => s.id)
        : groups.flatMap((g) => (collapsedSet.has(g.key) ? [] : g.sessions.map((s) => s.id))),
    [searching, orderedSessions, groups, collapsedSet],
  )
  const fullKey = fullIds.join('\n')
  const visibleKey = visibleIds.join('\n')
  useEffect(() => {
    // Publish from an effect (never during render), equality-guarded via the joined keys.
    setSidebarOrder(fullKey ? fullKey.split('\n') : [], visibleKey ? visibleKey.split('\n') : [])
  }, [fullKey, visibleKey, setSidebarOrder])
  // Clear the published order when the sidebar unmounts (hidden), so global Next/Prev
  // falls back to raw active order rather than a stale/filtered list.
  useEffect(() => () => setSidebarOrder([], []), [setSidebarOrder])

  // Rail colours assigned across the whole group set at once, so every visible repo is guaranteed a
  // distinct colour (see railColorsForGroups) rather than gambling on a per-repo hash.
  const railColorByKey = useMemo(
    () => railColorsForGroups(resolvedTheme, groups, railColored),
    [resolvedTheme, groups, railColored],
  )

  return { resolvedTheme, railColored, railColorByKey, collapsedSet, setRepoGroupCollapsed, repoLabelFor, groups, orderedSessions, archivedRollup }
}
