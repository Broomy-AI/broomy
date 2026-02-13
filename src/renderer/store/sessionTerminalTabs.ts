import type { Session, TerminalTab, PanelVisibility } from './sessions'
import { debouncedSave } from './sessionPersistence'

type StoreGet = () => {
  sessions: Session[]
  globalPanelVisibility: PanelVisibility
  sidebarWidth: number
  toolbarPanels: string[]
}
type StoreSet = (partial: { sessions: Session[] }) => void

export function createTerminalTabActions(get: StoreGet, set: StoreSet) {
  return {
    addTerminalTab: (sessionId: string, name?: string): string => {
      const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
      const tabId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
      const session = sessions.find((s) => s.id === sessionId)
      const tabNumber = session ? session.terminalTabs.tabs.length + 1 : 1
      const tabName = name || `Terminal ${tabNumber}`

      const updatedSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        return {
          ...s,
          terminalTabs: {
            tabs: [...s.terminalTabs.tabs, { id: tabId, name: tabName }],
            activeTabId: tabId,
          },
        }
      })
      set({ sessions: updatedSessions })
      debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
      return tabId
    },

    removeTerminalTab: (sessionId: string, tabId: string) => {
      const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
      const updatedSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        const tabIndex = s.terminalTabs.tabs.findIndex((t) => t.id === tabId)
        const newTabs = s.terminalTabs.tabs.filter((t) => t.id !== tabId)

        // Don't allow closing the last tab
        if (newTabs.length === 0) return s

        // If closing the active tab, select an adjacent one
        let newActiveId = s.terminalTabs.activeTabId
        if (s.terminalTabs.activeTabId === tabId) {
          // Prefer the tab to the right, or the one to the left if closing the rightmost
          const newIndex = Math.min(tabIndex, newTabs.length - 1)
          newActiveId = newTabs[newIndex].id
        }

        return {
          ...s,
          terminalTabs: {
            tabs: newTabs,
            activeTabId: newActiveId,
          },
        }
      })
      set({ sessions: updatedSessions })
      debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
    },

    renameTerminalTab: (sessionId: string, tabId: string, name: string) => {
      const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
      const updatedSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        return {
          ...s,
          terminalTabs: {
            ...s.terminalTabs,
            tabs: s.terminalTabs.tabs.map((t) =>
              t.id === tabId ? { ...t, name } : t
            ),
          },
        }
      })
      set({ sessions: updatedSessions })
      debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
    },

    reorderTerminalTabs: (sessionId: string, tabs: TerminalTab[]) => {
      const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
      const updatedSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        return {
          ...s,
          terminalTabs: {
            ...s.terminalTabs,
            tabs,
          },
        }
      })
      set({ sessions: updatedSessions })
      debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
    },

    setActiveTerminalTab: (sessionId: string, tabId: string) => {
      const { sessions } = get()
      const updatedSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        return {
          ...s,
          terminalTabs: {
            ...s.terminalTabs,
            activeTabId: tabId,
          },
        }
      })
      set({ sessions: updatedSessions })
      // Don't persist active tab - it's runtime state
    },

    closeOtherTerminalTabs: (sessionId: string, tabId: string) => {
      const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
      const updatedSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        const tab = s.terminalTabs.tabs.find((t) => t.id === tabId)
        if (!tab) return s
        return {
          ...s,
          terminalTabs: {
            tabs: [tab],
            activeTabId: tabId,
          },
        }
      })
      set({ sessions: updatedSessions })
      debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
    },

    closeTerminalTabsToRight: (sessionId: string, tabId: string) => {
      const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
      const updatedSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        const tabIndex = s.terminalTabs.tabs.findIndex((t) => t.id === tabId)
        if (tabIndex === -1) return s
        const newTabs = s.terminalTabs.tabs.slice(0, tabIndex + 1)
        // If active tab was to the right, select the clicked tab
        const activeIndex = s.terminalTabs.tabs.findIndex((t) => t.id === s.terminalTabs.activeTabId)
        const newActiveId = activeIndex > tabIndex ? tabId : s.terminalTabs.activeTabId
        return {
          ...s,
          terminalTabs: {
            tabs: newTabs,
            activeTabId: newActiveId,
          },
        }
      })
      set({ sessions: updatedSessions })
      debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
    },
  }
}
