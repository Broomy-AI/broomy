/**
 * Full-text search panel with debounced queries and collapsible file-grouped results.
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import type { SearchResult } from '../../../../../preload/index'
import type { SearchTreeNode } from '../../types'
import type { NavigationTarget } from '../../../../shared/utils/fileNavigation'
import { DialogErrorBanner } from '../../../../shared/components/ErrorBanner'
import { useSessionStore } from '../../../../store/sessions'

interface SearchPanelProps {
  directory?: string
  onFileSelect?: (target: NavigationTarget) => void
  sessionId?: string
}

function SearchHistoryList({ history, sessionId, onSelect, onRemove }: {
  history: string[]
  sessionId?: string
  onSelect: (query: string) => void
  onRemove: (query: string) => void
}) {
  return (
    <div className="px-3 py-2">
      <div className="text-xs text-text-secondary mb-2">Recent searches</div>
      {history.map((query) => (
        <div
          key={query}
          className="group flex items-center gap-1 py-1 px-1 -mx-1 rounded hover:bg-bg-tertiary cursor-pointer"
        >
          <svg className="w-3 h-3 text-text-secondary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span
            className="text-xs text-text-primary truncate flex-1"
            onClick={() => onSelect(query)}
          >
            {query}
          </span>
          {sessionId && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemove(query)
              }}
              className="text-text-secondary hover:text-text-primary opacity-0 group-hover:opacity-100 p-0.5 shrink-0"
              title="Remove from history"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function SearchTreeResults({ node, depth, collapsedGroups, onToggleGroup, onFileSelect, searchQuery }: {
  key?: string | number | bigint | null
  node: SearchTreeNode
  depth: number
  collapsedGroups: Set<string>
  onToggleGroup: (folder: string) => void
  onFileSelect?: (target: NavigationTarget) => void
  searchQuery: string
}) {
  const isCollapsed = collapsedGroups.has(node.path)
  const isRoot = node.path === ''

  return (
    <div key={node.path || 'search-root'}>
      {!isRoot && (
        <div
          className="py-1 text-xs text-text-secondary cursor-pointer hover:bg-bg-tertiary flex items-center gap-1"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onToggleGroup(node.path)}
        >
          <span className="w-3 text-center">{isCollapsed ? '▶' : '▼'}</span>
          <span className="truncate">{node.name}</span>
        </div>
      )}
      {(isRoot || !isCollapsed) && (
        <>
          {node.children.map(child => (
            <SearchTreeResults key={child.path} node={child} depth={isRoot ? depth : depth + 1} collapsedGroups={collapsedGroups} onToggleGroup={onToggleGroup} onFileSelect={onFileSelect} searchQuery={searchQuery} />
          ))}
          {node.results.map((result) => (
            <div key={result.path}>
              <div
                className="py-1 hover:bg-bg-tertiary cursor-pointer flex items-center gap-2"
                style={{ paddingLeft: `${(isRoot ? depth : depth + 1) * 16 + 8}px` }}
                onClick={() => onFileSelect?.({ filePath: result.path, openInDiffMode: false })}
              >
                <span className="w-3" />
                <span className="text-xs truncate text-text-primary">{result.name}</span>
                <span className="text-xs text-text-secondary opacity-60 ml-auto shrink-0 pr-2">
                  {result.matchType === 'filename' ? 'name' : 'content'}
                </span>
              </div>
              {result.contentMatches.map((match, i) => (
                <div
                  key={`${result.path}-${match.line}-${i}`}
                  className="py-0.5 hover:bg-bg-tertiary cursor-pointer text-xs text-text-secondary truncate"
                  style={{ paddingLeft: `${(isRoot ? depth : depth + 1) * 16 + 28}px` }}
                  onClick={() => onFileSelect?.({ filePath: result.path, openInDiffMode: false, scrollToLine: match.line, searchHighlight: searchQuery })}
                  title={`${match.line}: ${match.text}`}
                >
                  <span className="text-text-secondary opacity-60 mr-2">{match.line}:</span>
                  <span className="text-text-primary">{match.text}</span>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export function SearchPanel({ directory, onFileSelect, sessionId }: SearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [collapsedSearchGroups, setCollapsedSearchGroups] = useState<Set<string>>(new Set())
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const searchHistory = useSessionStore(s => {
    if (!sessionId) return []
    const session = s.sessions.find(sess => sess.id === sessionId)
    return session?.searchHistory ?? []
  })
  const addSearchHistory = useSessionStore(s => s.addSearchHistory)
  const removeSearchHistoryItem = useSessionStore(s => s.removeSearchHistoryItem)

  const searchTree = useMemo((): SearchTreeNode => {
    const root: SearchTreeNode = { name: '', path: '', children: [], results: [] }
    for (const result of searchResults) {
      const parts = result.relativePath.split('/')
      let current = root
      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i]
        let child = current.children.find(c => c.name === folderName)
        if (!child) {
          child = { name: folderName, path: parts.slice(0, i + 1).join('/'), children: [], results: [] }
          current.children.push(child)
        }
        current = child
      }
      current.results.push(result)
    }
    return root
  }, [searchResults])

  useEffect(() => {
    if (!directory) return
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (searchQuery.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    setSearchError(null)
    searchTimeoutRef.current = setTimeout(() => {
      void (async () => {
        try {
          const results = await window.fs.search(directory, searchQuery)
          setSearchResults(results)
        } catch {
          setSearchResults([])
          setSearchError('Search failed')
        }
        setIsSearching(false)
      })()
    }, 300)
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  }, [searchQuery, directory])

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setIsSearching(false)
    setSearchError(null)
    inputRef.current?.focus()
  }

  const toggleGroup = (folder: string) => {
    setCollapsedSearchGroups(prev => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }

  const showHistory = searchQuery.length === 0 && searchHistory.length > 0

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            data-explorer-search
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onBlur={() => { if (sessionId && searchQuery.length >= 2) addSearchHistory(sessionId, searchQuery) }}
            placeholder="Search files..."
            className="w-full bg-bg-tertiary border border-border rounded px-2 py-1 pr-6 text-xs text-text-primary outline-none focus:border-accent"
          />
          {searchQuery.length > 0 && (
            <button
              onClick={clearSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary p-0.5"
              title="Clear search"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto text-sm">
        {showHistory && (
          <SearchHistoryList
            history={searchHistory}
            sessionId={sessionId}
            onSelect={(query) => { setSearchQuery(query); inputRef.current?.focus() }}
            onRemove={(query) => { if (sessionId) removeSearchHistoryItem(sessionId, query) }}
          />
        )}
        {isSearching && (
          <div className="px-3 py-4 text-xs text-text-secondary text-center">Searching...</div>
        )}
        {!isSearching && searchError && (
          <div className="px-3 py-2"><DialogErrorBanner error={searchError} onDismiss={() => setSearchError(null)} /></div>
        )}
        {!isSearching && !searchError && searchQuery.length >= 2 && searchResults.length === 0 && (
          <div className="px-3 py-4 text-xs text-text-secondary text-center">No results found</div>
        )}
        {!isSearching && searchQuery.length < 2 && searchQuery.length > 0 && (
          <div className="px-3 py-4 text-xs text-text-secondary text-center">Type at least 2 characters</div>
        )}
        {!isSearching && searchResults.length > 0 && (
          <SearchTreeResults node={searchTree} depth={0} collapsedGroups={collapsedSearchGroups} onToggleGroup={toggleGroup} onFileSelect={onFileSelect} searchQuery={searchQuery} />
        )}
      </div>
    </div>
  )
}
