import { PANEL_IDS } from '../panels/types'
import type { Session, PanelVisibility } from './sessions'
import { debouncedSave, syncLegacyFields } from './sessionPersistence'

type StoreGet = () => {
  sessions: Session[]
  globalPanelVisibility: PanelVisibility
  sidebarWidth: number
  toolbarPanels: string[]
}
type StoreSet = (partial: Partial<{
  sessions: Session[]
  globalPanelVisibility: PanelVisibility
  showSidebar: boolean
  showSettings: boolean
  sidebarWidth: number
  toolbarPanels: string[]
}>) => void

export function createPanelActions(get: StoreGet, set: StoreSet) {
  return {
    togglePanel: (sessionId: string, panelId: string) => {
      const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
      const updatedSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        const newVisibility = {
          ...s.panelVisibility,
          [panelId]: !s.panelVisibility[panelId],
        }
        return syncLegacyFields({
          ...s,
          panelVisibility: newVisibility,
        })
      })
      set({ sessions: updatedSessions })
      debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
    },

    toggleGlobalPanel: (panelId: string) => {
      const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
      const newVisibility = {
        ...globalPanelVisibility,
        [panelId]: !globalPanelVisibility[panelId],
      }
      set({
        globalPanelVisibility: newVisibility,
        showSidebar: newVisibility[PANEL_IDS.SIDEBAR] ?? true,
        showSettings: newVisibility[PANEL_IDS.SETTINGS] ?? false,
      })
      debouncedSave(sessions, newVisibility, sidebarWidth, toolbarPanels)
    },

    setPanelVisibility: (sessionId: string, panelId: string, visible: boolean) => {
      const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
      const updatedSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        const newVisibility = {
          ...s.panelVisibility,
          [panelId]: visible,
        }
        return syncLegacyFields({
          ...s,
          panelVisibility: newVisibility,
        })
      })
      set({ sessions: updatedSessions })
      debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
    },

    setToolbarPanels: (panels: string[]) => {
      const { sessions, globalPanelVisibility, sidebarWidth } = get()
      set({ toolbarPanels: panels })
      debouncedSave(sessions, globalPanelVisibility, sidebarWidth, panels)
    },

    toggleSidebar: () => {
      const store = get() as unknown as { toggleGlobalPanel: (panelId: string) => void }
      store.toggleGlobalPanel(PANEL_IDS.SIDEBAR)
    },

    setSidebarWidth: (width: number) => {
      const { sessions, globalPanelVisibility, toolbarPanels } = get()
      set({ sidebarWidth: width })
      debouncedSave(sessions, globalPanelVisibility, width, toolbarPanels)
    },

    toggleAgentTerminal: (id: string) => {
      const store = get() as unknown as { togglePanel: (sessionId: string, panelId: string) => void }
      store.togglePanel(id, PANEL_IDS.AGENT_TERMINAL)
    },

    toggleUserTerminal: (id: string) => {
      const store = get() as unknown as { togglePanel: (sessionId: string, panelId: string) => void }
      store.togglePanel(id, PANEL_IDS.USER_TERMINAL)
    },

    toggleExplorer: (id: string) => {
      const store = get() as unknown as { togglePanel: (sessionId: string, panelId: string) => void }
      store.togglePanel(id, PANEL_IDS.EXPLORER)
    },

    toggleFileViewer: (id: string) => {
      const store = get() as unknown as { togglePanel: (sessionId: string, panelId: string) => void }
      store.togglePanel(id, PANEL_IDS.FILE_VIEWER)
    },
  }
}
