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
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/types'
import type { BranchStatus, PrState } from '../utils/branchStatus'
import {
  debouncedSave,
  syncLegacyFields,
} from './sessionPersistence'
import { createTerminalTabActions } from './sessionTerminalTabs'
import { createPanelActions } from './sessionPanelActions'
import { createBranchActions } from './sessionBranchActions'
import { createCoreActions, DEFAULT_SIDEBAR_WIDTH } from './sessionCoreActions'

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
  tutorialPanelWidth: number
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

// Global panel visibility (sidebar, settings, tutorial)
const DEFAULT_GLOBAL_PANEL_VISIBILITY: PanelVisibility = {
  [PANEL_IDS.SIDEBAR]: true,
  [PANEL_IDS.SETTINGS]: false,
  [PANEL_IDS.TUTORIAL]: false,
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
  removeSession: (id: string) => void
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

export const useSessionStore = create<SessionStore>((set, get) => {
  const terminalTabActions = createTerminalTabActions(get, set)
  const panelActions = createPanelActions(get, set)
  const branchActions = createBranchActions(get, set)
  const coreActions = createCoreActions(get, set)

  return {
  sessions: [],
  activeSessionId: null,
  isLoading: true,
  showSidebar: true,
  showSettings: false,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  toolbarPanels: [...DEFAULT_TOOLBAR_PANELS],
  globalPanelVisibility: { ...DEFAULT_GLOBAL_PANEL_VISIBILITY },

  // Core actions (delegated)
  ...coreActions,

  // Panel actions (delegated)
  ...panelActions,

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
      const recentFiles = [filePath, ...s.recentFiles.filter(f => f !== filePath)].slice(0, 50)
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

  // Branch & lifecycle actions (delegated)
  ...branchActions,
}})
