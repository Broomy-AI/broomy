import React, { useState, useEffect, useMemo, useRef } from 'react'
import type { SearchResult } from '../../../preload/index'
import type { SearchTreeNode } from './types'
import type { NavigationTarget } from '../../utils/fileNavigation'

interface SearchPanelProps {
  directory?: string
  onFileSelect?: (target: NavigationTarget) => void
}

export function SearchPanel({ directory, onFileSelect }: SearchPanelProps) {
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [collapsedSearchGroups, setCollapsedSearchGroups] = useState<Set<string>>(new Set())
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Search results as a file tree
  const searchTree = useMemo((): SearchTreeNode => {
    const root: SearchTreeNode = { name: '', path: '', children: [], results: [] }

    for (const result of searchResults) {
      const parts = result.relativePath.split('/')
      let current = root

      // Navigate/create folder nodes for all parts except the last (filename)
      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i]
        let child = current.children.find(c => c.name === folderName)
        if (!child) {
          child = {
            name: folderName,
            path: parts.slice(0, i + 1).join('/'),
            children: [],
            results: [],
          }
          current.children.push(child)
        }
        current = child
      }

      current.results.push(result)
    }

    return root
  }, [searchResults])

  // Search debounce
  useEffect(() => {
    if (!directory) return

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (searchQuery.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(() => {
      void (async () => {
        try {
          const results = await window.fs.search(directory, searchQuery)
          setSearchResults(results)
        } catch {
          setSearchResults([])
        }
        setIsSearching(false)
      })()
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, directory])

  const toggleGroup = (folder: string) => {
    setCollapsedSearchGroups(prev => {
      const next = new Set(prev)
      if (next.has(folder)) {
        next.delete(folder)
      } else {
        next.add(folder)
      }
      return next
    })
  }

  const renderSearchTreeNode = (node: SearchTreeNode, depth: number): React.JSX.Element | null => {
    const isCollapsed = collapsedSearchGroups.has(node.path)
    const isRoot = node.path === ''

    return (
      <div key={node.path || 'search-root'}>
        {!isRoot && (
          <div
            className="py-1 text-xs text-text-secondary cursor-pointer hover:bg-bg-tertiary flex items-center gap-1"
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => toggleGroup(node.path)}
          >
            <span className="w-3 text-center">{isCollapsed ? '▶' : '▼'}</span>
            <span className="truncate">{node.name}</span>
          </div>
        )}
        {(isRoot || !isCollapsed) && (
          <>
            {node.children.map(child => renderSearchTreeNode(child, isRoot ? depth : depth + 1))}
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

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search files..."
          className="w-full bg-bg-tertiary border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
        />
      </div>
      <div className="flex-1 overflow-y-auto text-sm">
        {isSearching && (
          <div className="px-3 py-4 text-xs text-text-secondary text-center">Searching...</div>
        )}
        {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
          <div className="px-3 py-4 text-xs text-text-secondary text-center">No results found</div>
        )}
        {!isSearching && searchQuery.length < 2 && searchQuery.length > 0 && (
          <div className="px-3 py-4 text-xs text-text-secondary text-center">Type at least 2 characters</div>
        )}
        {!isSearching && searchResults.length > 0 && renderSearchTreeNode(searchTree, 0)}
      </div>
    </div>
  )
}
