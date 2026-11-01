/**
 * Home view of the new session dialog showing managed repos and action buttons for creating sessions.
 * With enough repos, a filter box in the header narrows the list (`/` focuses it).
 */
import { useState, useEffect, useRef } from 'react'
import { useRepoStore } from '../../../store/repos'
import type { ManagedRepo } from '../../../../preload/index'
import { useRepoFilter, closestDialog } from './useRepoFilter'
import { RepoFilterInput, filterStatus } from './RepoFilterInput'

/** Stops the key reaching the dialog's other listeners and the browser's default action. */
function consume(e: KeyboardEvent) {
  e.preventDefault()
  e.stopImmediatePropagation()
}

/** Returns the focus to the dialog itself — the state it opens in, where the single-key shortcuts work. */
function focusDialogFrom(el: HTMLElement | null) {
  const dialog = closestDialog(el)
  if (dialog) dialog.focus()
  else el?.blur()
}

function RepoRow({
  repo,
  isFocused,
  ghAvailable,
  onFocus,
  onNewBranch,
  onExistingBranch,
  onIssues,
  onReviewPrs,
  onOpenMain,
  onRepoSettings,
}: {
  key?: string | number | bigint | null
  repo: ManagedRepo
  isFocused: boolean
  ghAvailable: boolean | null
  onFocus: () => void
  onNewBranch: (repo: ManagedRepo) => void
  onExistingBranch: (repo: ManagedRepo) => void
  onIssues: (repo: ManagedRepo) => void
  onReviewPrs: (repo: ManagedRepo) => void
  onOpenMain: (repo: ManagedRepo) => void
  onRepoSettings: (repo: ManagedRepo) => void
}) {
  return (
    <div
      data-repo-row
      role="group"
      aria-label={repo.name}
      onFocus={onFocus}
      className={`flex items-center gap-2 p-2 rounded border bg-bg-primary scroll-my-1 ${
        isFocused ? 'border-accent ring-1 ring-accent/50' : 'border-border'
      }`}
    >
      {/* The name keeps room for a few characters; in a narrow window the buttons wrap instead of
          squeezing it to nothing (you'd no longer see which repo the shortcuts act on) */}
      <div className="flex-1 min-w-20">
        <div className="text-sm font-medium text-text-primary truncate">{repo.name}</div>
        <div className="text-xs text-text-secondary font-mono truncate">{repo.defaultBranch}</div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1 min-w-0">
        <button onClick={() => onNewBranch(repo)} className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-accent/20 text-text-secondary hover:text-accent transition-colors" title="Create a new branch worktree">
          <u>N</u>ew
        </button>
        <button onClick={() => onExistingBranch(repo)} className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-accent/20 text-text-secondary hover:text-accent transition-colors" title="Open an existing branch">
          <u>E</u>xisting
        </button>
        {ghAvailable && (
          <button onClick={() => onIssues(repo)} className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-accent/20 text-text-secondary hover:text-accent transition-colors" title="Browse GitHub issues">
            <u>I</u>ssues
          </button>
        )}
        {ghAvailable && (
          <button onClick={() => onReviewPrs(repo)} className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-review-base/20 text-text-secondary hover:text-review-fg transition-colors" title="Review pull requests">
            <u>R</u>eview
          </button>
        )}
        <button onClick={() => onOpenMain(repo)} className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-accent/20 text-text-secondary hover:text-accent transition-colors" title="Open main branch">
          <u>O</u>pen
        </button>
        <button onClick={() => onRepoSettings(repo)} className="px-1.5 py-1 text-xs rounded bg-bg-tertiary hover:bg-accent/20 text-text-secondary hover:text-accent transition-colors" title="Repository settings">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export function HomeView({
  onClone, onAddExistingRepo, onOpenFolder, onNewBranch, onExistingBranch,
  onRepoSettings, onIssues, onReviewPrs, onOpenMain, onCancel,
}: {
  onClone: () => void; onAddExistingRepo: () => void; onOpenFolder: () => void
  onNewBranch: (repo: ManagedRepo) => void; onExistingBranch: (repo: ManagedRepo) => void
  onRepoSettings: (repo: ManagedRepo) => void; onIssues: (repo: ManagedRepo) => void
  onReviewPrs: (repo: ManagedRepo) => void; onOpenMain: (repo: ManagedRepo) => void
  onCancel: () => void
}) {
  const { repos, ghAvailable } = useRepoStore()
  // Every index below is into the visible (filtered) list, never the full one: the highlight, the rows,
  // and the repo the shortcuts act on must all be the same repo
  const {
    query, effectiveQuery, showFilter, visibleRepos, bodyLock, inputRef, bodyRef, changeQuery, clearQuery,
  } = useRepoFilter(repos)
  const [focusedRepoIndex, setFocusedRepoIndex] = useState(0)
  const repoListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const clamped = Math.min(Math.max(focusedRepoIndex, 0), Math.max(visibleRepos.length - 1, 0))
    if (clamped !== focusedRepoIndex) setFocusedRepoIndex(clamped)
  }, [visibleRepos.length, focusedRepoIndex])

  // A new filter highlights its first match and brings it into view. Not on mount: opening the dialog
  // must not scroll anything
  const prevQueryRef = useRef(effectiveQuery)
  useEffect(() => {
    if (prevQueryRef.current === effectiveQuery) return
    prevQueryRef.current = effectiveQuery
    setFocusedRepoIndex(0)
    // A repo button keeping the focus would now belong to another repo than the highlight (Enter and N
    // would disagree), and a removed button leaves the focus outside the dialog: hand it to the dialog
    const dialog = closestDialog(bodyRef.current)
    const active = document.activeElement
    if (dialog && (!dialog.contains(active) || active?.closest('[data-repo-row]'))) dialog.focus()
    const first = repoListRef.current?.querySelector<HTMLElement>('[data-repo-row]')
    if (first && 'scrollIntoView' in first) first.scrollIntoView({ block: 'nearest' })
  }, [effectiveQuery, bodyRef])

  useEffect(() => {
    const globalKeys = new Map<string, () => void>([
      ['c', onClone], ['a', onAddExistingRepo], ['f', onOpenFolder],
    ])

    // Arrow keys move the highlight, keep it visible, and carry DOM focus along if a row button had it
    // (otherwise Enter would activate the button of a repo that's no longer highlighted). Only here, not
    // whenever the highlight changes: a click focuses on mousedown, and scrolling then would move the row
    // out from under the pointer before mouseup.
    const moveHighlight = (delta: number) => {
      if (visibleRepos.length === 0) return
      const next = Math.min(Math.max(focusedRepoIndex + delta, 0), visibleRepos.length - 1)
      setFocusedRepoIndex(next)
      const row = repoListRef.current?.querySelectorAll<HTMLElement>('[data-repo-row]')[next]
      if (!row) return
      if ('scrollIntoView' in row) row.scrollIntoView({ block: 'nearest' })
      const active = document.activeElement
      const activeRow = active?.closest('[data-repo-row]')
      if (activeRow && activeRow !== row) {
        const column = Array.from(activeRow.querySelectorAll('button')).indexOf(active as HTMLButtonElement)
        const buttons = row.querySelectorAll('button')
        if (column >= 0 && column < buttons.length) buttons[column].focus()
      }
    }

    // While typing in the filter box, letters type: only plain arrows, Enter and Escape are taken over.
    // Modified keys keep their text-editing meaning, and an IME composition is never interrupted.
    const handleFilterInputKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey) {
        consume(e)
        moveHighlight(e.key === 'ArrowDown' ? 1 : -1)
      } else if (e.key === 'Enter') {
        consume(e)
        // Back to the shortcuts with the filter kept, so N/E/I/R/O act on the highlighted match
        if (visibleRepos.length > 0) focusDialogFrom(inputRef.current)
      } else if (e.key === 'Escape') {
        consume(e)
        if (effectiveQuery) clearQuery(true)
        else onCancel()
      }
    }

    const handleRepoKey = (e: KeyboardEvent, key: string) => {
      const repo = visibleRepos[focusedRepoIndex] as ManagedRepo | undefined
      if (!repo) return
      const repoKeys = new Map<string, () => void>([
        ['n', () => onNewBranch(repo)], ['e', () => onExistingBranch(repo)], ['o', () => onOpenMain(repo)],
        ...(ghAvailable ? [['i', () => onIssues(repo)] as const, ['r', () => onReviewPrs(repo)] as const] : []),
      ])
      const repoAction = repoKeys.get(key)
      if (repoAction) { consume(e); repoAction() }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (inputRef.current && e.target === inputRef.current) { handleFilterInputKey(e); return }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const key = e.key.toLowerCase()
      // Escape clears an active filter first, back to the state the dialog opens in (the × or Clear filter
      // button that had the focus disappears with the filter); with no filter, it closes the dialog
      if (key === 'escape') {
        consume(e)
        if (!effectiveQuery) { onCancel(); return }
        clearQuery(false)
        focusDialogFrom(inputRef.current)
        return
      }
      // Shift is allowed: some keyboard layouts need it to type "/"
      if (e.key === '/' && showFilter) { consume(e); inputRef.current?.focus(); return }
      if (e.key === 'ArrowDown' && visibleRepos.length > 0) { consume(e); moveHighlight(1); return }
      if (e.key === 'ArrowUp' && visibleRepos.length > 0) { consume(e); moveHighlight(-1); return }

      const globalAction = globalKeys.get(key)
      if (globalAction) { consume(e); globalAction(); return }

      handleRepoKey(e, key)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [visibleRepos, effectiveQuery, showFilter, inputRef, clearQuery, focusedRepoIndex, ghAvailable, onClone, onAddExistingRepo, onOpenFolder, onNewBranch, onExistingBranch, onIssues, onReviewPrs, onOpenMain, onCancel])

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 shrink-0">
        <h2 className="text-lg font-medium text-text-primary">New Session</h2>
        {showFilter && (
          <>
            <RepoFilterInput inputRef={inputRef} query={query} onChange={changeQuery} onClear={() => clearQuery(true)} />
            <div role="status" aria-live="polite" className="sr-only">
              {filterStatus(effectiveQuery, visibleRepos, visibleRepos[focusedRepoIndex])}
            </div>
          </>
        )}
      </div>
      {/* Only the body scrolls: the title and Cancel stay put however many repos there are. While a filter
          is active the body keeps its unfiltered height (it can still shrink with the window) so the
          centred dialog doesn't shrink and move the filter box with every keystroke. */}
      <div
        ref={bodyRef}
        data-home-body
        className="p-4 space-y-4 min-h-0 overflow-y-auto"
        style={bodyLock ? { height: bodyLock.height, scrollbarGutter: bodyLock.scrollable ? 'stable' : undefined } : undefined}
      >
        <div className="flex gap-2">
          <button onClick={onClone} className="flex-1 flex items-center justify-center gap-1.5 p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-sm font-medium text-text-primary">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            <span><u>C</u>lone</span>
          </button>
          <button onClick={onAddExistingRepo} className="flex-1 flex items-center justify-center gap-1.5 p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-sm font-medium text-text-primary">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            <span><u>A</u>dd Repo</span>
          </button>
          <button onClick={onOpenFolder} className="flex-1 flex items-center justify-center gap-1.5 p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-sm font-medium text-text-primary">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            <span><u>F</u>older</span>
          </button>
        </div>
        {repos.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Your Repositories</h3>
            {visibleRepos.length > 0 ? (
              <div ref={repoListRef} className="space-y-1">
                {visibleRepos.map((repo, index) => (
                  <RepoRow key={repo.id} repo={repo} isFocused={index === focusedRepoIndex} ghAvailable={ghAvailable} onFocus={() => setFocusedRepoIndex(index)} onNewBranch={onNewBranch} onExistingBranch={onExistingBranch} onIssues={onIssues} onReviewPrs={onReviewPrs} onOpenMain={onOpenMain} onRepoSettings={onRepoSettings} />
                ))}
              </div>
            ) : (
              <div className="text-center text-text-secondary text-sm py-4">
                No repositories match &ldquo;{effectiveQuery}&rdquo;.{' '}
                <button onClick={() => clearQuery(true)} className="text-accent hover:underline">Clear filter</button>
              </div>
            )}
          </div>
        )}
        {ghAvailable === false && repos.length > 0 && (
          <div className="text-xs text-text-secondary bg-bg-tertiary rounded px-3 py-2 border border-border">
            <span className="font-medium text-warning-fg">GitHub CLI (gh) not found.</span>{' '}
            Issues and PR review features are hidden. Install it to enable them:{' '}
            <button onClick={() => window.shell.openExternal('https://cli.github.com')} className="text-accent hover:underline">cli.github.com</button>
          </div>
        )}
        {repos.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-4">
            No managed repositories yet.<br />Clone a repository or open an existing folder.
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-border flex justify-end shrink-0">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
      </div>
    </>
  )
}
