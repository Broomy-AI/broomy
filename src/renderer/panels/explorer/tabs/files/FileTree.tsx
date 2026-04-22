/**
 * Recursive file tree component with keyboard navigation and git status indicators.
 */
import React, { useEffect, useRef, useCallback, memo } from 'react'
import type { GitFileStatus } from '../../../../../preload/index'
import type { TreeNode } from '../../types'
import type { NavigationTarget } from '../../../../shared/utils/fileNavigation'
import { StatusBadge } from '../../icons'
import { statusLabel, getStatusColor } from '../../../../features/git/explorerHelpers'
import { useFileTree, navigateTreeItem } from '../../hooks/useFileTree'
import { useExplorerWatcher } from '../../hooks/useExplorerWatcher'
import { DialogErrorBanner } from '../../../../shared/components/ErrorBanner'

function handleTreeKeyDown(
  e: React.KeyboardEvent<HTMLDivElement>,
  node: TreeNode,
  nodeIsExpanded: boolean,
  handlers: {
    handleFileClick: (n: TreeNode) => void
    toggleExpand: (n: TreeNode) => Promise<void>
  }
) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    handlers.handleFileClick(node)
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
        void handlers.toggleExpand(node)
      } else {
        navigateTreeItem(e.currentTarget as HTMLElement, 'down')
      }
    }
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    if (node.isDirectory && nodeIsExpanded) {
      void handlers.toggleExpand(node)
    } else {
      const container = (e.currentTarget as HTMLElement).closest('[data-panel-id]')
      if (container) {
        const items = Array.from(container.querySelectorAll<HTMLElement>('[data-tree-item]'))
        const idx = items.indexOf(e.currentTarget as HTMLElement)
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
}

function InlineCreateInput({
  parentPath,
  inlineInput,
  inlineInputValue,
  setInlineInputValue,
  submitInlineInput,
  setInlineInput,
  inputRef,
  depth,
}: {
  parentPath: string
  inlineInput: { parentPath: string; type: 'file' | 'folder' }
  inlineInputValue: string
  setInlineInputValue: (v: string) => void
  submitInlineInput: () => Promise<void>
  setInlineInput: (v: null) => void
  inputRef: React.RefObject<HTMLInputElement>
  depth: number
}) {
  if (inlineInput.parentPath !== parentPath) return null

  return (
    <div className="flex items-center gap-1 py-0.5 px-2" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
      <span className="text-text-secondary text-xs">
        {inlineInput.type === 'folder' ? '+ Folder:' : '+ File:'}
      </span>
      <input
        ref={inputRef}
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

interface TreeNodeItemProps {
  key?: string | number | bigint | null
  node: TreeNode
  depth: number
  isExpanded: boolean
  isSelected: boolean
  isRenaming: boolean
  isDropTarget: boolean
  isDragged: boolean
  status: GitFileStatus | undefined
  renameInputValue: string
  renameInputRef: React.RefObject<HTMLInputElement>
  inlineInput: { parentPath: string; type: 'file' | 'folder' } | null
  inlineInputValue: string
  inlineInputRef: React.RefObject<HTMLInputElement>
  expandedPaths: Set<string>
  selectedFilePath: string | null | undefined
  renameFilePath: string | undefined
  draggedPath: string | null
  dropTargetPath: string | null
  getFileStatus: (path: string) => GitFileStatus | undefined
  onNodeClick: (node: TreeNode, isRenaming: boolean) => void
  onDragStart: (e: React.DragEvent, path: string) => void
  onDragOver: (e: React.DragEvent, node: TreeNode) => void
  onDragLeave: (path: string) => void
  onDrop: (e: React.DragEvent, node: TreeNode) => void
  onDragEnd: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, node: TreeNode, isExpanded: boolean) => void
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void
  setRenameInputValue: (v: string) => void
  submitRename: () => Promise<void>
  cancelRename: () => void
  setInlineInputValue: (v: string) => void
  submitInlineInput: () => Promise<void>
  setInlineInput: (v: null) => void
}

const TreeNodeItem = memo(function TreeNodeItem({
  node, depth, isExpanded, isSelected, isRenaming, isDropTarget, isDragged,
  status, renameInputValue, renameInputRef,
  inlineInput, inlineInputValue, inlineInputRef,
  expandedPaths, selectedFilePath, renameFilePath, draggedPath, dropTargetPath,
  getFileStatus,
  onNodeClick, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  onKeyDown, onContextMenu,
  setRenameInputValue, submitRename, cancelRename,
  setInlineInputValue, submitInlineInput, setInlineInput,
}: TreeNodeItemProps) {
  const statusColor = getStatusColor(status?.status)

  return (
    <div key={node.path}>
      <div
        data-tree-item
        tabIndex={0}
        draggable={!isRenaming}
        onClick={() => onNodeClick(node, isRenaming)}
        onDragStart={(e) => onDragStart(e, node.path)}
        onDragOver={(e) => onDragOver(e, node)}
        onDragLeave={() => onDragLeave(node.path)}
        onDrop={(e) => onDrop(e, node)}
        onDragEnd={onDragEnd}
        onKeyDown={(e) => {
          if (isRenaming) return
          onKeyDown(e, node, isExpanded)
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
        className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer outline-none focus:bg-accent/15 ${statusColor} ${
          isSelected ? 'bg-accent/20 ring-1 ring-accent/50' : 'hover:bg-bg-tertiary'
        } ${isDropTarget ? 'bg-accent/20 ring-1 ring-accent' : ''} ${isDragged ? 'opacity-50' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        title={status ? `${node.name} — ${statusLabel(status.status)}` : node.name}
      >
        {node.isDirectory ? (
          <span className="text-text-secondary w-4 text-center">
            {isExpanded ? '▼' : '▶'}
          </span>
        ) : (
          <span className="w-4" />
        )}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameInputValue}
            onChange={(e) => setRenameInputValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                void submitRename()
              } else if (e.key === 'Escape') {
                cancelRename()
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => void submitRename()}
            className="flex-1 bg-bg-tertiary border border-border rounded px-1 py-0.5 text-xs text-text-primary outline-none focus:border-accent min-w-0"
          />
        ) : (
          <span className="truncate">{node.name}</span>
        )}
        {status && !isRenaming && (
          <span className="ml-auto">
            <StatusBadge status={status.status} />
          </span>
        )}
      </div>
      {node.isDirectory && isExpanded && (
        <div>
          {inlineInput && <InlineCreateInput parentPath={node.path} inlineInput={inlineInput} inlineInputValue={inlineInputValue} setInlineInputValue={setInlineInputValue} submitInlineInput={submitInlineInput} setInlineInput={setInlineInput} inputRef={inlineInputRef} depth={depth + 1} />}
          {node.children?.map((child) => {
            const childIsExpanded = expandedPaths.has(child.path)
            const childStatus = getFileStatus(child.path)
            const childIsSelected = !child.isDirectory && child.path === selectedFilePath
            const childIsRenaming = renameFilePath === child.path
            const childIsDropTarget = dropTargetPath === child.path
            const childIsDragged = draggedPath === child.path
            return (
              <TreeNodeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                isExpanded={childIsExpanded}
                isSelected={childIsSelected}
                isRenaming={childIsRenaming}
                isDropTarget={childIsDropTarget}
                isDragged={childIsDragged}
                status={childStatus}
                renameInputValue={renameInputValue}
                renameInputRef={renameInputRef}
                inlineInput={inlineInput}
                inlineInputValue={inlineInputValue}
                inlineInputRef={inlineInputRef}
                expandedPaths={expandedPaths}
                selectedFilePath={selectedFilePath}
                renameFilePath={renameFilePath}
                draggedPath={draggedPath}
                dropTargetPath={dropTargetPath}
                getFileStatus={getFileStatus}
                onNodeClick={onNodeClick}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                onKeyDown={onKeyDown}
                onContextMenu={onContextMenu}
                setRenameInputValue={setRenameInputValue}
                submitRename={submitRename}
                cancelRename={cancelRename}
                setInlineInputValue={setInlineInputValue}
                submitInlineInput={submitInlineInput}
                setInlineInput={setInlineInput}
              />
            )
          })}
        </div>
      )}
    </div>
  )
})

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
    renameInput,
    renameInputValue,
    setRenameInputValue,
    error,
    clearError,
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
    setDropTarget,
    handleDrop,
    endDrag,
  } = useFileTree({ directory, onFileSelect, gitStatus })

  const inlineInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Watch repo directory recursively for external file changes
  useExplorerWatcher(directory, refreshTree)

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


  // Focus inline input when it appears
  useEffect(() => {
    if (inlineInput && inlineInputRef.current) {
      inlineInputRef.current.focus()
    }
  }, [inlineInput])

  // Focus and select rename input when it appears
  useEffect(() => {
    if (renameInput && renameInputRef.current) {
      renameInputRef.current.focus()
      // Select name without extension for files
      const dotIndex = renameInput.originalName.lastIndexOf('.')
      if (dotIndex > 0) {
        renameInputRef.current.setSelectionRange(0, dotIndex)
      } else {
        renameInputRef.current.select()
      }
    }
  }, [renameInput])

  // Stable handlers that take path as parameter — avoids per-node closures
  const handleNodeClick = useCallback((node: TreeNode, isRenaming: boolean) => {
    if (!isRenaming) handleFileClick(node)
  }, [handleFileClick])

  const handleNodeDragStart = useCallback((e: React.DragEvent, path: string) => {
    e.dataTransfer.effectAllowed = 'move'
    startDrag(path)
  }, [startDrag])

  const handleNodeDragOver = useCallback((e: React.DragEvent, node: TreeNode) => {
    if (node.isDirectory && draggedPath && draggedPath !== node.path) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(node.path)
    }
  }, [draggedPath, setDropTarget])

  const handleNodeDragLeave = useCallback((path: string) => {
    if (dropTargetPath === path) setDropTarget(null)
  }, [dropTargetPath, setDropTarget])

  const handleNodeDrop = useCallback((e: React.DragEvent, node: TreeNode) => {
    e.preventDefault()
    if (node.isDirectory) {
      void handleDrop(node.path)
    }
  }, [handleDrop])

  const handleNodeKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>, node: TreeNode, nodeIsExpanded: boolean) => {
    handleTreeKeyDown(e, node, nodeIsExpanded, { handleFileClick, toggleExpand })
  }, [handleFileClick, toggleExpand])

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    if (node.isDirectory) {
      void handleContextMenu(e, node.path)
    } else {
      void handleFileContextMenu(e, node.path, node.name)
    }
  }, [handleContextMenu, handleFileContextMenu])

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
      {error && <div className="px-2 mb-1"><DialogErrorBanner error={error} onDismiss={clearError} /></div>}
      <div className="text-text-secondary mb-2 px-2 truncate text-xs cursor-context-menu" onContextMenu={(e) => handleContextMenu(e, directory)}>{directory}</div>
      {inlineInput && <InlineCreateInput parentPath={directory} inlineInput={inlineInput} inlineInputValue={inlineInputValue} setInlineInputValue={setInlineInputValue} submitInlineInput={submitInlineInput} setInlineInput={setInlineInput} inputRef={inlineInputRef} depth={0} />}
      {tree.length === 0 ? (
        <div className="text-center text-text-secondary text-sm py-4">Empty directory</div>
      ) : (
        tree.map((node) => {
          const nodeIsExpanded = expandedPaths.has(node.path)
          const status = getFileStatus(node.path)
          const isSelected = !node.isDirectory && node.path === selectedFilePath
          const isRenaming = renameInput?.filePath === node.path
          const isDropTarget = dropTargetPath === node.path
          const isDragged = draggedPath === node.path
          return (
            <TreeNodeItem
              key={node.path}
              node={node}
              depth={0}
              isExpanded={nodeIsExpanded}
              isSelected={isSelected}
              isRenaming={isRenaming}
              isDropTarget={isDropTarget}
              isDragged={isDragged}
              status={status}
              renameInputValue={renameInputValue}
              renameInputRef={renameInputRef}
              inlineInput={inlineInput}
              inlineInputValue={inlineInputValue}
              inlineInputRef={inlineInputRef}
              expandedPaths={expandedPaths}
              selectedFilePath={selectedFilePath}
              renameFilePath={renameInput?.filePath}
              draggedPath={draggedPath}
              dropTargetPath={dropTargetPath}
              getFileStatus={getFileStatus}
              onNodeClick={handleNodeClick}
              onDragStart={handleNodeDragStart}
              onDragOver={handleNodeDragOver}
              onDragLeave={handleNodeDragLeave}
              onDrop={handleNodeDrop}
              onDragEnd={endDrag}
              onKeyDown={handleNodeKeyDown}
              onContextMenu={handleNodeContextMenu}
              setRenameInputValue={setRenameInputValue}
              submitRename={submitRename}
              cancelRename={cancelRename}
              setInlineInputValue={setInlineInputValue}
              submitInlineInput={submitInlineInput}
              setInlineInput={setInlineInput}
            />
          )
        })
      )}
    </>
  )
}
