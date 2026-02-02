import { useState, useEffect, useCallback, useMemo } from 'react'
import type { FileEntry, GitFileStatus } from '../../preload/index'
import type { ExplorerFilter } from '../store/sessions'

interface ExplorerProps {
  directory?: string
  onFileSelect?: (filePath: string, openInDiffMode: boolean) => void
  selectedFilePath?: string | null
  gitStatus?: GitFileStatus[] // Git status passed from parent (refreshes on save)
  filter: ExplorerFilter
  onFilterChange: (filter: ExplorerFilter) => void
}

interface TreeNode extends FileEntry {
  children?: TreeNode[]
  isExpanded?: boolean
}

export default function Explorer({ directory, onFileSelect, selectedFilePath, gitStatus = [], filter, onFilterChange }: ExplorerProps) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [allModeExpandedPaths, setAllModeExpandedPaths] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)

  // Build a set of paths that have changes (for quick lookup)
  const changedPaths = useMemo(() => {
    const paths = new Set<string>()
    for (const status of gitStatus) {
      // Add the file path
      paths.add(status.path)
      // Add all parent directories
      const parts = status.path.split('/')
      for (let i = 1; i < parts.length; i++) {
        paths.add(parts.slice(0, i).join('/'))
      }
    }
    return paths
  }, [gitStatus])

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

  // Auto-expand directories with changes in "changed" mode
  useEffect(() => {
    if (filter !== 'changed' || !directory || gitStatus.length === 0) return

    const expandChangedDirs = async () => {
      // Get all directory paths that contain changes
      const dirsToExpand = new Set<string>()
      for (const status of gitStatus) {
        const parts = status.path.split('/')
        let currentPath = directory
        for (let i = 0; i < parts.length - 1; i++) {
          currentPath = `${currentPath}/${parts[i]}`
          dirsToExpand.add(currentPath)
        }
      }

      // Load children for all directories that need expansion
      const loadChildrenRecursive = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
        const result: TreeNode[] = []
        for (const node of nodes) {
          if (node.isDirectory && dirsToExpand.has(node.path)) {
            const children = node.children || await loadDirectory(node.path)
            const loadedChildren = await loadChildrenRecursive(children)
            result.push({ ...node, children: loadedChildren })
          } else {
            result.push(node)
          }
        }
        return result
      }

      if (tree.length > 0) {
        const expandedTree = await loadChildrenRecursive(tree)
        setTree(expandedTree)
      }
    }

    expandChangedDirs()
  }, [filter, directory, gitStatus, tree.length > 0])

  // Check if a path should be expanded
  const isExpanded = useCallback((path: string): boolean => {
    if (filter === 'changed') {
      // In changed mode, expand if this directory contains changes
      const relativePath = directory ? path.replace(directory + '/', '') : path
      return changedPaths.has(relativePath)
    }
    // In all mode, use remembered expansion state
    return allModeExpandedPaths.has(path)
  }, [filter, directory, changedPaths, allModeExpandedPaths])

  // Toggle directory expansion (only affects "all" mode)
  const toggleExpand = async (node: TreeNode) => {
    if (!node.isDirectory) return

    if (filter === 'all') {
      const newExpanded = new Set(allModeExpandedPaths)
      if (allModeExpandedPaths.has(node.path)) {
        newExpanded.delete(node.path)
      } else {
        newExpanded.add(node.path)
        // Load children if not already loaded
        if (!node.children) {
          const children = await loadDirectory(node.path)
          setTree((prevTree) => updateTreeNode(prevTree, node.path, { children }))
        }
      }
      setAllModeExpandedPaths(newExpanded)
    } else {
      // In changed mode, just load children if needed
      if (!node.children) {
        const children = await loadDirectory(node.path)
        setTree((prevTree) => updateTreeNode(prevTree, node.path, { children }))
      }
    }
  }

  // Handle file click
  const handleFileClick = (node: TreeNode) => {
    if (node.isDirectory) {
      toggleExpand(node)
    } else if (onFileSelect) {
      // Open in diff mode if clicked from "changed" filter
      const openInDiffMode = filter === 'changed'
      onFileSelect(node.path, openInDiffMode)
    }
  }

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

  // Get git status for a file
  const getFileStatus = (filePath: string): GitFileStatus | undefined => {
    const relativePath = directory ? filePath.replace(directory + '/', '') : filePath
    return gitStatus.find((s) => s.path === relativePath)
  }

  // Get status color
  const getStatusColor = (status?: string): string => {
    switch (status) {
      case 'modified':
        return 'text-yellow-400'
      case 'added':
        return 'text-green-400'
      case 'deleted':
        return 'text-red-400'
      case 'untracked':
        return 'text-gray-400'
      default:
        return 'text-text-primary'
    }
  }

  // Check if a node or any of its children have changes
  const hasChanges = (node: TreeNode): boolean => {
    const relativePath = directory ? node.path.replace(directory + '/', '') : node.path
    if (changedPaths.has(relativePath)) return true
    if (node.children) {
      return node.children.some(hasChanges)
    }
    // For unexpanded directories, check if any git status paths start with this directory
    if (node.isDirectory && !node.children) {
      return gitStatus.some(s => s.path.startsWith(relativePath + '/'))
    }
    return false
  }


  // Render a tree node
  const renderNode = (node: TreeNode, depth: number = 0): JSX.Element => {
    const nodeIsExpanded = isExpanded(node.path)
    const status = getFileStatus(node.path)
    const statusColor = getStatusColor(status?.status)
    const isSelected = !node.isDirectory && node.path === selectedFilePath

    return (
      <div key={node.path}>
        <div
          onClick={() => handleFileClick(node)}
          className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer ${statusColor} ${
            isSelected ? 'bg-accent/20 ring-1 ring-accent/50' : 'hover:bg-bg-tertiary'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {node.isDirectory ? (
            <span className="text-text-secondary w-4 text-center">
              {nodeIsExpanded ? '▼' : '▶'}
            </span>
          ) : (
            <span className="w-4" />
          )}
          <span className={node.isDirectory ? 'text-text-secondary' : ''}>
            {node.isDirectory ? '📁' : '📄'}
          </span>
          <span className="truncate">{node.name}</span>
          {status && (
            <span className="text-xs opacity-60 ml-auto">
              {status.status.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        {node.isDirectory && nodeIsExpanded && node.children && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (!directory) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Select a session to view files
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Loading...
      </div>
    )
  }

  // Filter the tree based on the current filter
  const filterTree = (nodes: TreeNode[]): TreeNode[] => {
    if (filter === 'all') return nodes
    return nodes
      .filter(node => hasChanges(node))
      .map(node => {
        if (node.children) {
          return { ...node, children: filterTree(node.children) }
        }
        return node
      })
  }

  const filteredTree = filterTree(tree)

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">Explorer</span>
        {/* Filter selector */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onFilterChange('all')}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              filter === 'all'
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
          >
            All
          </button>
          <button
            onClick={() => onFilterChange('changed')}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              filter === 'changed'
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
          >
            Changed
            {gitStatus.length > 0 && (
              <span className="ml-1 opacity-70">({gitStatus.length})</span>
            )}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 text-sm">
        <div className="text-text-secondary mb-2 px-2 truncate text-xs">
          {directory}
        </div>
        {filteredTree.length === 0 ? (
          <div className="text-center text-text-secondary text-sm py-4">
            {filter === 'changed' ? 'No changes' : 'Empty directory'}
          </div>
        ) : (
          filteredTree.map((node) => renderNode(node))
        )}
      </div>
    </div>
  )
}
