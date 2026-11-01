/**
 * The New Session home view's repo filter box (shown in the dialog header) and the text its
 * screen-reader status region announces while a filter is active.
 */
import { useId } from 'react'
import type { ManagedRepo } from '../../../../preload/index'

export function RepoFilterInput({ inputRef, query, onChange, onClear }: {
  inputRef: React.RefObject<HTMLInputElement>
  query: string
  onChange: (value: string) => void
  onClear: () => void
}) {
  const hintId = useId()
  return (
    <div className="relative w-48 flex-shrink-0">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter repositories"
        aria-label="Filter repositories"
        aria-describedby={hintId}
        spellCheck={false}
        autoComplete="off"
        className="w-full h-7 pl-2.5 pr-7 text-sm rounded border border-border bg-bg-primary text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent"
      />
      {query ? (
        <button type="button" onClick={onClear} aria-label="Clear filter" title="Clear filter" className="absolute right-1.5 top-1/2 -translate-y-1/2 px-1 text-sm leading-none text-text-secondary hover:text-text-primary">
          &times;
        </button>
      ) : (
        <kbd aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 px-1.5 rounded border border-border font-mono text-3xs leading-4 text-text-secondary">/</kbd>
      )}
      <span id={hintId} className="sr-only">Type to filter. Up and Down move the highlight, Enter returns to the shortcuts, Escape clears.</span>
    </div>
  )
}

/** What the polite status region says: nothing without a filter, otherwise the matches and the highlighted one. */
export function filterStatus(effectiveQuery: string, visibleRepos: ManagedRepo[], highlighted: ManagedRepo | undefined) {
  if (!effectiveQuery) return ''
  if (visibleRepos.length === 0) return 'No repositories match'
  const count = visibleRepos.length === 1 ? '1 repository matches' : `${visibleRepos.length} repositories match`
  return highlighted ? `${count}, ${highlighted.name} highlighted` : count
}
