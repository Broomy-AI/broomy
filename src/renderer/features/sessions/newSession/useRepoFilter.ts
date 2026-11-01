/**
 * Filter state for the New Session home view's repo list: the query, the repos it leaves visible,
 * and a height lock that keeps the centred dialog from shrinking (and moving the box) while you type.
 */
import { useState, useRef, useMemo, useCallback, useLayoutEffect } from 'react'
import type { ManagedRepo } from '../../../../preload/index'

/** The filter box only appears once the list is long enough for it to help. */
export const REPO_FILTER_MIN_REPOS = 6

/** The body's size when filtering started: kept while the filter is active. */
export type BodyLock = { height: number; scrollable: boolean }

/** The New Session dialog element around `el` (it holds the focus whenever no control does). */
export function closestDialog(el: Element | null | undefined) {
  return el?.closest<HTMLElement>('[role="dialog"]') ?? null
}

export function useRepoFilter(repos: ManagedRepo[]) {
  const [query, setQuery] = useState('')
  const [bodyLock, setBodyLock] = useState<BodyLock | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const showFilter = repos.length >= REPO_FILTER_MIN_REPOS
  // The one answer to "is a filter active": a query left behind by a hidden box never counts
  const effectiveQuery = showFilter ? query.trim() : ''

  const visibleRepos = useMemo(() => {
    if (!effectiveQuery) return repos
    const needle = effectiveQuery.toLowerCase()
    return repos.filter((repo) => repo.name.toLowerCase().includes(needle))
  }, [repos, effectiveQuery])

  // Measure before the query is stored: once React renders the filtered list the body has already shrunk.
  // Whether it scrolled matters too: fewer rows drop the scrollbar, and the rows would widen into its place.
  const changeQuery = useCallback((next: string) => {
    const body = bodyRef.current
    if (!effectiveQuery && next.trim() && body && body.offsetHeight > 0) {
      setBodyLock({ height: body.offsetHeight, scrollable: body.scrollHeight > body.clientHeight })
    }
    setQuery(next)
  }, [effectiveQuery])

  const clearQuery = useCallback((refocus: boolean) => {
    setQuery('')
    if (refocus) inputRef.current?.focus()
  }, [])

  // Release the lock however the filter ends: typing it away, ×, Clear filter, Escape, or the box disappearing
  useLayoutEffect(() => {
    if (!effectiveQuery) setBodyLock(null)
  }, [effectiveQuery])

  // Dropping below the threshold removes the box: forget its query (so it can't come back with the box)
  // and pull focus back into the dialog if the removed input or × button had it
  const prevShowFilter = useRef(showFilter)
  useLayoutEffect(() => {
    const wasShown = prevShowFilter.current
    prevShowFilter.current = showFilter
    if (!wasShown || showFilter) return
    setQuery('')
    const dialog = closestDialog(bodyRef.current)
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus()
  }, [showFilter])

  return { query, effectiveQuery, showFilter, visibleRepos, bodyLock, inputRef, bodyRef, changeQuery, clearQuery }
}
