import { useState, useEffect, useCallback, useRef } from 'react'
import type { GitFileStatus } from '../../../preload/index'
import type { TreeNode } from './types'
import { StatusBadge } from './icons'
import { statusLabel, getStatusColor } from '../../utils/explorerHelpers'

interface FileTreeProps {
  directory?: string
  onFileSelect?: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, searchHighlight?: string, diffBaseRef?: string, diffCurrentRef?: string, diffLabel?: string) => void
  selectedFilePath?: string | null
  gitStatus?: GitFileStatus[]
}

export function FileTree({
  directory,
  onFileSelect,
  selectedFilePath,
  gitStatus = [],
}: FileTreeProps) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)

  // Context menu state for inline creation
  const [inlineInput, setInlineInput] = useState<{ parentPath: string; type: 'file' | 'folder' } | null>(null)
  const [inlineInputValue, setInlineInputValue] = useState('')
  const inlineInputRef = useRef<HTMLInputElement>(null)

  // Load directory contents
  const loadDirectory = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    try {
      const entries = await window.fs.readDir(dirPath)
      return entries.map((entry) => ({
        ...entry,
        isExpanded: false,
      }))
    } catch {
      return []
    }
  }, [])

  // Refresh the explorer tree while preserving expanded directories
  const refreshTree = useCallback(async () => {
    if (!directory) return

    const newEntries = await loadDirectory(directory)

    const reloadChildren = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
      const result: TreeNode[] = []
      for (const node of nodes) {
        if (node.isDirectory && expandedPaths.has(node.path)) {
          const children = await loadDirectory(node.path)
          const loadedChildren = await reloadChildren(children)
          result.push({ ...node, children: loadedChildren })
        } else {
          result.push(node)
        }
      }
      return result
    }

    const refreshedTree = await reloadChildren(newEntries)
    setTree(refreshedTree)
  }, [directory, loadDirectory, expandedPaths])

  // Update a node in the tree
  const updateTreeNode = (
    nodes: TreeNode[],
    path: string,
    updates: Partial<TreeNode>
  ): TreeNode[] => {
    return nodes.map((node) => {
      if (node.path === path) {
        return { ...node, ...updates }
      }
      if (node.children) {
        return { ...node, children: updateTreeNode(node.children, path, updates) }
      }
      return node
    })
  }

  // Toggle directory expansion
  const toggleExpand = async (node: TreeNode) => {
    if (!node.isDirectory) return

    const newExpanded = new Set(expandedPaths)
    if (expandedPaths.has(node.path)) {
      newExpanded.delete(node.path)
    } else {
      newExpanded.add(node.path)
      if (!node.children) {
        const children = await loadDirectory(node.path)
        setTree((prevTree) => updateTreeNode(prevTree, node.path, { children }))
      }
    }
    setExpandedPaths(newExpanded)
  }

  // Handle file click
  const handleFileClick = (node: TreeNode) => {
    if (node.isDirectory) {
      toggleExpand(node)
    } else if (onFileSelect) {
      onFileSelect(node.path, false)
    }
  }

  // Get git status for a file
  const getFileStatus = (filePath: string): GitFileStatus | undefined => {
    const relativePath = directory ? filePath.replace(directory + '/', '') : filePath
    return gitStatus.find((s) => s.path === relativePath)
  }

  // Context menu handler for directories
  const handleContextMenu = async (e: React.MouseEvent, parentPath: string) => {
    e.preventDefault()
    e.stopPropagation()

    const result = await window.menu.popup([
      { id: 'new-file', label: 'New File' },
      { id: 'new-folder', label: 'New Folder' },
    ])

    if (result === 'new-file' || result === 'new-folder') {
      // Make sure the parent directory is expanded
      if (parentPath !== directory) {
        const newExpanded = new Set(expandedPaths)
        newExpanded.add(parentPath)
        setExpandedPaths(newExpanded)

        // Load children if needed
        const node = findNode(tree, parentPath)
        if (node && !node.children) {
          const children = await loadDirectory(parentPath)
          setTree((prevTree) => updateTreeNode(prevTree, parentPath, { children }))
        }
      }

      setInlineInput({ parentPath, type: result === 'new-file' ? 'file' : 'folder' })
      setInlineInputValue('')
    }
  }

  // Context menu handler for files
  const handleFileContextMenu = async (e: React.MouseEvent, filePath: string, fileName: string) => {
    e.preventDefault()
    e.stopPropagation()

    const result = await window.menu.popup([
      { id: 'delete', label: `Delete "${fileName}"` },
    ])

    if (result === 'delete') {
      if (window.confirm(`Delete "${fileName}"? This cannot be undone.`)) {
        await window.fs.rm(filePath)
      }
    }
  }

  // Find a node in the tree
  const findNode = (nodes: TreeNode[], path: string): TreeNode | null => {
    for (const node of nodes) {
      if (node.path === path) return node
      if (node.children) {
        const found = findNode(node.children, path)
        if (found) return found
      }
    }
    return null
  }

  // Submit inline input
  const submitInlineInput = async () => {
    if (!inlineInput || !inlineInputValue.trim() || !directory) {
      setInlineInput(null)
      return
    }

    const fullPath = `${inlineInput.parentPath}/${inlineInputValue.trim()}`

    if (inlineInput.type === 'folder') {
      await window.fs.mkdir(fullPath)
    } else {
      await window.fs.createFile(fullPath)
    }

    setInlineInput(null)
    setInlineInputValue('')
    // File watcher will handle refresh
  }

  // Render inline input at a given depth
  const renderInlineInput = (parentPath: string, depth: number) => {
    if (!inlineInput || inlineInput.parentPath !== parentPath) return null

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
              submitInlineInput()
            } else if (e.key === 'Escape') {
              setInlineInput(null)
            }
          }}
          onBlur={() => submitInlineInput()}
          className="flex-1 bg-bg-tertiary border border-border rounded px-1 py-0.5 text-xs text-text-primary outline-none focus:border-accent min-w-0"
          placeholder={inlineInput.type === 'folder' ? 'folder name' : 'filename'}
        />
      </div>
    )
  }

  // Tree keyboard navigation helper
  const navigateTreeItem = (current: HTMLElement, direction: 'up' | 'down') => {
    const container = current.closest('[data-panel-id]')
    if (!container) return
    const items = Array.from(container.querySelectorAll('[data-tree-item]')) as HTMLElement[]
    const idx = items.indexOf(current)
    const target = direction === 'down' ? items[idx + 1] : items[idx - 1]
    if (target) target.focus()
  }

  // Render a tree node
  const renderNode = (node: TreeNode, depth = 0): JSX.Element => {
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
                  toggleExpand(node)
                } else {
                  navigateTreeItem(e.currentTarget as HTMLElement, 'down')
                }
              }
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault()
              if (node.isDirectory && nodeIsExpanded) {
                toggleExpand(node)
              } else {
                // Move to parent — find the closest ancestor tree item
                const container = (e.currentTarget as HTMLElement).closest('[data-panel-id]')
                if (container) {
                  const items = Array.from(container.querySelectorAll('[data-tree-item]')) as HTMLElement[]
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
              const first = container?.querySelector('[data-tree-item]') as HTMLElement
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
            {node.children && node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // Load root directory
  useEffect(() => {
    if (!directory) {
      setTree([])
      return
    }

    setIsLoading(true)
    loadDirectory(directory).then((entries) => {
      setTree(entries)
      setIsLoading(false)
    })
  }, [directory, loadDirectory])

  // Watch for file system changes
  useEffect(() => {
    if (!directory) return

    const watcherId = `explorer-${directory}`

    let refreshTimeout: ReturnType<typeof setTimeout> | null = null
    const debouncedRefresh = () => {
      if (refreshTimeout) clearTimeout(refreshTimeout)
      refreshTimeout = setTimeout(() => {
        refreshTree()
      }, 500)
    }

    window.fs.watch(watcherId, directory)
    const removeListener = window.fs.onChange(watcherId, () => {
      debouncedRefresh()
    })

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout)
      removeListener()
      window.fs.unwatch(watcherId)
    }
  }, [directory, refreshTree])

  // Focus inline input when it appears
  useEffect(() => {
    if (inlineInput && inlineInputRef.current) {
      inlineInputRef.current.focus()
    }
  }, [inlineInput])

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
