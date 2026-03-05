/**
 * Session store actions for toggling panels, managing layout sizes, and toolbar configuration.
 */
import { PANEL_IDS } from '../panels/types'
import { BUILTIN_PANELS } from '../panels/builtinPanels'
import type { Session, PanelVisibility } from './sessions'
import { debouncedSave, syncLegacyFields } from './sessionPersistence'

function getEffectiveVisibility(panelVisibility: PanelVisibility, panelId: string): boolean {
  if (panelId in panelVisibility) return panelVisibility[panelId]
  const def = BUILTIN_PANELS.find(p => p.id === panelId)
  return def?.defaultVisible ?? false
}

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
      const { sessions } = get()
      const updatedSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        const newVisibility = {
          ...s.panelVisibility,
          [panelId]: !getEffectiveVisibility(s.panelVisibility, panelId),
        }
        return syncLegacyFields({
          ...s,
          panelVisibility: newVisibility,
        })
      })
      set({ sessions: updatedSessions })
      debouncedSave()
    },

    toggleGlobalPanel: (panelId: string) => {
      const { globalPanelVisibility } = get()
      const newVisibility = {
        ...globalPanelVisibility,
        [panelId]: !getEffectiveVisibility(globalPanelVisibility, panelId),
      }
      set({
        globalPanelVisibility: newVisibility,
        showSidebar: newVisibility[PANEL_IDS.SIDEBAR] ?? true,
        showSettings: newVisibility[PANEL_IDS.SETTINGS] ?? false,
      })
      debouncedSave()
    },

    setPanelVisibility: (sessionId: string, panelId: string, visible: boolean) => {
      const { sessions } = get()
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
      debouncedSave()
    },

    setToolbarPanels: (panels: string[]) => {
      set({ toolbarPanels: panels })
      debouncedSave()
    },

    toggleSidebar: () => {
      const store = get() as unknown as { toggleGlobalPanel: (panelId: string) => void }
      store.toggleGlobalPanel(PANEL_IDS.SIDEBAR)
    },

    setSidebarWidth: (width: number) => {
      set({ sidebarWidth: width })
      debouncedSave()
    },

    toggleExplorer: (id: string) => {
      const store = get() as unknown as { togglePanel: (sessionId: string, panelId: string) => void }
      store.togglePanel(id, PANEL_IDS.EXPLORER)
    },

    toggleFileViewer: (id: string) => {
      const store = get() as unknown as { togglePanel: (sessionId: string, panelId: string) => void }
      store.togglePanel(id, PANEL_IDS.FILE_VIEWER)
    },

    openCommandsEditor: (sessionId: string, directory: string) => {
      const { sessions } = get()
      const updatedSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        const newVisibility = {
          ...s.panelVisibility,
          [PANEL_IDS.FILE_VIEWER]: true,
        }
        return syncLegacyFields({
          ...s,
          commandsEditorDirectory: directory,
          panelVisibility: newVisibility,
        })
      })
      set({ sessions: updatedSessions })
      debouncedSave()
    },

    closeCommandsEditor: (sessionId: string) => {
      const { sessions } = get()
      const updatedSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        return { ...s, commandsEditorDirectory: null }
      })
      set({ sessions: updatedSessions })
      debouncedSave()
    },
  }
}
