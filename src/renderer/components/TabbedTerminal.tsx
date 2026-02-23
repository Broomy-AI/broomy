/**
 * Tabbed container for agent and user terminal instances within a session.
 *
 * The first tab is always the "Agent" tab — it runs the configured AI agent command
 * and cannot be closed, renamed, or reordered. Additional user terminal tabs can be
 * added, closed, renamed, drag-to-reordered, etc. Tab state (names, order, active tab)
 * is persisted in the session store. Context menu provides rename, close, close-others,
 * and close-to-right actions for user tabs.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import Terminal from './Terminal'
import TerminalTabBar from './TerminalTabBar'
import PanelErrorBoundary from './PanelErrorBoundary'
import { useSessionStore } from '../store/sessions'
import type { TerminalTab } from '../store/sessions'

const AGENT_TAB_ID = '__agent__'

/** Drag-and-drop state and handlers for terminal tab reordering. */
function useTabDragDrop(sessionId: string, userTabs: TerminalTab[], reorderTerminalTabs: (sid: string, tabs: TerminalTab[]) => void) {
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    if (tabId === AGENT_TAB_ID) { e.preventDefault(); return }
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
    if (tabId === AGENT_TAB_ID) return
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
    if (targetTabId === AGENT_TAB_ID) return
    if (!draggedTabId || draggedTabId === targetTabId) return
    const draggedIndex = userTabs.findIndex((t) => t.id === draggedTabId)
    const targetIndex = userTabs.findIndex((t) => t.id === targetTabId)
    if (draggedIndex === -1 || targetIndex === -1) return
    const newTabs = [...userTabs]
    const [draggedTab] = newTabs.splice(draggedIndex, 1)
    newTabs.splice(targetIndex, 0, draggedTab)
    reorderTerminalTabs(sessionId, newTabs)
    setDraggedTabId(null)
  }, [sessionId, draggedTabId, userTabs, reorderTerminalTabs])

  return { dragOverTabId, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop }
}

interface TabbedTerminalProps {
  sessionId: string
  cwd: string
  isActive: boolean
  agentCommand?: string
  agentEnv?: Record<string, string>
}

export default function TabbedTerminal({ sessionId, cwd, isActive, agentCommand, agentEnv }: TabbedTerminalProps) {
  const sessions = useSessionStore((state) => state.sessions)
  const addTerminalTab = useSessionStore((state) => state.addTerminalTab)
  const removeTerminalTab = useSessionStore((state) => state.removeTerminalTab)
  const renameTerminalTab = useSessionStore((state) => state.renameTerminalTab)
  const reorderTerminalTabs = useSessionStore((state) => state.reorderTerminalTabs)
  const setActiveTerminalTab = useSessionStore((state) => state.setActiveTerminalTab)
  const closeOtherTerminalTabs = useSessionStore((state) => state.closeOtherTerminalTabs)
  const closeTerminalTabsToRight = useSessionStore((state) => state.closeTerminalTabsToRight)

  const session = sessions.find((s) => s.id === sessionId)
  const userTabs = session?.terminalTabs.tabs ?? []
  const storedActiveTabId = session?.terminalTabs.activeTabId ?? null

  // Build the combined tab list: Agent tab first, then user tabs
  const agentTab = { id: AGENT_TAB_ID, name: 'Agent' }
  const allTabs = [agentTab, ...userTabs]
  const activeTabId = storedActiveTabId ?? AGENT_TAB_ID

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)

  const editInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)

  const { dragOverTabId, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop } =
    useTabDragDrop(sessionId, userTabs, reorderTerminalTabs)

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
  }, [allTabs.length])

  // Focus edit input when editing
  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingTabId])

  const handleAddTab = useCallback(() => { addTerminalTab(sessionId) }, [sessionId, addTerminalTab])
  const handleTabClick = useCallback((tabId: string) => { setActiveTerminalTab(sessionId, tabId) }, [sessionId, setActiveTerminalTab])

  const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    if (tabId === AGENT_TAB_ID) return
    removeTerminalTab(sessionId, tabId)
  }, [sessionId, removeTerminalTab])

  const handleContextMenu = useCallback(async (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    if (tabId === AGENT_TAB_ID) return
    const tabIndex = userTabs.findIndex((t) => t.id === tabId)
    const hasTabsToRight = tabIndex !== -1 && tabIndex < userTabs.length - 1
    const action = await window.menu.popup([
      { id: 'rename', label: 'Rename' },
      { id: 'close', label: 'Close', enabled: true },
      { id: 'sep', label: '', type: 'separator' },
      { id: 'close-others', label: 'Close Others', enabled: userTabs.length > 1 },
      { id: 'close-right', label: 'Close to the Right', enabled: hasTabsToRight },
    ])
    switch (action) {
      case 'rename': {
        const tab = userTabs.find((t) => t.id === tabId)
        if (tab) { setEditingTabId(tabId); setEditingName(tab.name) }
        break
      }
      case 'close': removeTerminalTab(sessionId, tabId); break
      case 'close-others': closeOtherTerminalTabs(sessionId, tabId); break
      case 'close-right': closeTerminalTabsToRight(sessionId, tabId); break
    }
  }, [sessionId, userTabs, removeTerminalTab, closeOtherTerminalTabs, closeTerminalTabsToRight])

  const handleRenameSubmit = useCallback(() => {
    if (editingTabId && editingName.trim()) renameTerminalTab(sessionId, editingTabId, editingName.trim())
    setEditingTabId(null); setEditingName('')
  }, [sessionId, editingTabId, editingName, renameTerminalTab])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit()
    else if (e.key === 'Escape') { setEditingTabId(null); setEditingName('') }
  }, [handleRenameSubmit])

  const handleDropdownSelect = useCallback((tabId: string) => { setActiveTerminalTab(sessionId, tabId); setShowDropdown(false) }, [sessionId, setActiveTerminalTab])

  const handleDoubleClick = useCallback((tabId: string) => {
    if (tabId === AGENT_TAB_ID) return
    const tab = userTabs.find((t) => t.id === tabId)
    if (tab) { setEditingTabId(tabId); setEditingName(tab.name) }
  }, [userTabs])

  return (
    <div className="h-full w-full flex flex-col">
      {/* Tab bar */}
      <TerminalTabBar
        tabs={allTabs}
        activeTabId={activeTabId}
        editingTabId={editingTabId}
        editingName={editingName}
        dragOverTabId={dragOverTabId}
        isOverflowing={isOverflowing}
        showDropdown={showDropdown}
        agentTabId={AGENT_TAB_ID}
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
        {/* Agent terminal — always rendered */}
        <div
          className={`absolute inset-0 ${activeTabId === AGENT_TAB_ID ? '' : 'hidden'}`}
        >
          <PanelErrorBoundary name="Agent Terminal">
            <Terminal
              sessionId={sessionId}
              cwd={cwd}
              command={agentCommand}
              env={agentEnv}
              isAgentTerminal={!!agentCommand}
              isActive={isActive && activeTabId === AGENT_TAB_ID}
            />
          </PanelErrorBoundary>
        </div>

        {/* User terminals */}
        {userTabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 ${tab.id === activeTabId ? '' : 'hidden'}`}
          >
            <PanelErrorBoundary name={`Terminal ${tab.name}`}>
              <Terminal
                sessionId={`user-${sessionId}-${tab.id}`}
                cwd={cwd}
                isActive={isActive && tab.id === activeTabId}
              />
            </PanelErrorBoundary>
          </div>
        ))}
      </div>
    </div>
  )
}
