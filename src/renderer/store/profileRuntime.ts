/** In-memory state for visited profile tabs. Sessions stay in the shared store. */
import { useSessionStore } from './sessions'
import { useAgentStore } from './agents'
import { useRepoStore } from './repos'
import { getLoadedCounts } from './configPersistence'

export const profileRuntime = new Map<string, ReturnType<typeof captureProfile>>()

function captureProfile() {
  const s = useSessionStore.getState()
  return {
    ui: {
      activeSessionId: s.activeSessionId, showSidebar: s.showSidebar,
      sidebarWidth: s.sidebarWidth, toolbarPanels: s.toolbarPanels,
      collapsedRepoGroups: s.collapsedRepoGroups, repoGroupOrder: s.repoGroupOrder,
      sidebarFullOrder: s.sidebarFullOrder, sidebarVisibleOrder: s.sidebarVisibleOrder,
      globalPanelVisibility: s.globalPanelVisibility, configLoadError: s.configLoadError,
    },
    agents: useAgentStore.getState(), repos: useRepoStore.getState(),
    counts: getLoadedCounts(),
  }
}

export function rememberProfile(profileId: string) {
  profileRuntime.set(profileId, captureProfile())
}

/** Resolve definitions against the owner of a background session. */
export function getSessionProfileConfig(profileId?: string) {
  const agents = useAgentStore.getState()
  const repos = useRepoStore.getState()
  const cached = profileId && (profileId !== agents.profileId || profileId !== repos.profileId)
    ? profileRuntime.get(profileId) : undefined
  return cached
}
