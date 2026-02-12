import { PANEL_IDS } from '../panels/types'
import type { Session, PanelVisibility } from './sessions'

// Current profile ID for saves - set by loadSessions
let currentProfileId: string | undefined

export function setCurrentProfileId(profileId: string | undefined) {
  currentProfileId = profileId
}

export function getCurrentProfileId(): string | undefined {
  return currentProfileId
}

// Track how many sessions were loaded from disk.
// Used by the save guard to prevent accidentally persisting an empty array.
let loadedSessionCount = 0

export function setLoadedSessionCount(count: number) {
  loadedSessionCount = count
}

export function getLoadedSessionCount(): number {
  return loadedSessionCount
}

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

// Debounced save to avoid too many writes during dragging
let saveTimeout: ReturnType<typeof setTimeout> | null = null
export const debouncedSave = async (
  sessions: Session[],
  globalPanelVisibility: PanelVisibility,
  sidebarWidth: number,
  toolbarPanels: string[]
) => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    // Save guard: refuse to persist an empty sessions array when we previously
    // loaded real sessions. This prevents bugs (e.g. a failed loadSessions)
    // from accidentally wiping all persisted session data.
    if (sessions.length === 0 && loadedSessionCount > 0) {
      console.warn(
        `[sessionPersistence] Save guard: refusing to save empty sessions array ` +
        `(${loadedSessionCount} sessions were loaded from disk)`
      )
      return
    }
    const config = await window.config.load(currentProfileId)
    await window.config.save({
      profileId: currentProfileId,
      agents: config.agents,
      sessions: sessions.map((s) => ({
        id: s.id,
        name: s.name,
        directory: s.directory,
        agentId: s.agentId,
        repoId: s.repoId,
        issueNumber: s.issueNumber,
        issueTitle: s.issueTitle,
        // Save new panelVisibility format
        panelVisibility: s.panelVisibility,
        // Review session fields
        sessionType: s.sessionType,
        prNumber: s.prNumber,
        prTitle: s.prTitle,
        prUrl: s.prUrl,
        prBaseBranch: s.prBaseBranch,
        // Also save legacy fields for backwards compat
        showAgentTerminal: s.showAgentTerminal,
        showUserTerminal: s.showUserTerminal,
        showExplorer: s.showExplorer,
        showFileViewer: s.showFileViewer,
        showDiff: s.showDiff,
        fileViewerPosition: s.fileViewerPosition,
        layoutSizes: s.layoutSizes,
        explorerFilter: s.explorerFilter,
        terminalTabs: s.terminalTabs,
        // Push to main tracking
        pushedToMainAt: s.pushedToMainAt,
        pushedToMainCommit: s.pushedToMainCommit,
        // Commit tracking
        hasHadCommits: s.hasHadCommits || undefined,
        // PR state tracking
        lastKnownPrState: s.lastKnownPrState,
        lastKnownPrNumber: s.lastKnownPrNumber,
        lastKnownPrUrl: s.lastKnownPrUrl,
        // Archive state
        isArchived: s.isArchived || undefined,
      })),
      // Global state
      showSidebar: globalPanelVisibility[PANEL_IDS.SIDEBAR] ?? true,
      sidebarWidth,
      toolbarPanels,
    })
  }, 500)
}
