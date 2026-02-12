import React, { useEffect, useRef } from 'react'
import type { GitFileStatus } from '../../../preload/index'
import type { TreeNode } from './types'
import type { NavigationTarget } from '../../utils/fileNavigation'
import { StatusBadge } from './icons'
import { statusLabel, getStatusColor } from '../../utils/explorerHelpers'
import { useFileTree } from '../../hooks/useFileTree'

interface FileTreeProps {
  directory?: string
  onFileSelect?: (target: NavigationTarget) => void
  selectedFilePath?: string | null
  gitStatus?: GitFileStatus[]
}

export function FileTree({
  directory,
  onFileSelect,
  selectedFilePath,
  gitStatus = [],
}: FileTreeProps) {
  const {
    tree,
    setTree,
    expandedPaths,
    isLoading,
    setIsLoading,
    inlineInput,
    setInlineInput,
    inlineInputValue,
    setInlineInputValue,
    loadDirectory,
    refreshTree,
    toggleExpand,
    handleFileClick,
    getFileStatus,
    handleContextMenu,
    handleFileContextMenu,
    submitInlineInput,
    navigateTreeItem,
  } = useFileTree({ directory, onFileSelect, gitStatus })

  const inlineInputRef = useRef<HTMLInputElement>(null)

  // Load root directory
  useEffect(() => {
    if (!directory) {
      setTree([])
      return
    }

    setIsLoading(true)
    void loadDirectory(directory).then((entries) => {
      setTree(entries)
      setIsLoading(false)
    })
  }, [directory, loadDirectory])

  // Watch for file system changes
  useEffect(() => {
    if (!directory) return
    const watcherId = `explorer-${directory}`
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null
    void window.fs.watch(watcherId, directory)
    const removeListener = window.fs.onChange(watcherId, () => {
      if (refreshTimeout) clearTimeout(refreshTimeout)
      refreshTimeout = setTimeout(() => { void refreshTree() }, 500)
    })
    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout)
      removeListener()
      void window.fs.unwatch(watcherId)
    }
  }, [directory, refreshTree])

  // Focus inline input when it appears
  useEffect(() => {
    if (inlineInput && inlineInputRef.current) {
      inlineInputRef.current.focus()
    }
  }, [inlineInput])

  // Render inline input at a given depth
  const renderInlineInput = (parentPath: string, depth: number) => {
    if (inlineInput?.parentPath !== parentPath) return null

    return (
      <div className="flex items-center gap-1 py-0.5 px-2" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
        <span className="text-text-secondary text-xs">
          {inlineInput.type === 'folder' ? '+ Folder:' : '+ File:'}
        </span>
        <input
          ref={inlineInputRef}
          type="text"
          value={inlineInputValue}
          onChange={(e) => setInlineInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void submitInlineInput()
            } else if (e.key === 'Escape') {
              setInlineInput(null)
            }
          }}
          onBlur={() => void submitInlineInput()}
          className="flex-1 bg-bg-tertiary border border-border rounded px-1 py-0.5 text-xs text-text-primary outline-none focus:border-accent min-w-0"
          placeholder={inlineInput.type === 'folder' ? 'folder name' : 'filename'}
        />
      </div>
    )
  }

  // Render a tree node
  const renderNode = (node: TreeNode, depth = 0): React.JSX.Element => {
    const nodeIsExpanded = expandedPaths.has(node.path)
    const status = getFileStatus(node.path)
    const statusColor = getStatusColor(status?.status)
    const isSelected = !node.isDirectory && node.path === selectedFilePath

    return (
      <div key={node.path}>
        <div
          data-tree-item
          tabIndex={0}
          onClick={() => handleFileClick(node)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleFileClick(node)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              navigateTreeItem(e.currentTarget as HTMLElement, 'down')
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              navigateTreeItem(e.currentTarget as HTMLElement, 'up')
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              if (node.isDirectory) {
                if (!nodeIsExpanded) {
                  void toggleExpand(node)
                } else {
                  navigateTreeItem(e.currentTarget as HTMLElement, 'down')
                }
              }
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault()
              if (node.isDirectory && nodeIsExpanded) {
                void toggleExpand(node)
              } else {
                // Move to parent — find the closest ancestor tree item
                const container = (e.currentTarget as HTMLElement).closest('[data-panel-id]')
                if (container) {
                  const items = Array.from(container.querySelectorAll<HTMLElement>('[data-tree-item]'))
                  const idx = items.indexOf(e.currentTarget as HTMLElement)
                  // Walk backwards to find parent (item with less indentation)
                  for (let i = idx - 1; i >= 0; i--) {
                    const itemDepth = parseInt(items[i].style.paddingLeft || '0')
                    const currentDepth = parseInt((e.currentTarget as HTMLElement).style.paddingLeft || '0')
                    if (itemDepth < currentDepth) {
                      items[i].focus()
                      break
                    }
                  }
                }
              }
            } else if (e.key === 'Home') {
              e.preventDefault()
              const container = (e.currentTarget as HTMLElement).closest('[data-panel-id]')
              const first = container?.querySelector<HTMLElement>('[data-tree-item]')
              if (first) first.focus()
            } else if (e.key === 'End') {
              e.preventDefault()
              const container = (e.currentTarget as HTMLElement).closest('[data-panel-id]')
              const items = container?.querySelectorAll('[data-tree-item]')
              if (items && items.length > 0) (items[items.length - 1] as HTMLElement).focus()
            }
          }}
          onContextMenu={node.isDirectory ? (e) => handleContextMenu(e, node.path) : (e) => handleFileContextMenu(e, node.path, node.name)}
          className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer outline-none focus:bg-accent/15 ${statusColor} ${
            isSelected ? 'bg-accent/20 ring-1 ring-accent/50' : 'hover:bg-bg-tertiary'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          title={status ? `${node.name} — ${statusLabel(status.status)}` : node.name}
        >
          {node.isDirectory ? (
            <span className="text-text-secondary w-4 text-center">
              {nodeIsExpanded ? '▼' : '▶'}
            </span>
          ) : (
            <span className="w-4" />
          )}
          <span className="truncate">{node.name}</span>
          {status && (
            <span className="ml-auto">
              <StatusBadge status={status.status} />
            </span>
          )}
        </div>
        {node.isDirectory && nodeIsExpanded && (
          <div>
            {renderInlineInput(node.path, depth + 1)}
            {node.children?.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (isLoading && directory) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Loading...
      </div>
    )
  }

  if (!directory) {
    return null
  }

  return (
    <>
      <div className="text-text-secondary mb-2 px-2 truncate text-xs cursor-context-menu" onContextMenu={(e) => handleContextMenu(e, directory)}>{directory}</div>
      {renderInlineInput(directory, 0)}
      {tree.length === 0 ? (
        <div className="text-center text-text-secondary text-sm py-4">Empty directory</div>
      ) : (
        tree.map((node) => renderNode(node))
      )}
    </>
  )
}
