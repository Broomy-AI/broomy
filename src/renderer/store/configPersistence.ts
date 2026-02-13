/**
 * Unified config persistence — single source of truth for all config saves.
 *
 * Replaces the fragmented pattern where each store (sessions, agents, repos)
 * independently called config.load() then config.save(), causing race conditions
 * that could wipe data. Now every store mutation calls scheduleSave(), which
 * debounces and assembles the complete config from all Zustand stores before
 * sending one atomic config.save() IPC call.
 */
import { PANEL_IDS } from '../panels/types'

// These imports form a circular chain (sessions → sessionPersistence → configPersistence → sessions)
// but it's safe because we only access the stores inside doSave(), which runs asynchronously
// long after all modules have finished initializing.
import { useSessionStore } from './sessions'
import { useAgentStore } from './agents'
import { useRepoStore } from './repos'

// Current profile ID for saves — set by loadSessions
let currentProfileId: string | undefined

export function setCurrentProfileId(profileId: string | undefined) {
  currentProfileId = profileId
}

export function getCurrentProfileId(): string | undefined {
  return currentProfileId
}

// Track how many items were loaded from disk per entity type.
// Used by save guards to prevent accidentally persisting empty arrays.
let loadedCounts = { sessions: 0, agents: 0, repos: 0 }

export function setLoadedCounts(counts: Partial<typeof loadedCounts>) {
  loadedCounts = { ...loadedCounts, ...counts }
}

export function getLoadedCounts() {
  return { ...loadedCounts }
}

// Convenience aliases for session-specific loaded count (used by existing code)
export function setLoadedSessionCount(count: number) {
  loadedCounts.sessions = count
}

export function getLoadedSessionCount(): number {
  return loadedCounts.sessions
}

/**
 * Assemble the complete config from all Zustand stores and save it.
 * This is the single save path — no store should call config.save() directly.
 */
async function doSave(): Promise<void> {
  const sessionState = useSessionStore.getState()
  const agentState = useAgentStore.getState()
  const repoState = useRepoStore.getState()

  const sessions = sessionState.sessions
  const agents = agentState.agents
  const repos = repoState.repos

  // Save guards: refuse to persist empty arrays when we previously loaded real data.
  // This prevents bugs (e.g. a failed load or store reset) from wiping disk data.
  if (sessions.length === 0 && loadedCounts.sessions > 0) {
    console.warn(
      `[configPersistence] Save guard: refusing to save — sessions empty ` +
      `(${loadedCounts.sessions} were loaded from disk)`
    )
    return
  }
  if (agents.length === 0 && loadedCounts.agents > 0) {
    console.warn(
      `[configPersistence] Save guard: refusing to save — agents empty ` +
      `(${loadedCounts.agents} were loaded from disk)`
    )
    return
  }
  if (repos.length === 0 && loadedCounts.repos > 0) {
    console.warn(
      `[configPersistence] Save guard: refusing to save — repos empty ` +
      `(${loadedCounts.repos} were loaded from disk)`
    )
    return
  }

  await window.config.save({
    profileId: currentProfileId,
    agents,
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
      // Legacy fields (already synced in store by panel actions)
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
    repos,
    defaultCloneDir: repoState.defaultCloneDir || undefined,
    showSidebar: sessionState.globalPanelVisibility[PANEL_IDS.SIDEBAR] ?? true,
    sidebarWidth: sessionState.sidebarWidth,
    toolbarPanels: sessionState.toolbarPanels,
  })
}

// Debounced save — collapses rapid mutations into a single write
let saveTimeout: ReturnType<typeof setTimeout> | null = null

export function scheduleSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    void doSave()
  }, 500)
}
