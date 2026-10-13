/**
 * Unified config persistence — single source of truth for all config saves.
 *
 * Replaces the fragmented pattern where each store (sessions, agents, repos)
 * independently called config.load() then config.save(), causing race conditions
 * that could wipe data. Now every store mutation calls scheduleSave(), which
 * debounces and assembles the complete config from all Zustand stores before
 * sending one atomic config.save() IPC call.
 */
import { profileRuntime } from './profileRuntime'
import { PANEL_IDS } from '../panels/system/types'

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
async function doSave(profileId = currentProfileId): Promise<void> {
  const live = useSessionStore.getState()
  const cached = profileId !== currentProfileId && profileId ? profileRuntime.get(profileId) : undefined
  const sessionState = cached ? { ...live, ...cached.ui } : live
  const agentState = cached?.agents ?? useAgentStore.getState()
  const repoState = cached?.repos ?? useRepoStore.getState()
  const counts = cached?.counts ?? loadedCounts

  const sessions = live.sessions.filter(s => s.profileId === profileId)
  const agents = agentState.agents
  const repos = repoState.repos

  // Save guards: refuse to persist empty arrays when we previously loaded many items.
  // This prevents bugs (e.g. a failed load or store reset) from wiping disk data.
  // Threshold > 1 so that deleting the last item is allowed — only block when
  // a suspiciously large number of items vanish at once (indicating a bug, not user action).
  if (sessions.length === 0 && counts.sessions > 1) {
    console.warn(
      `[configPersistence] Save guard: refusing to save — sessions empty ` +
      `(${counts.sessions} were loaded from disk)`
    )
    return
  }
  if (agents.length === 0 && counts.agents > 1) {
    console.warn(
      `[configPersistence] Save guard: refusing to save — agents empty ` +
      `(${counts.agents} were loaded from disk)`
    )
    return
  }
  if (repos.length === 0 && counts.repos > 1) {
    console.warn(
      `[configPersistence] Save guard: refusing to save — repos empty ` +
      `(${counts.repos} were loaded from disk)`
    )
    return
  }

  const result = await window.config.save({
    profileId,
    agents,
    sessions: sessions.filter(s => s.status !== 'initializing').map((s) => ({
      id: s.id,
      name: s.name,
      directory: s.directory,
      agentId: s.agentId,
      repoId: s.repoId,
      issueNumber: s.issueNumber,
      issueTitle: s.issueTitle,
      issueUrl: s.issueUrl,
      // Save new panelVisibility format
      panelVisibility: s.panelVisibility,
      // Review session fields
      sessionType: s.sessionType,
      reviewStatus: s.reviewStatus,
      prNumber: s.prNumber,
      prTitle: s.prTitle,
      prUrl: s.prUrl,
      prBaseBranch: s.prBaseBranch,
      // Legacy fields (already synced in store by panel actions)
      showExplorer: s.showExplorer,
      showFileViewer: s.showFileViewer,
      showDiff: s.showDiff,
      fileViewerPosition: s.fileViewerPosition,
      layoutSizes: s.layoutSizes,
      explorerFilter: s.explorerFilter,
      terminalTabs: s.terminalTabs,
      // Commit tracking
      hasHadCommits: s.hasHadCommits || undefined,
      // PR state tracking
      lastKnownPrState: s.lastKnownPrState,
      lastKnownPrNumber: s.lastKnownPrNumber,
      lastKnownPrUrl: s.lastKnownPrUrl,
      // Search history
      searchHistory: s.searchHistory.length > 0 ? s.searchHistory : undefined,
      // Archive state
      isArchived: s.isArchived || undefined,
      archivedAt: s.archivedAt,
      // Stage state machine
      stage: s.stage,
      // Agent SDK session ID for resume
      sdkSessionId: s.sdkSessionId,
    })),
    repos,
    defaultCloneDir: repoState.defaultCloneDir || undefined,
    defaultShell: repoState.defaultShell || undefined,
    showSidebar: sessionState.globalPanelVisibility[PANEL_IDS.SIDEBAR] ?? true,
    sidebarWidth: sessionState.sidebarWidth,
    toolbarPanels: sessionState.toolbarPanels,
    collapsedRepoGroups: sessionState.collapsedRepoGroups,
    repoGroupOrder: sessionState.repoGroupOrder,
  })
  if (!result.success) throw new Error(result.error ?? 'Failed to save profile config')
}

// Debounced save — collapses rapid mutations into a single write
let savingSuspended = false
let saveQueue = Promise.resolve()

export function suspendProfileSaving(suspended: boolean): void {
  savingSuspended = suspended
  if (!suspended) scheduleSave()
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null

export function scheduleSave(): void {
  if (savingSuspended) return
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    void enqueueSave().catch((err: unknown) => console.error('[configPersistence] Failed to save:', err))
  }, 500)
}

async function saveAllProfiles(): Promise<void> {
  const ids = new Set([currentProfileId, ...profileRuntime.keys()])
  for (const id of ids) await doSave(id)
}

function enqueueSave(): Promise<void> {
  saveQueue = saveQueue.catch(() => {}).then(saveAllProfiles)
  return saveQueue
}

export async function saveNow(): Promise<void> {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = null
  await enqueueSave()
}
