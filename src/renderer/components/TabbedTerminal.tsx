/**
 * Tabbed container for user terminal instances within a session.
 *
 * Renders a minimal tab bar with add, close, rename (double-click), drag-to-reorder,
 * and overflow dropdown support. Each tab maps to a separate Terminal instance sharing
 * the same working directory. Tab state (names, order, active tab) is persisted in the
 * session store. Context menu provides rename, close, close-others, and close-to-right
 * actions.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import Terminal from './Terminal'
import TerminalTabBar from './TerminalTabBar'
import { useSessionStore } from '../store/sessions'

interface TabbedTerminalProps {
  sessionId: string
  cwd: string
  isActive: boolean
}

export default function TabbedTerminal({ sessionId, cwd, isActive }: TabbedTerminalProps) {
  const sessions = useSessionStore((state) => state.sessions)
  const addTerminalTab = useSessionStore((state) => state.addTerminalTab)
  const removeTerminalTab = useSessionStore((state) => state.removeTerminalTab)
  const renameTerminalTab = useSessionStore((state) => state.renameTerminalTab)
  const reorderTerminalTabs = useSessionStore((state) => state.reorderTerminalTabs)
  const setActiveTerminalTab = useSessionStore((state) => state.setActiveTerminalTab)
  const closeOtherTerminalTabs = useSessionStore((state) => state.closeOtherTerminalTabs)
  const closeTerminalTabsToRight = useSessionStore((state) => state.closeTerminalTabsToRight)

  const session = sessions.find((s) => s.id === sessionId)
  const tabs = session?.terminalTabs.tabs ?? []
  const activeTabId = session?.terminalTabs.activeTabId ?? null

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  const editInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  // Detect tab overflow
  useEffect(() => {
    const container = tabsContainerRef.current
    if (!container) return

    const checkOverflow = () => {
      setIsOverflowing(container.scrollWidth > container.clientWidth)
    }

    checkOverflow()
    const observer = new ResizeObserver(checkOverflow)
    observer.observe(container)
    return () => observer.disconnect()
  }, [tabs.length])
  // Focus edit input when editing
  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingTabId])
  const handleAddTab = useCallback(() => {
    addTerminalTab(sessionId)
  }, [sessionId, addTerminalTab])

  const handleTabClick = useCallback((tabId: string) => {
    setActiveTerminalTab(sessionId, tabId)
  }, [sessionId, setActiveTerminalTab])

  const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    removeTerminalTab(sessionId, tabId)
  }, [sessionId, removeTerminalTab])

  const handleContextMenu = useCallback(async (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    const tabIndex = tabs.findIndex((t) => t.id === tabId)
    const hasTabsToRight = tabIndex !== -1 && tabIndex < tabs.length - 1
    const canClose = tabs.length > 1

    const action = await window.menu.popup([
      { id: 'rename', label: 'Rename' },
      { id: 'close', label: 'Close', enabled: canClose },
      { id: 'sep', label: '', type: 'separator' },
      { id: 'close-others', label: 'Close Others', enabled: canClose },
      { id: 'close-right', label: 'Close to the Right', enabled: hasTabsToRight },
    ])

    switch (action) {
      case 'rename': {
        const tab = tabs.find((t) => t.id === tabId)
        if (tab) {
          setEditingTabId(tabId)
          setEditingName(tab.name)
        }
        break
      }
      case 'close':
        removeTerminalTab(sessionId, tabId)
        break
      case 'close-others':
        closeOtherTerminalTabs(sessionId, tabId)
        break
      case 'close-right':
        closeTerminalTabsToRight(sessionId, tabId)
        break
    }
  }, [sessionId, tabs, removeTerminalTab, closeOtherTerminalTabs, closeTerminalTabsToRight])

  const handleRenameSubmit = useCallback(() => {
    if (editingTabId && editingName.trim()) {
      renameTerminalTab(sessionId, editingTabId, editingName.trim())
    }
    setEditingTabId(null)
    setEditingName('')
  }, [sessionId, editingTabId, editingName, renameTerminalTab])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      setEditingTabId(null)
      setEditingName('')
    }
  }, [handleRenameSubmit])

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tabId)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedTabId(null)
    setDragOverTabId(null)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (tabId !== draggedTabId) {
      setDragOverTabId(tabId)
    }
  }, [draggedTabId])

  const handleDragLeave = useCallback(() => {
    setDragOverTabId(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault()
    setDragOverTabId(null)
    if (!draggedTabId || draggedTabId === targetTabId) return
    const draggedIndex = tabs.findIndex((t) => t.id === draggedTabId)
    const targetIndex = tabs.findIndex((t) => t.id === targetTabId)
    if (draggedIndex === -1 || targetIndex === -1) return
    const newTabs = [...tabs]
    const [draggedTab] = newTabs.splice(draggedIndex, 1)
    newTabs.splice(targetIndex, 0, draggedTab)

    reorderTerminalTabs(sessionId, newTabs)
    setDraggedTabId(null)
  }, [sessionId, draggedTabId, tabs, reorderTerminalTabs])

  const handleDropdownSelect = useCallback((tabId: string) => { setActiveTerminalTab(sessionId, tabId); setShowDropdown(false) }, [sessionId, setActiveTerminalTab])

  // Double-click to rename
  const handleDoubleClick = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId)
    if (tab) {
      setEditingTabId(tabId)
      setEditingName(tab.name)
    }
  }, [tabs])

  return (
    <div className="h-full w-full flex flex-col">
      {/* Tab bar */}
      <TerminalTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        editingTabId={editingTabId}
        editingName={editingName}
        dragOverTabId={dragOverTabId}
        isOverflowing={isOverflowing}
        showDropdown={showDropdown}
        handleTabClick={handleTabClick}
        handleCloseTab={handleCloseTab}
        handleContextMenu={handleContextMenu}
        handleDoubleClick={handleDoubleClick}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
        handleDragOver={handleDragOver}
        handleDragLeave={handleDragLeave}
        handleDrop={handleDrop}
        handleRenameSubmit={handleRenameSubmit}
        handleRenameKeyDown={handleRenameKeyDown}
        handleDropdownSelect={handleDropdownSelect}
        handleAddTab={handleAddTab}
        setEditingName={setEditingName}
        setShowDropdown={setShowDropdown}
        editInputRef={editInputRef}
        dropdownRef={dropdownRef}
        tabsContainerRef={tabsContainerRef}
      />

      {/* Terminal container */}
      <div className="flex-1 relative min-h-0">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 ${tab.id === activeTabId ? '' : 'hidden'}`}
          >
            <Terminal
              sessionId={`user-${sessionId}-${tab.id}`}
              cwd={cwd}
              isActive={isActive && tab.id === activeTabId}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
