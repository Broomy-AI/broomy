/**
 * Tabbed container for agent and user terminal instances within a session.
 *
 * The first tab is always the "Agent" tab — it runs the configured AI agent command
 * and cannot be closed, renamed, or reordered. Additional user terminal tabs can be
 * added, closed, renamed, drag-to-reordered, etc. Tab state (names, order, active tab)
 * is persisted in the session store. Context menu provides rename, close, close-others,
 * and close-to-right actions for user tabs.
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import Terminal from './Terminal'
import TerminalTabBar from './TerminalTabBar'
import ContainerInfoPanel from './ContainerInfoPanel'
import PanelErrorBoundary from './PanelErrorBoundary'
import { useSessionStore } from '../store/sessions'
import type { TerminalTab } from '../store/sessions'

const AGENT_TAB_ID = '__agent__'
const SERVICES_TAB_ID = '__services__'

/** Drag-and-drop state and handlers for terminal tab reordering. */
function useTabDragDrop(sessionId: string, userTabs: TerminalTab[], reorderTerminalTabs: (sid: string, tabs: TerminalTab[]) => void) {
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    if (isFixedTab(tabId)) { e.preventDefault(); return }
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
    if (isFixedTab(tabId)) return
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
    if (isFixedTab(targetTabId)) return
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

/** Dropdown menu for choosing between local and container terminal tabs. */
function AddTabMenu({ onAddLocal, onAddContainer, menuRef }: {
  onAddLocal: () => void
  onAddContainer: () => void
  menuRef: React.RefObject<HTMLDivElement>
}) {
  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-0.5 bg-bg-secondary border border-border rounded shadow-lg z-50 min-w-36"
    >
      <button
        className="w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
        onClick={onAddLocal}
      >
        Local Terminal
      </button>
      <button
        className="w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
        onClick={onAddContainer}
      >
        Container Terminal
      </button>
    </div>
  )
}

const DOCKER_TAB_ID = '__docker__'

/** Tab IDs that cannot be closed, renamed, or dragged. */
function isFixedTab(tabId: string): boolean {
  return tabId === AGENT_TAB_ID || tabId === SERVICES_TAB_ID || tabId === DOCKER_TAB_ID
}

interface TabbedTerminalProps {
  sessionId: string
  cwd: string
  isActive: boolean
  agentCommand?: string
  agentEnv?: Record<string, string>
  agentResumeCommand?: string
  isRestored?: boolean
  isolated: boolean
  repoRootDir?: string
}

/** Info received when a devcontainer with postAttachCommand is ready. */
interface ServicesInfo {
  postAttachCommand: string
  containerId: string
  remoteUser: string
}

/** Listen for devcontainer config missing event and show a warning banner. */
function useDevcontainerMissing(sessionId: string): { missing: boolean; dismissed: boolean; dismiss: () => void } {
  const [missing, setMissing] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    const cleanup = window.pty.onDevcontainerMissing((event) => {
      if (event.sessionId === sessionId) setMissing(true)
    })
    return cleanup
  }, [sessionId])
  return { missing, dismissed, dismiss: useCallback(() => setDismissed(true), []) }
}

/** Listen for devcontainer postAttachCommand to auto-create a Services tab. */
function useDevcontainerServices(sessionId: string): ServicesInfo | null {
  const [servicesInfo, setServicesInfo] = useState<ServicesInfo | null>(null)
  useEffect(() => {
    const cleanup = window.pty.onDevcontainerReady((event) => {
      if (event.sessionId === sessionId) {
        setServicesInfo({
          postAttachCommand: event.postAttachCommand,
          containerId: event.containerId,
          remoteUser: event.remoteUser,
        })
      }
    })
    return cleanup
  }, [sessionId])
  return servicesInfo
}

/** Check if the agent command is installed. */
function useAgentInstalled(agentCommand: string | undefined): boolean {
  const [installed, setInstalled] = useState(true) // default true to avoid flash
  useEffect(() => {
    if (!agentCommand) return
    let cancelled = false
    window.agents.isInstalled(agentCommand).then((result) => {
      if (!cancelled) setInstalled(result)
    }).catch(() => {
      // If the check fails, assume installed to avoid false positives
    })
    return () => { cancelled = true }
  }, [agentCommand])
  return installed
}

/** Visibility class for a tab panel. */
function tabPanelClass(tabId: string, activeTabId: string): string {
  return `absolute inset-0 ${tabId === activeTabId ? '' : 'invisible pointer-events-none'}`
}

/** Renders the terminal panels (Agent, Services, Docker, user tabs). */
const TerminalPanels = React.memo(function TerminalPanels({ sessionId, cwd, isActive, activeTabId, agentCommand, agentEnv, agentInstalled, agentResumeCommand, isRestored, isolated, repoRootDir, servicesInfo, userTabs }: {
  sessionId: string; cwd: string; isActive: boolean; activeTabId: string
  agentCommand?: string; agentEnv?: Record<string, string>; agentInstalled: boolean
  agentResumeCommand?: string; isRestored?: boolean
  isolated: boolean; repoRootDir?: string
  servicesInfo: ServicesInfo | null
  userTabs: TerminalTab[]
}) {
  return (
    <div className="flex-1 relative min-h-0">
      <div className={tabPanelClass(AGENT_TAB_ID, activeTabId)}>
        <PanelErrorBoundary name="Agent Terminal">
          <Terminal
            sessionId={sessionId} cwd={cwd} command={agentCommand} env={agentEnv}
            isAgentTerminal={!!agentCommand} isActive={isActive && activeTabId === AGENT_TAB_ID}
            agentNotInstalled={!!agentCommand && !agentInstalled} agentResumeCommand={agentResumeCommand}
            isRestored={isRestored} isolated={isolated}
            repoRootDir={repoRootDir}
          />
        </PanelErrorBoundary>
      </div>
      {servicesInfo && (
        <div className={tabPanelClass(SERVICES_TAB_ID, activeTabId)}>
          <PanelErrorBoundary name="Services Terminal">
            <Terminal
              sessionId={`services-${sessionId}`} cwd={cwd} command={servicesInfo.postAttachCommand}
              isServicesTerminal isActive={isActive && activeTabId === SERVICES_TAB_ID}
              isolated repoRootDir={repoRootDir}
            />
          </PanelErrorBoundary>
        </div>
      )}
      {isolated && (
        <div className={tabPanelClass(DOCKER_TAB_ID, activeTabId)}>
          <ContainerInfoPanel repoDir={repoRootDir || cwd} />
        </div>
      )}
      {userTabs.map((tab) => (
        <div key={tab.id} className={tabPanelClass(tab.id, activeTabId)}>
          <PanelErrorBoundary name={`Terminal ${tab.name}`}>
            <Terminal
              sessionId={`user-${sessionId}-${tab.id}`} cwd={cwd}
              isActive={isActive && tab.id === activeTabId} isolated={tab.isolated && isolated}
              repoRootDir={tab.isolated && isolated ? repoRootDir : undefined}
            />
          </PanelErrorBoundary>
        </div>
      ))}
    </div>
  )
})

export default function TabbedTerminal({ sessionId, cwd, isActive, agentCommand, agentEnv, agentResumeCommand, isRestored, isolated, repoRootDir }: TabbedTerminalProps) {
  // Targeted selector: only re-render when this session's terminalTabs change
  const terminalTabs = useSessionStore((state) => {
    const session = state.sessions.find((s) => s.id === sessionId)
    return session?.terminalTabs
  })
  const addTerminalTab = useSessionStore((state) => state.addTerminalTab)
  const removeTerminalTab = useSessionStore((state) => state.removeTerminalTab)
  const renameTerminalTab = useSessionStore((state) => state.renameTerminalTab)
  const reorderTerminalTabs = useSessionStore((state) => state.reorderTerminalTabs)
  const setActiveTerminalTab = useSessionStore((state) => state.setActiveTerminalTab)
  const closeOtherTerminalTabs = useSessionStore((state) => state.closeOtherTerminalTabs)
  const closeTerminalTabsToRight = useSessionStore((state) => state.closeTerminalTabsToRight)

  const userTabs = terminalTabs?.tabs ?? []
  const storedActiveTabId = terminalTabs?.activeTabId ?? null

  const servicesInfo = useDevcontainerServices(sessionId)
  const devcontainerMissing = useDevcontainerMissing(sessionId)
  const agentInstalled = useAgentInstalled(agentCommand)

  // Build the combined tab list: Agent tab first, then optional Services tab, then optional Docker tab, then user tabs
  const agentTab = { id: AGENT_TAB_ID, name: 'Agent' }
  const servicesTab = servicesInfo ? { id: SERVICES_TAB_ID, name: 'Services' } : null
  const dockerTab = isolated ? { id: DOCKER_TAB_ID, name: '(container)' } : null
  const allTabs = [agentTab, ...(servicesTab ? [servicesTab] : []), ...(dockerTab ? [dockerTab] : []), ...userTabs]
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

  const [showAddMenu, setShowAddMenu] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)

  // Close dropdown/add-menu on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false)
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setShowAddMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Detect tab overflow
  useEffect(() => {
    const container = tabsContainerRef.current
    if (!container) return
    const checkOverflow = () => setIsOverflowing(container.scrollWidth > container.clientWidth)
    checkOverflow()
    const observer = new ResizeObserver(checkOverflow)
    observer.observe(container)
    return () => observer.disconnect()
  }, [allTabs.length])

  // Focus edit input when editing
  useEffect(() => { if (editingTabId && editInputRef.current) { editInputRef.current.focus(); editInputRef.current.select() } }, [editingTabId])

  const handleAddTab = useCallback(() => { if (isolated) { setShowAddMenu(prev => !prev) } else { addTerminalTab(sessionId) } }, [sessionId, addTerminalTab, isolated])
  const handleAddLocalTab = useCallback(() => { addTerminalTab(sessionId); setShowAddMenu(false) }, [sessionId, addTerminalTab])
  const handleAddContainerTab = useCallback(() => { addTerminalTab(sessionId, undefined, true); setShowAddMenu(false) }, [sessionId, addTerminalTab])
  const handleTabClick = useCallback((tabId: string) => { setActiveTerminalTab(sessionId, tabId) }, [sessionId, setActiveTerminalTab])

  const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => { e.stopPropagation(); if (!isFixedTab(tabId)) removeTerminalTab(sessionId, tabId) }, [sessionId, removeTerminalTab])

  const handleContextMenu = useCallback(async (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    if (isFixedTab(tabId)) return
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
  const handleDoubleClick = useCallback((tabId: string) => { if (isFixedTab(tabId)) return; const tab = userTabs.find((t) => t.id === tabId); if (tab) { setEditingTabId(tabId); setEditingName(tab.name) } }, [userTabs])

  const fixedTabIds = useMemo(() => {
    const ids = new Set<string>([DOCKER_TAB_ID])
    if (servicesInfo) ids.add(SERVICES_TAB_ID)
    return ids
  }, [servicesInfo])

  return (
    <div className="h-full w-full flex flex-col">
      {/* Tab bar */}
      <div className="relative">
        <TerminalTabBar
          tabs={allTabs}
          activeTabId={activeTabId}
          editingTabId={editingTabId}
          editingName={editingName}
          dragOverTabId={dragOverTabId}
          isOverflowing={isOverflowing}
          showDropdown={showDropdown}
          agentTabId={AGENT_TAB_ID}
          fixedTabIds={fixedTabIds}
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

        {showAddMenu && (
          <AddTabMenu onAddLocal={handleAddLocalTab} onAddContainer={handleAddContainerTab} menuRef={addMenuRef} />
        )}
      </div>

      {devcontainerMissing.missing && !devcontainerMissing.dismissed && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/30 text-xs text-yellow-300">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span>No devcontainer config found — running without container isolation. Use the &quot;Create Dev Container Config&quot; action in Source Control to add one.</span>
          <button onClick={devcontainerMissing.dismiss} className="ml-auto text-yellow-400 hover:text-yellow-200 flex-shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <TerminalPanels
        sessionId={sessionId} cwd={cwd} isActive={isActive} activeTabId={activeTabId}
        agentCommand={agentCommand} agentEnv={agentEnv} agentInstalled={agentInstalled}
        agentResumeCommand={agentResumeCommand} isRestored={isRestored}
        isolated={isolated} repoRootDir={repoRootDir}
        servicesInfo={servicesInfo} userTabs={userTabs}
      />
    </div>
  )
}
