import { useState, useCallback } from 'react'
import type { GitFileStatus } from '../../preload/index'
import type { TreeNode } from '../components/explorer/types'

interface UseFileTreeParams {
  directory?: string
  onFileSelect?: (target: { filePath: string; openInDiffMode: boolean }) => void
  gitStatus?: GitFileStatus[]
}

export interface UseFileTreeResult {
  tree: TreeNode[]
  setTree: React.Dispatch<React.SetStateAction<TreeNode[]>>
  expandedPaths: Set<string>
  setExpandedPaths: React.Dispatch<React.SetStateAction<Set<string>>>
  isLoading: boolean
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  inlineInput: { parentPath: string; type: 'file' | 'folder' } | null
  setInlineInput: React.Dispatch<React.SetStateAction<{ parentPath: string; type: 'file' | 'folder' } | null>>
  inlineInputValue: string
  setInlineInputValue: React.Dispatch<React.SetStateAction<string>>
  renameInput: { filePath: string; originalName: string } | null
  renameInputValue: string
  setRenameInputValue: React.Dispatch<React.SetStateAction<string>>
  draggedPath: string | null
  dropTargetPath: string | null
  loadDirectory: (dirPath: string) => Promise<TreeNode[]>
  refreshTree: () => Promise<void>
  toggleExpand: (node: TreeNode) => Promise<void>
  handleFileClick: (node: TreeNode) => void
  getFileStatus: (filePath: string) => GitFileStatus | undefined
  handleContextMenu: (e: React.MouseEvent, parentPath: string) => Promise<void>
  handleFileContextMenu: (e: React.MouseEvent, filePath: string, fileName: string) => Promise<void>
  submitInlineInput: () => Promise<void>
  submitRename: () => Promise<void>
  cancelRename: () => void
  startDrag: (path: string) => void
  setDropTarget: (path: string | null) => void
  handleDrop: (targetDirPath: string) => Promise<void>
  endDrag: () => void
}

// Pure helpers extracted to keep useFileTree under max-lines-per-function

export function updateTreeNode(
  nodes: TreeNode[],
  path: string,
  updates: Partial<TreeNode>
): TreeNode[] {
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

export function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.children) {
      const found = findNode(node.children, path)
      if (found) return found
    }
  }
  return null
}

export function navigateTreeItem(current: HTMLElement, direction: 'up' | 'down'): void {
  const container = current.closest('[data-panel-id]')
  if (!container) return
  const items = Array.from(container.querySelectorAll('[data-tree-item]'))
  const idx = items.indexOf(current)
  const target = (direction === 'down' ? items[idx + 1] : items[idx - 1]) as Element | undefined
  if (target) (target as HTMLElement).focus()
}

export function useFileTree({ directory, onFileSelect, gitStatus = [] }: UseFileTreeParams): UseFileTreeResult {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)

  // Context menu state for inline creation
  const [inlineInput, setInlineInput] = useState<{ parentPath: string; type: 'file' | 'folder' } | null>(null)
  const [inlineInputValue, setInlineInputValue] = useState('')

  // Rename state
  const [renameInput, setRenameInput] = useState<{ filePath: string; originalName: string } | null>(null)
  const [renameInputValue, setRenameInputValue] = useState('')

  // Drag-and-drop state
  const [draggedPath, setDraggedPath] = useState<string | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)

  // Load directory contents
  const loadDirectory = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    try {
      const entries = await window.fs.readDir(dirPath)
      return entries.map((entry: { name: string; isDirectory: boolean; path: string }) => ({
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
      void toggleExpand(node)
    } else if (onFileSelect) {
      onFileSelect({ filePath: node.path, openInDiffMode: false })
    }
  }

  // Get git status for a file
  const getFileStatus = (filePath: string): GitFileStatus | undefined => {
    const relativePath = directory ? filePath.replace(`${directory  }/`, '') : filePath
    return gitStatus.find((s) => s.path === relativePath)
  }

  // Context menu handler for directories
  const handleContextMenu = async (e: React.MouseEvent, parentPath: string) => {
    e.preventDefault()
    e.stopPropagation()

    const isRoot = parentPath === directory
    const dirName = parentPath.split('/').pop() || parentPath
    const menuItems = [
      { id: 'new-file', label: 'New File' },
      { id: 'new-folder', label: 'New Folder' },
      ...(!isRoot ? [{ id: 'rename', label: `Rename "${dirName}"` }] : []),
    ]

    const result = await window.menu.popup(menuItems)

    if (result === 'rename') {
      setRenameInput({ filePath: parentPath, originalName: dirName })
      setRenameInputValue(dirName)
    } else if (result === 'new-file' || result === 'new-folder') {
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
      { id: 'rename', label: `Rename "${fileName}"` },
      { id: 'delete', label: `Delete "${fileName}"` },
    ])

    if (result === 'rename') {
      setRenameInput({ filePath, originalName: fileName })
      setRenameInputValue(fileName)
    } else if (result === 'delete') {
      if (window.confirm(`Delete "${fileName}"? This cannot be undone.`)) {
        await window.fs.rm(filePath)
      }
    }
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

  // Submit rename
  const submitRename = async () => {
    if (!renameInput || !renameInputValue.trim()) {
      setRenameInput(null)
      return
    }

    const newName = renameInputValue.trim()
    if (newName === renameInput.originalName) {
      setRenameInput(null)
      return
    }

    const parentDir = renameInput.filePath.substring(0, renameInput.filePath.lastIndexOf('/'))
    const newPath = `${parentDir}/${newName}`
    await window.fs.rename(renameInput.filePath, newPath)
    setRenameInput(null)
    setRenameInputValue('')
  }

  // Cancel rename
  const cancelRename = () => {
    setRenameInput(null)
    setRenameInputValue('')
  }

  // Drag-and-drop handlers
  const startDrag = (path: string) => {
    setDraggedPath(path)
  }

  const handleDrop = async (targetDirPath: string) => {
    if (!draggedPath || draggedPath === targetDirPath) {
      setDraggedPath(null)
      setDropTargetPath(null)
      return
    }

    // Don't allow dropping into own subdirectory
    if (targetDirPath.startsWith(`${draggedPath}/`)) {
      setDraggedPath(null)
      setDropTargetPath(null)
      return
    }

    const fileName = draggedPath.split('/').pop()!
    const newPath = `${targetDirPath}/${fileName}`
    await window.fs.rename(draggedPath, newPath)
    setDraggedPath(null)
    setDropTargetPath(null)
  }

  const endDrag = () => {
    setDraggedPath(null)
    setDropTargetPath(null)
  }

  return {
    tree,
    setTree,
    expandedPaths,
    setExpandedPaths,
    isLoading,
    setIsLoading,
    inlineInput,
    setInlineInput,
    inlineInputValue,
    setInlineInputValue,
    renameInput,
    renameInputValue,
    setRenameInputValue,
    draggedPath,
    dropTargetPath,
    loadDirectory,
    refreshTree,
    toggleExpand,
    handleFileClick,
    getFileStatus,
    handleContextMenu,
    handleFileContextMenu,
    submitInlineInput,
    submitRename,
    cancelRename,
    startDrag,
    setDropTarget: setDropTargetPath,
    handleDrop,
    endDrag,
  }
}
