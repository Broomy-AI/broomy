/**
 * Session state management -- the largest and most central Zustand store.
 *
 * Each session represents an AI coding agent working in a git repository. The store
 * manages session CRUD, per-session panel visibility, layout sizes, terminal tabs,
 * agent activity monitoring (working/idle/unread), branch status, PR state tracking,
 * and session archiving. State mutations are applied in-memory instantly, then
 * persisted to the config file via a 500ms debounced save to avoid excessive I/O.
 * Runtime-only fields (status, isUnread, lastMessage, branchStatus) are never written
 * to disk.
 */
import { create } from 'zustand'
import { basename } from 'path-browserify'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/types'
import type { BranchStatus, PrState } from '../utils/branchStatus'
import {
  debouncedSave,
  syncLegacyFields,
  createPanelVisibilityFromLegacy,
  setCurrentProfileId,
  getCurrentProfileId,
  setLoadedSessionCount,
} from './sessionPersistence'
import { createTerminalTabActions } from './sessionTerminalTabs'

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
  planFilePath: string | null
  fileViewerPosition: FileViewerPosition
  layoutSizes: LayoutSizes
  explorerFilter: ExplorerFilter
  // Agent monitoring state (runtime only, not persisted)
  lastMessage: string | null
  lastMessageTime: number | null
  isUnread: boolean
  workingStartTime: number | null // When the current working period began
  // Agent PTY ID (runtime only, set by Terminal.tsx)
  agentPtyId?: string
  // Recently opened files (runtime, most recent first)
  recentFiles: string[]
  // User terminal tabs (persisted)
  terminalTabs: TerminalTabsState
  // Direct push to main tracking (persisted)
  pushedToMainAt?: number  // Timestamp when branch was pushed to main
  pushedToMainCommit?: string  // The HEAD commit when pushed (to detect new changes)
  // Track whether this session has ever had commits ahead of remote (persisted)
  hasHadCommits?: boolean
  // Branch status (runtime, derived)
  branchStatus: BranchStatus
  // PR state tracking (persisted)
  lastKnownPrState?: PrState
  lastKnownPrNumber?: number
  lastKnownPrUrl?: string
  // Archive state (persisted)
  isArchived: boolean
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
  [PANEL_IDS.USER_TERMINAL]: true,
  [PANEL_IDS.EXPLORER]: true,
  [PANEL_IDS.FILE_VIEWER]: false,
}

// Panel visibility for review sessions
const REVIEW_PANEL_VISIBILITY: PanelVisibility = {
  [PANEL_IDS.AGENT_TERMINAL]: true,
  [PANEL_IDS.USER_TERMINAL]: false,
  [PANEL_IDS.EXPLORER]: false,
  [PANEL_IDS.FILE_VIEWER]: false,
  [PANEL_IDS.REVIEW]: true,
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
  setPlanFile: (id: string, path: string | null) => void
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
  markHasHadCommits: (sessionId: string) => void
  updateBranchStatus: (sessionId: string, status: BranchStatus) => void
  updatePrState: (sessionId: string, prState: PrState, prNumber?: number, prUrl?: string) => void
  // Archive actions
  archiveSession: (sessionId: string) => void
  unarchiveSession: (sessionId: string) => void
}

// Ensure saved toolbar panels include all known panels (e.g. 'review' added later).
// Returns DEFAULT_TOOLBAR_PANELS if no saved value, otherwise adds missing panels.
function migrateToolbarPanels(saved: string[] | undefined): string[] {
  if (!saved || saved.length === 0) return [...DEFAULT_TOOLBAR_PANELS]
  const missing = DEFAULT_TOOLBAR_PANELS.filter((p) => !saved.includes(p))
  if (missing.length === 0) return saved
  // Insert missing panels before settings (last item) to keep settings at the end
  const result = [...saved]
  const settingsIdx = result.indexOf(PANEL_IDS.SETTINGS)
  for (const p of missing) {
    if (settingsIdx >= 0) {
      result.splice(settingsIdx, 0, p)
    } else {
      result.push(p)
    }
  }
  return result
}

const generateId = () => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export const useSessionStore = create<SessionStore>((set, get) => {
  const terminalTabActions = createTerminalTabActions(get, set)

  return {
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
      setCurrentProfileId(profileId)
    }
    try {
      const config = await window.config.load(getCurrentProfileId())
      const sessions: Session[] = []

      for (const sessionData of config.sessions) {
        // Per-session try-catch: a single session's git failure must not
        // prevent other sessions from loading. Branch is transient data
        // refreshed on load; core session identity comes from the config.
        let branch: string
        try {
          branch = await window.git.getBranch(sessionData.directory)
        } catch {
          console.warn(
            `[sessions] Failed to get branch for session "${sessionData.name}" ` +
            `(${sessionData.directory}), using "unknown"`
          )
          branch = 'unknown'
        }
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
          planFilePath: null,
          fileViewerPosition: sessionData.fileViewerPosition ?? 'top',
          layoutSizes: { ...DEFAULT_LAYOUT_SIZES, ...(sessionData.layoutSizes ?? {}) },
          explorerFilter: sessionData.explorerFilter === 'all' ? 'files'
            : sessionData.explorerFilter === 'changed' ? 'source-control'
            : sessionData.explorerFilter ?? 'files',
          // Runtime monitoring state
          lastMessage: null,
          lastMessageTime: null,
          isUnread: false,
          workingStartTime: null,
          // Recent files
          recentFiles: [],
          // Terminal tabs
          terminalTabs: (sessionData.terminalTabs as TerminalTabsState | undefined) ?? createDefaultTerminalTabs(),
          // Push to main tracking
          pushedToMainAt: sessionData.pushedToMainAt,
          pushedToMainCommit: sessionData.pushedToMainCommit,
          // Commit tracking
          hasHadCommits: sessionData.hasHadCommits,
          // Branch status
          branchStatus: 'in-progress',
          lastKnownPrState: sessionData.lastKnownPrState,
          lastKnownPrNumber: sessionData.lastKnownPrNumber,
          lastKnownPrUrl: sessionData.lastKnownPrUrl,
          isArchived: sessionData.isArchived ?? false,
        }
        sessions.push(session)
      }

      const globalPanelVisibility = {
        [PANEL_IDS.SIDEBAR]: config.showSidebar ?? true,
        [PANEL_IDS.SETTINGS]: false,
      }

      setLoadedSessionCount(sessions.length)

      set({
        sessions,
        activeSessionId: (sessions.find((s) => !s.isArchived) ?? sessions[0])?.id ?? null,
        isLoading: false,
        showSidebar: config.showSidebar ?? true,
        sidebarWidth: config.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH,
        toolbarPanels: migrateToolbarPanels(config.toolbarPanels),
        globalPanelVisibility,
      })
    } catch (err) {
      // Config load failed entirely. Set empty UI state but do NOT update
      // loadedSessionCount — the save guard will prevent debouncedSave from
      // persisting this empty state over real data on disk.
      console.warn('[sessions] Failed to load sessions config:', err)
      set({ sessions: [], activeSessionId: null, isLoading: false })
    }
  },

  addSession: async (directory: string, agentId: string | null, extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; name?: string; sessionType?: 'default' | 'review'; prNumber?: number; prTitle?: string; prUrl?: string; prBaseBranch?: string }) => {
    const isGitRepo = await window.git.isGitRepo(directory)
    if (!isGitRepo) {
      throw new Error('Selected directory is not a git repository')
    }

    const branch = await window.git.getBranch(directory)
    let name = extra?.name || basename(directory)
    if (!extra?.name) {
      try {
        const remoteUrl = await window.git.remoteUrl(directory)
        if (remoteUrl) {
          const repoName = remoteUrl.replace(/\.git$/, '').split('/').pop()?.replace(/[^a-zA-Z0-9._-]/g, '')
          if (repoName) name = repoName
        }
      } catch {
        // Fall back to basename
      }
    }
    const id = generateId()

    const isReview = extra?.sessionType === 'review'
    const panelVisibility = isReview ? { ...REVIEW_PANEL_VISIBILITY } : { ...DEFAULT_PANEL_VISIBILITY }
    const newSession: Session = {
      id,
      name,
      directory,
      branch,
      status: 'idle',
      agentId,
      ...extra,
      panelVisibility,
      showAgentTerminal: panelVisibility[PANEL_IDS.AGENT_TERMINAL] ?? true,
      showUserTerminal: panelVisibility[PANEL_IDS.USER_TERMINAL] ?? false,
      showExplorer: panelVisibility[PANEL_IDS.EXPLORER] ?? false,
      showFileViewer: panelVisibility[PANEL_IDS.FILE_VIEWER] ?? false,
      showDiff: false,
      selectedFilePath: null,
      planFilePath: null,
      fileViewerPosition: 'top',
      layoutSizes: { ...DEFAULT_LAYOUT_SIZES },
      explorerFilter: 'files',
      // Runtime monitoring state
      lastMessage: null,
      lastMessageTime: null,
      isUnread: false,
      workingStartTime: null,
      // Recent files
      recentFiles: [],
      // Terminal tabs
      terminalTabs: createDefaultTerminalTabs(),
      // Branch status
      branchStatus: 'in-progress',
      // Archive state
      isArchived: false,
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

  setPlanFile: (id: string, path: string | null) => {
    const { sessions } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === id ? { ...s, planFilePath: path } : s
    )
    set({ sessions: updatedSessions })
    // planFilePath is runtime-only state, no need to persist
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
      // Track when working period starts
      if (update.status === 'working' && s.status !== 'working') {
        changes.workingStartTime = Date.now()
      }
      // Mark as unread when transitioning from working to idle,
      // but only if the agent was working for at least 3 seconds.
      // This filters out brief notifications (e.g. usage threshold alerts)
      // that would otherwise cause false "unread" alerts.
      if (update.status === 'idle' && s.status === 'working') {
        const workingDuration = Date.now() - (s.workingStartTime ?? Date.now())
        if (workingDuration >= 3000) {
          changes.isUnread = true
        }
        changes.workingStartTime = null
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

  // Terminal tab actions (delegated)
  ...terminalTabActions,

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

  markHasHadCommits: (sessionId: string) => {
    const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const session = sessions.find((s) => s.id === sessionId)
    if (!session || session.hasHadCommits) return // Already set
    const updatedSessions = sessions.map((s) =>
      s.id === sessionId ? { ...s, hasHadCommits: true } : s
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

  archiveSession: (sessionId: string) => {
    const { sessions, activeSessionId, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === sessionId ? { ...s, isArchived: true } : s
    )
    // If archiving the active session, switch to the next non-archived session
    let newActiveId = activeSessionId
    if (activeSessionId === sessionId) {
      const nextActive = updatedSessions.find((s) => !s.isArchived)
      newActiveId = nextActive?.id ?? null
    }
    set({ sessions: updatedSessions, activeSessionId: newActiveId })
    debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
  },

  unarchiveSession: (sessionId: string) => {
    const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === sessionId ? { ...s, isArchived: false } : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
  },
}})
