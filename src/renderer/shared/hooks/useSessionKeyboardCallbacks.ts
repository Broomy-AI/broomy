/**
 * Provides memoized keyboard callback handlers for session navigation, panel toggling, archiving, and terminal tab switching.
 */
import { useCallback } from 'react'
import { PANEL_IDS } from '../../panels'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import { groupKeyForSession } from '../../panels/sidebar/repoGroups'

const AGENT_TAB_ID = '__agent__'

interface SessionKeyboardCallbacksDeps {
  sessions: Session[]
  /** Needed to derive a session's group key the same way the sidebar does. */
  repos?: ManagedRepo[]
  /** The visible grouped/sorted/filtered session-id order (excludes collapsed groups). */
  visibleOrder?: string[]
  /** Every active session in display order (for directional Next/Prev scanning). */
  fullOrder?: string[]
  /** Expands a collapsed group so Focus-Sessions can reach the active card. */
  setRepoGroupCollapsed?: (key: string, collapsed: boolean) => void
  activeSessionId: string | null
  globalPanelVisibility: Record<string, boolean>
  toggleGlobalPanel: (panelId: string) => void
  archiveSession: (id: string) => void
  unarchiveSession: (id: string) => void
  handleSelectSession: (id: string) => void
  setShowShortcutsModal: (show: boolean) => void
  setActiveTerminalTab: (sessionId: string, tabId: string) => void
}

export function useSessionKeyboardCallbacks({
  sessions,
  repos = [],
  visibleOrder = [],
  fullOrder = [],
  setRepoGroupCollapsed,
  activeSessionId,
  globalPanelVisibility,
  toggleGlobalPanel,
  archiveSession,
  unarchiveSession,
  handleSelectSession,
  setShowShortcutsModal,
  setActiveTerminalTab,
}: SessionKeyboardCallbacksDeps) {
  // Scan the FULL grouped order in a direction to the next VISIBLE session. When the
  // sidebar hasn't published a full order yet (unmounted/hidden), fall back to the raw
  // active order and treat every session as visible.
  const stepSession = useCallback(
    (dir: 1 | -1) => {
      // The published order is refreshed by an effect, so after a delete/archive/collapse
      // it can momentarily hold an id that no longer exists. Intersect with the live
      // non-archived sessions so Next/Prev never lands on a stale session.
      const liveIds = new Set(sessions.filter((s) => !s.isArchived).map((s) => s.id))
      const ready = fullOrder.length > 0
      const full = (ready ? fullOrder : [...liveIds]).filter((id) => liveIds.has(id))
      if (full.length === 0) return
      const visible = ready ? new Set(visibleOrder.filter((id) => liveIds.has(id))) : new Set(full)
      const start = full.indexOf(activeSessionId ?? '')
      const from = start === -1 ? (dir === 1 ? -1 : 0) : start
      for (let step = 1; step <= full.length; step++) {
        const idx = (((from + dir * step) % full.length) + full.length) % full.length
        if (visible.has(full[idx])) {
          handleSelectSession(full[idx])
          return
        }
      }
      // Nothing visible (e.g. every group collapsed) → no-op.
    },
    [fullOrder, visibleOrder, sessions, activeSessionId, handleSelectSession],
  )

  const handleNextSession = useCallback(() => stepSession(1), [stepSession])
  const handlePrevSession = useCallback(() => stepSession(-1), [stepSession])

  const handleFocusSessionList = useCallback(() => {
    if (!globalPanelVisibility[PANEL_IDS.SIDEBAR]) {
      toggleGlobalPanel(PANEL_IDS.SIDEBAR)
    }
    // If the active session sits in a collapsed group, expand it so its card can be focused.
    const active = sessions.find((s) => s.id === activeSessionId)
    if (active && !active.isArchived && setRepoGroupCollapsed) {
      setRepoGroupCollapsed(groupKeyForSession(active, repos), false)
    }
    requestAnimationFrame(() => {
      const activeCard = document.querySelector<HTMLElement>(`[data-panel-id="${PANEL_IDS.SIDEBAR}"] [tabindex="0"].bg-accent\\/15`)
      if (activeCard) {
        activeCard.focus()
      } else {
        const firstCard = document.querySelector<HTMLElement>(`[data-panel-id="${PANEL_IDS.SIDEBAR}"] [tabindex="0"]`)
        firstCard?.focus()
      }
    })
  }, [globalPanelVisibility, toggleGlobalPanel, sessions, repos, activeSessionId, setRepoGroupCollapsed])

  const handleFocusSessionSearch = useCallback(() => {
    if (!globalPanelVisibility[PANEL_IDS.SIDEBAR]) {
      toggleGlobalPanel(PANEL_IDS.SIDEBAR)
    }
    requestAnimationFrame(() => {
      const searchInput = document.querySelector<HTMLInputElement>('[data-session-search]')
      searchInput?.focus()
    })
  }, [globalPanelVisibility, toggleGlobalPanel])

  const handleArchiveSession = useCallback(() => {
    if (!activeSessionId) return
    const session = sessions.find((s) => s.id === activeSessionId)
    if (!session) return
    if (session.isArchived) {
      unarchiveSession(activeSessionId)
    } else {
      archiveSession(activeSessionId)
    }
  }, [activeSessionId, sessions, archiveSession, unarchiveSession])

  const handleToggleSettings = useCallback(() => {
    toggleGlobalPanel(PANEL_IDS.SETTINGS)
  }, [toggleGlobalPanel])

  const handleShowShortcuts = useCallback(() => {
    setShowShortcutsModal(true)
  }, [setShowShortcutsModal])

  const cycleTerminalTab = useCallback((direction: 1 | -1) => {
    if (!activeSessionId) return
    const session = sessions.find((s) => s.id === activeSessionId)
    if (!session) return
    const userTabs = session.terminalTabs.tabs
    const allTabIds = [AGENT_TAB_ID, ...userTabs.map((t) => t.id)]
    if (allTabIds.length <= 1) return
    const currentId = session.terminalTabs.activeTabId ?? AGENT_TAB_ID
    const currentIndex = allTabIds.indexOf(currentId)
    const nextIndex = (currentIndex + direction + allTabIds.length) % allTabIds.length
    setActiveTerminalTab(activeSessionId, allTabIds[nextIndex])
  }, [activeSessionId, sessions, setActiveTerminalTab])

  const handleNextTerminalTab = useCallback(() => cycleTerminalTab(1), [cycleTerminalTab])
  const handlePrevTerminalTab = useCallback(() => cycleTerminalTab(-1), [cycleTerminalTab])

  return {
    handleNextSession,
    handlePrevSession,
    handleFocusSessionList,
    handleFocusSessionSearch,
    handleArchiveSession,
    handleToggleSettings,
    handleShowShortcuts,
    handleNextTerminalTab,
    handlePrevTerminalTab,
  }
}
