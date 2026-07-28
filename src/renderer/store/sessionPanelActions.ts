/**
 * Session store actions for toggling panels, managing layout sizes, and toolbar configuration.
 */
import { PANEL_IDS } from '../panels/system/types'
import { BUILTIN_PANELS } from '../panels/system/builtinPanels'
import type { Session, PanelVisibility } from './sessions'
import { debouncedSave, syncLegacyFields } from './sessionPersistence'
import { useRepoStore } from './repos'
import { moveSessionWithinGroup, moveGroupKey } from '../panels/sidebar/sidebarDragOrder'

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
  collapsedRepoGroups: string[]
  repoGroupOrder: string[]
}
type StoreSet = (partial: Partial<{
  sessions: Session[]
  globalPanelVisibility: PanelVisibility
  showSidebar: boolean
  showSettings: boolean
  sidebarWidth: number
  toolbarPanels: string[]
  collapsedRepoGroups: string[]
  repoGroupOrder: string[]
  sidebarFullOrder: string[]
  sidebarVisibleOrder: string[]
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

    setRepoGroupCollapsed: (key: string, collapsed: boolean) => {
      const current = get().collapsedRepoGroups
      const has = current.includes(key)
      if (collapsed === has) return // no-op — nothing changed
      set({ collapsedRepoGroups: collapsed ? [...current, key] : current.filter((k) => k !== key) })
      debouncedSave()
    },

    // Active session order IS the array order, so a drag rewrites the array. Repos come
    // from the repo store — the session store never holds them.
    reorderSession: (draggedId: string, targetId: string, before: boolean) => {
      const { sessions } = get()
      const next = moveSessionWithinGroup(
        sessions,
        useRepoStore.getState().repos,
        draggedId,
        targetId,
        before,
      )
      if (next === sessions) return // rejected drop — nothing changed
      set({ sessions: next })
      debouncedSave()
    },

    reorderRepoGroup: (draggedKey: string, targetKey: string, renderedKeys: string[], before: boolean) => {
      const current = get().repoGroupOrder
      const next = moveGroupKey(current, renderedKeys, draggedKey, targetKey, before)
      if (next === current) return
      set({ repoGroupOrder: next })
      debouncedSave()
    },

    // Runtime only: the grouped/sorted display order for keyboard Next/Prev. Published
    // by SessionList; never persisted. `full` = every active session in display order;
    // `visible` excludes collapsed groups / search non-matches.
    setSidebarOrder: (full: string[], visible: string[]) => {
      set({ sidebarFullOrder: full, sidebarVisibleOrder: visible })
    },

    toggleSidebar: () => {
      const store = get() as unknown as { toggleGlobalPanel: (panelId: string) => void }
      store.toggleGlobalPanel(PANEL_IDS.SIDEBAR)
    },

    // Only ever called for a real user action (a divider drag) — see updateLayoutSize.
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
