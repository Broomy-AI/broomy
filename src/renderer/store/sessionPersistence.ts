import { PANEL_IDS } from '../panels/types'
import type { Session, PanelVisibility } from './sessions'
import { scheduleSave } from './configPersistence'

// Re-export from configPersistence for backwards compatibility
export {
  setCurrentProfileId,
  getCurrentProfileId,
  setLoadedSessionCount,
  getLoadedSessionCount,
} from './configPersistence'

// Helper to sync legacy fields from panelVisibility
export function syncLegacyFields(session: Session): Session {
  return {
    ...session,
    showAgentTerminal: session.panelVisibility[PANEL_IDS.AGENT_TERMINAL] ?? true,
    showUserTerminal: session.panelVisibility[PANEL_IDS.USER_TERMINAL] ?? false,
    showExplorer: session.panelVisibility[PANEL_IDS.EXPLORER] ?? false,
    showFileViewer: session.panelVisibility[PANEL_IDS.FILE_VIEWER] ?? false,
  }
}

// Helper to create panelVisibility from legacy fields
export function createPanelVisibilityFromLegacy(data: {
  showAgentTerminal?: boolean
  showUserTerminal?: boolean
  showExplorer?: boolean
  showFileViewer?: boolean
  panelVisibility?: PanelVisibility
}): PanelVisibility {
  // If panelVisibility exists, use it
  if (data.panelVisibility) {
    return data.panelVisibility
  }
  // Otherwise, create from legacy fields
  return {
    [PANEL_IDS.AGENT_TERMINAL]: data.showAgentTerminal ?? true,
    [PANEL_IDS.USER_TERMINAL]: data.showUserTerminal ?? false,
    [PANEL_IDS.EXPLORER]: data.showExplorer ?? false,
    [PANEL_IDS.FILE_VIEWER]: data.showFileViewer ?? false,
  }
}

// Debounced save — delegates to the unified configPersistence module.
// The signature is kept for compatibility with existing callers but the
// arguments are ignored; configPersistence reads current state from all stores.
export const debouncedSave = (
  _sessions: Session[],
  _globalPanelVisibility: PanelVisibility,
  _sidebarWidth: number,
  _toolbarPanels: string[]
) => {
  scheduleSave()
}
