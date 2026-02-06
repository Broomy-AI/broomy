import { create } from 'zustand'
import { basename } from 'path-browserify'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/types'
import type { BranchStatus, PrState } from '../utils/branchStatus'

export type { BranchStatus, PrState }

export type SessionStatus = 'working' | 'idle' | 'error'
export type FileViewerPosition = 'top' | 'left'

// Terminal tab types
export interface TerminalTab {
  id: string
  name: string
}

export interface TerminalTabsState {
  tabs: TerminalTab[]
  activeTabId: string | null
}

export interface LayoutSizes {
  explorerWidth: number
  fileViewerSize: number // height when top, width when left
  userTerminalHeight: number
  diffPanelWidth: number
  reviewPanelWidth: number
}

export type ExplorerFilter = 'files' | 'source-control' | 'search' | 'recent'

// Panel visibility map type
export type PanelVisibility = Record<string, boolean>

export interface Session {
  id: string
  name: string
  directory: string
  branch: string
  status: SessionStatus
  agentId: string | null
  repoId?: string
  issueNumber?: number
  issueTitle?: string
  // Review session fields
  sessionType?: 'default' | 'review'
  prNumber?: number
  prTitle?: string
  prUrl?: string
  prBaseBranch?: string
  // Per-session UI state (persisted) - generic panel visibility
  panelVisibility: PanelVisibility
  // Legacy fields kept for backwards compat - computed from panelVisibility
  showAgentTerminal: boolean
  showUserTerminal: boolean
  showExplorer: boolean
  showFileViewer: boolean
  showDiff: boolean
  selectedFilePath: string | null
  fileViewerPosition: FileViewerPosition
  layoutSizes: LayoutSizes
  explorerFilter: ExplorerFilter
  // Agent monitoring state (runtime only, not persisted)
  lastMessage: string | null
  lastMessageTime: number | null
  isUnread: boolean
  // Agent PTY ID (runtime only, set by Terminal.tsx)
  agentPtyId?: string
  // Recently opened files (runtime, most recent first)
  recentFiles: string[]
  // User terminal tabs (persisted)
  terminalTabs: TerminalTabsState
  // Direct push to main tracking (persisted)
  pushedToMainAt?: number  // Timestamp when branch was pushed to main
  pushedToMainCommit?: string  // The HEAD commit when pushed (to detect new changes)
  // Branch status (runtime, derived)
  branchStatus: BranchStatus
  // PR state tracking (persisted)
  lastKnownPrState?: PrState
  lastKnownPrNumber?: number
  lastKnownPrUrl?: string
}

// Default layout sizes
const DEFAULT_LAYOUT_SIZES: LayoutSizes = {
  explorerWidth: 256, // 16rem = 256px
  fileViewerSize: 300,
  userTerminalHeight: 192, // 12rem = 192px
  diffPanelWidth: 320, // 20rem = 320px
  reviewPanelWidth: 320,
}

const DEFAULT_SIDEBAR_WIDTH = 224 // 14rem = 224px

// Default terminal tabs - starts with one tab
const createDefaultTerminalTabs = (): TerminalTabsState => {
  const id = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  return {
    tabs: [{ id, name: 'Terminal' }],
    activeTabId: id,
  }
}

// Default panel visibility for new sessions
const DEFAULT_PANEL_VISIBILITY: PanelVisibility = {
  [PANEL_IDS.AGENT_TERMINAL]: true,
  [PANEL_IDS.USER_TERMINAL]: false,
  [PANEL_IDS.EXPLORER]: false,
  [PANEL_IDS.FILE_VIEWER]: false,
}

// Global panel visibility (sidebar, settings)
const DEFAULT_GLOBAL_PANEL_VISIBILITY: PanelVisibility = {
  [PANEL_IDS.SIDEBAR]: true,
  [PANEL_IDS.SETTINGS]: false,
}

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null
  isLoading: boolean
  // Global panel state
  showSidebar: boolean
  showSettings: boolean
  sidebarWidth: number
  toolbarPanels: string[]
  globalPanelVisibility: PanelVisibility

  // Actions
  loadSessions: (profileId?: string) => Promise<void>
  addSession: (directory: string, agentId: string | null, extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; name?: string; sessionType?: 'default' | 'review'; prNumber?: number; prTitle?: string; prUrl?: string; prBaseBranch?: string }) => Promise<void>
  removeSession: (id: string) => Promise<void>
  setActiveSession: (id: string | null) => void
  updateSessionBranch: (id: string, branch: string) => void
  refreshAllBranches: () => Promise<void>
  // Generic panel actions
  togglePanel: (sessionId: string, panelId: string) => void
  toggleGlobalPanel: (panelId: string) => void
  setPanelVisibility: (sessionId: string, panelId: string, visible: boolean) => void
  setToolbarPanels: (panels: string[]) => void
  // UI state actions (backwards compat aliases)
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  toggleAgentTerminal: (id: string) => void
  toggleUserTerminal: (id: string) => void
  toggleExplorer: (id: string) => void
  toggleFileViewer: (id: string) => void
  selectFile: (id: string, filePath: string, openInDiffMode?: boolean) => void
  setFileViewerPosition: (id: string, position: FileViewerPosition) => void
  updateLayoutSize: (id: string, key: keyof LayoutSizes, value: number) => void
  setExplorerFilter: (id: string, filter: ExplorerFilter) => void
  // Agent monitoring actions
  updateAgentMonitor: (id: string, update: { status?: SessionStatus; lastMessage?: string }) => void
  markSessionRead: (id: string) => void
  // Terminal tab actions
  addTerminalTab: (sessionId: string, name?: string) => string
  removeTerminalTab: (sessionId: string, tabId: string) => void
  renameTerminalTab: (sessionId: string, tabId: string, name: string) => void
  reorderTerminalTabs: (sessionId: string, tabs: TerminalTab[]) => void
  setActiveTerminalTab: (sessionId: string, tabId: string) => void
  closeOtherTerminalTabs: (sessionId: string, tabId: string) => void
  closeTerminalTabsToRight: (sessionId: string, tabId: string) => void
  // Agent PTY tracking (runtime only)
  setAgentPtyId: (sessionId: string, ptyId: string) => void
  // Direct push to main tracking
  recordPushToMain: (sessionId: string, commitHash: string) => void
  clearPushToMain: (sessionId: string) => void
  // Branch status actions
  updateBranchStatus: (sessionId: string, status: BranchStatus) => void
  updatePrState: (sessionId: string, prState: PrState, prNumber?: number, prUrl?: string) => void
}

const generateId = () => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Helper to sync legacy fields from panelVisibility
function syncLegacyFields(session: Session): Session {
  return {
    ...session,
    showAgentTerminal: session.panelVisibility[PANEL_IDS.AGENT_TERMINAL] ?? true,
    showUserTerminal: session.panelVisibility[PANEL_IDS.USER_TERMINAL] ?? false,
    showExplorer: session.panelVisibility[PANEL_IDS.EXPLORER] ?? false,
    showFileViewer: session.panelVisibility[PANEL_IDS.FILE_VIEWER] ?? false,
  }
}

// Helper to create panelVisibility from legacy fields
function createPanelVisibilityFromLegacy(data: {
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

// Current profile ID for saves - set by loadSessions
let currentProfileId: string | undefined

// Debounced save to avoid too many writes during dragging
let saveTimeout: ReturnType<typeof setTimeout> | null = null
const debouncedSave = async (
  sessions: Session[],
  globalPanelVisibility: PanelVisibility,
  sidebarWidth: number,
  toolbarPanels: string[]
) => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
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
        // PR state tracking
        lastKnownPrState: s.lastKnownPrState,
        lastKnownPrNumber: s.lastKnownPrNumber,
        lastKnownPrUrl: s.lastKnownPrUrl,
      })),
      // Global state
      showSidebar: globalPanelVisibility[PANEL_IDS.SIDEBAR] ?? true,
      sidebarWidth,
      toolbarPanels,
    })
  }, 500)
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isLoading: true,
  showSidebar: true,
  showSettings: false,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  toolbarPanels: [...DEFAULT_TOOLBAR_PANELS],
  globalPanelVisibility: { ...DEFAULT_GLOBAL_PANEL_VISIBILITY },

  loadSessions: async (profileId?: string) => {
    if (profileId !== undefined) {
      currentProfileId = profileId
    }
    try {
      const config = await window.config.load(currentProfileId)
      const sessions: Session[] = []

      for (const sessionData of config.sessions) {
        const branch = await window.git.getBranch(sessionData.directory)
        const panelVisibility = createPanelVisibilityFromLegacy(sessionData)

        const session: Session = {
          id: sessionData.id,
          name: sessionData.name,
          directory: sessionData.directory,
          branch,
          status: 'idle',
          agentId: sessionData.agentId ?? null,
          repoId: sessionData.repoId,
          issueNumber: sessionData.issueNumber,
          issueTitle: sessionData.issueTitle,
          sessionType: sessionData.sessionType,
          prNumber: sessionData.prNumber,
          prTitle: sessionData.prTitle,
          prUrl: sessionData.prUrl,
          prBaseBranch: sessionData.prBaseBranch,
          // New panel visibility system
          panelVisibility,
          // Legacy fields (synced from panelVisibility)
          showAgentTerminal: panelVisibility[PANEL_IDS.AGENT_TERMINAL] ?? true,
          showUserTerminal: panelVisibility[PANEL_IDS.USER_TERMINAL] ?? false,
          showExplorer: panelVisibility[PANEL_IDS.EXPLORER] ?? false,
          showFileViewer: panelVisibility[PANEL_IDS.FILE_VIEWER] ?? false,
          showDiff: sessionData.showDiff ?? false,
          selectedFilePath: null,
          fileViewerPosition: sessionData.fileViewerPosition ?? 'top',
          layoutSizes: sessionData.layoutSizes ?? { ...DEFAULT_LAYOUT_SIZES },
          explorerFilter: sessionData.explorerFilter === 'all' ? 'files'
            : sessionData.explorerFilter === 'changed' ? 'source-control'
            : sessionData.explorerFilter ?? 'files',
          // Runtime monitoring state
          lastMessage: null,
          lastMessageTime: null,
          isUnread: false,
          // Recent files
          recentFiles: [],
          // Terminal tabs
          terminalTabs: sessionData.terminalTabs ?? createDefaultTerminalTabs(),
          // Push to main tracking
          pushedToMainAt: sessionData.pushedToMainAt,
          pushedToMainCommit: sessionData.pushedToMainCommit,
          // Branch status
          branchStatus: 'in-progress',
          lastKnownPrState: sessionData.lastKnownPrState,
          lastKnownPrNumber: sessionData.lastKnownPrNumber,
          lastKnownPrUrl: sessionData.lastKnownPrUrl,
        }
        sessions.push(session)
      }

      const globalPanelVisibility = {
        [PANEL_IDS.SIDEBAR]: config.showSidebar ?? true,
        [PANEL_IDS.SETTINGS]: false,
      }

      set({
        sessions,
        activeSessionId: sessions.length > 0 ? sessions[0].id : null,
        isLoading: false,
        showSidebar: config.showSidebar ?? true,
        sidebarWidth: config.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH,
        toolbarPanels: config.toolbarPanels ?? [...DEFAULT_TOOLBAR_PANELS],
        globalPanelVisibility,
      })
    } catch {
      set({ sessions: [], activeSessionId: null, isLoading: false })
    }
  },

  addSession: async (directory: string, agentId: string | null, extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; name?: string; sessionType?: 'default' | 'review'; prNumber?: number; prTitle?: string; prUrl?: string; prBaseBranch?: string }) => {
    const isGitRepo = await window.git.isGitRepo(directory)
    if (!isGitRepo) {
      throw new Error('Selected directory is not a git repository')
    }

    const branch = await window.git.getBranch(directory)
    const name = extra?.name || basename(directory)
    const id = generateId()

    const panelVisibility = { ...DEFAULT_PANEL_VISIBILITY }
    // Auto-show review panel for review sessions
    if (extra?.sessionType === 'review') {
      panelVisibility[PANEL_IDS.REVIEW] = true
    }
    const newSession: Session = {
      id,
      name,
      directory,
      branch,
      status: 'idle',
      agentId,
      ...extra,
      panelVisibility,
      showAgentTerminal: true,
      showUserTerminal: false,
      showExplorer: false,
      showFileViewer: false,
      showDiff: false,
      selectedFilePath: null,
      fileViewerPosition: 'top',
      layoutSizes: { ...DEFAULT_LAYOUT_SIZES },
      explorerFilter: 'files',
      // Runtime monitoring state
      lastMessage: null,
      lastMessageTime: null,
      isUnread: false,
      // Recent files
      recentFiles: [],
      // Terminal tabs
      terminalTabs: createDefaultTerminalTabs(),
      // Branch status
      branchStatus: 'in-progress',
    }

    const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const updatedSessions = [...sessions, newSession]

    // Auto-add review to toolbar for review sessions
    let updatedToolbarPanels = toolbarPanels
    if (extra?.sessionType === 'review' && !toolbarPanels.includes(PANEL_IDS.REVIEW)) {
      // Insert before settings (last item)
      const settingsIdx = toolbarPanels.indexOf(PANEL_IDS.SETTINGS)
      updatedToolbarPanels = [...toolbarPanels]
      if (settingsIdx >= 0) {
        updatedToolbarPanels.splice(settingsIdx, 0, PANEL_IDS.REVIEW)
      } else {
        updatedToolbarPanels.push(PANEL_IDS.REVIEW)
      }
      set({ toolbarPanels: updatedToolbarPanels })
    }

    set({
      sessions: updatedSessions,
      activeSessionId: id,
    })

    debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, updatedToolbarPanels)
  },

  removeSession: async (id: string) => {
    const { sessions, activeSessionId, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const updatedSessions = sessions.filter((s) => s.id !== id)

    let newActiveId = activeSessionId
    if (activeSessionId === id) {
      newActiveId = updatedSessions.length > 0 ? updatedSessions[0].id : null
    }

    set({
      sessions: updatedSessions,
      activeSessionId: newActiveId,
    })

    debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
  },

  setActiveSession: (id: string | null) => {
    set({ activeSessionId: id })
  },

  updateSessionBranch: (id: string, branch: string) => {
    const { sessions } = get()
    set({
      sessions: sessions.map((s) => (s.id === id ? { ...s, branch } : s)),
    })
  },

  refreshAllBranches: async () => {
    const { sessions, updateSessionBranch } = get()
    for (const session of sessions) {
      const branch = await window.git.getBranch(session.directory)
      if (branch !== session.branch) {
        updateSessionBranch(session.id, branch)
      }
    }
  },

  // Generic panel toggle for session-specific panels
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

  // Toggle global panels (sidebar, settings)
  toggleGlobalPanel: (panelId: string) => {
    const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const newVisibility = {
      ...globalPanelVisibility,
      [panelId]: !globalPanelVisibility[panelId],
    }
    set({
      globalPanelVisibility: newVisibility,
      // Keep legacy fields in sync
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

  // Legacy toggle functions - now call generic toggle
  toggleSidebar: () => {
    get().toggleGlobalPanel(PANEL_IDS.SIDEBAR)
  },

  setSidebarWidth: (width: number) => {
    const { sessions, globalPanelVisibility, toolbarPanels } = get()
    set({ sidebarWidth: width })
    debouncedSave(sessions, globalPanelVisibility, width, toolbarPanels)
  },

  toggleAgentTerminal: (id: string) => {
    get().togglePanel(id, PANEL_IDS.AGENT_TERMINAL)
  },

  toggleUserTerminal: (id: string) => {
    get().togglePanel(id, PANEL_IDS.USER_TERMINAL)
  },

  toggleExplorer: (id: string) => {
    get().togglePanel(id, PANEL_IDS.EXPLORER)
  },

  toggleFileViewer: (id: string) => {
    get().togglePanel(id, PANEL_IDS.FILE_VIEWER)
  },

  selectFile: (id: string, filePath: string) => {
    const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const updatedSessions = sessions.map((s) => {
      if (s.id !== id) return s
      const newVisibility = {
        ...s.panelVisibility,
        [PANEL_IDS.FILE_VIEWER]: true,
      }
      // Track in recent files (move to front, cap at 50)
      const recentFiles = [filePath, ...(s.recentFiles || []).filter(f => f !== filePath)].slice(0, 50)
      return syncLegacyFields({
        ...s,
        selectedFilePath: filePath,
        panelVisibility: newVisibility,
        recentFiles,
      })
    })
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
  },

  setFileViewerPosition: (id: string, position: FileViewerPosition) => {
    const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === id ? { ...s, fileViewerPosition: position } : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
  },

  updateLayoutSize: (id: string, key: keyof LayoutSizes, value: number) => {
    const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === id ? { ...s, layoutSizes: { ...s.layoutSizes, [key]: value } } : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
  },

  setExplorerFilter: (id: string, filter: ExplorerFilter) => {
    const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === id ? { ...s, explorerFilter: filter } : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
  },

  updateAgentMonitor: (id: string, update: { status?: SessionStatus; lastMessage?: string }) => {
    const { sessions } = get()
    const updatedSessions = sessions.map((s) => {
      if (s.id !== id) return s
      const changes: Partial<Session> = {}
      if (update.status !== undefined) {
        changes.status = update.status
      }
      if (update.lastMessage !== undefined) {
        changes.lastMessage = update.lastMessage
        changes.lastMessageTime = Date.now()
      }
      // Mark as unread when transitioning from working to idle
      // This signals "agent finished doing something" so the user knows to check results
      if (update.status === 'idle' && s.status === 'working') {
        changes.isUnread = true
      }
      return { ...s, ...changes }
    })
    set({ sessions: updatedSessions })
    // Don't persist runtime monitoring state
  },

  markSessionRead: (id: string) => {
    const { sessions } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === id ? { ...s, isUnread: false } : s
    )
    set({ sessions: updatedSessions })
    // Don't persist runtime monitoring state
  },

  // Terminal tab actions
  addTerminalTab: (sessionId: string, name?: string) => {
    const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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

  setAgentPtyId: (sessionId: string, ptyId: string) => {
    const { sessions } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === sessionId ? { ...s, agentPtyId: ptyId } : s
    )
    set({ sessions: updatedSessions })
    // Don't persist - runtime only
  },

  recordPushToMain: (sessionId: string, commitHash: string) => {
    const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === sessionId
        ? { ...s, pushedToMainAt: Date.now(), pushedToMainCommit: commitHash }
        : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
  },

  clearPushToMain: (sessionId: string) => {
    const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === sessionId
        ? { ...s, pushedToMainAt: undefined, pushedToMainCommit: undefined }
        : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
  },

  updateBranchStatus: (sessionId: string, status: BranchStatus) => {
    const { sessions } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === sessionId ? { ...s, branchStatus: status } : s
    )
    set({ sessions: updatedSessions })
    // Runtime only - don't persist
  },

  updatePrState: (sessionId: string, prState: PrState, prNumber?: number, prUrl?: string) => {
    const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === sessionId
        ? {
            ...s,
            lastKnownPrState: prState,
            lastKnownPrNumber: prNumber ?? s.lastKnownPrNumber,
            lastKnownPrUrl: prUrl ?? s.lastKnownPrUrl,
          }
        : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
  },
}))
