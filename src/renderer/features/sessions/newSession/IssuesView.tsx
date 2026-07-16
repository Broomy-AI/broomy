/**
 * View for browsing GitHub issues and selecting one to start a new session from.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import type { ManagedRepo, GitHubIssue } from '../../../../preload/index'
import { DialogErrorBanner } from '../../../shared/components/ErrorBanner'
import { useListKeyboardNav } from './useListKeyboardNav'

export function IssuesView({
  repo,
  onBack,
  onSelectIssue,
}: {
  repo: ManagedRepo
  onBack: () => void
  onSelectIssue: (issue: GitHubIssue) => void
}) {
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GitHubIssue[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mainDir = `${repo.rootDir}/main`

  useEffect(() => {
    const fetchIssues = async () => {
      try {
        const result = await window.gh.issues(mainDir)
        setIssues(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    void fetchIssues()
  }, [repo, mainDir])

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!query.trim()) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)
    debounceRef.current = setTimeout(() => {
      window.gh.searchIssues(mainDir, query.trim()).then(
        (results) => {
          setSearchResults(results)
          setSearchLoading(false)
        },
        () => {
          setSearchResults([])
          setSearchLoading(false)
        },
      )
    }, 300)
  }, [mainDir])

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const isSearching = searchQuery.trim().length > 0
  const displayedIssues = isSearching ? searchResults : issues
  const isLoading = isSearching ? searchLoading : loading

  const { focusedIndex, setFocusedIndex, listRef } = useListKeyboardNav({
    items: displayedIssues,
    onSelect: onSelectIssue,
    dataAttribute: 'data-issue-row',
  })

  // Reset focus when switching between search and default list
  useEffect(() => {
    setFocusedIndex(0)
  }, [isSearching, setFocusedIndex])

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-medium text-text-primary">Issues</h2>
          <p className="text-xs text-text-secondary">{repo.name} &middot; {isSearching ? 'Search results' : 'Assigned to me'}</p>
        </div>
      </div>

      <div className="px-4 pt-3">
        <input
          type="text"
          placeholder="Search issues..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded border border-border bg-bg-primary text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent"
        />
      </div>

      <div className="p-4 max-h-80 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-text-secondary text-sm">
            <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-[var(--spinner-track-opacity)]" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-[var(--spinner-arc-opacity)]" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {isSearching ? 'Searching...' : 'Loading issues...'}
          </div>
        )}

        {error && !isSearching && (
          <DialogErrorBanner error={error} onDismiss={() => setError(null)} />
        )}

        {!isLoading && !error && displayedIssues.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-8">
            {isSearching ? 'No issues found.' : 'No open issues assigned to you.'}
          </div>
        )}

        {!isLoading && displayedIssues.length > 0 && (
          <div className="space-y-1" ref={listRef}>
            {displayedIssues.map((issue, index) => (
              <button
                key={issue.number}
                data-issue-row
                onClick={() => onSelectIssue(issue)}
                onMouseEnter={() => setFocusedIndex(index)}
                className={`w-full flex items-start gap-3 p-2 rounded border transition-colors text-left ${
                  index === focusedIndex ? 'bg-bg-tertiary border-accent ring-1 ring-accent/50' : 'border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent'
                }`}
              >
                <span className="text-accent font-mono text-xs mt-0.5 flex-shrink-0">#{issue.number}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary">{issue.title}</div>
                  {issue.labels.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {issue.labels.map((label) => (
                        <span key={label} className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border flex justify-end">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </>
  )
}
