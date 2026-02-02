import { create } from 'zustand'
import { basename } from 'path-browserify'

export type SessionStatus = 'working' | 'waiting' | 'idle' | 'error'
export type FileViewerPosition = 'top' | 'left'

export interface LayoutSizes {
  explorerWidth: number
  fileViewerSize: number // height when top, width when left
  userTerminalHeight: number
  diffPanelWidth: number
}

export type ExplorerFilter = 'all' | 'changed'

export interface Session {
  id: string
  name: string
  directory: string
  branch: string
  status: SessionStatus
  agentId: string | null
  // Per-session UI state (persisted)
  showAgentTerminal: boolean
  showUserTerminal: boolean
  showExplorer: boolean
  showFileViewer: boolean
  showDiff: boolean
  selectedFilePath: string | null
  fileViewerPosition: FileViewerPosition
  layoutSizes: LayoutSizes
  explorerFilter: ExplorerFilter
}

// Default layout sizes
const DEFAULT_LAYOUT_SIZES: LayoutSizes = {
  explorerWidth: 256, // 16rem = 256px
  fileViewerSize: 300,
  userTerminalHeight: 192, // 12rem = 192px
  diffPanelWidth: 320, // 20rem = 320px
}

const DEFAULT_SIDEBAR_WIDTH = 224 // 14rem = 224px

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null
  isLoading: boolean
  showSidebar: boolean
  sidebarWidth: number

  // Actions
  loadSessions: () => Promise<void>
  addSession: (directory: string, agentId: string | null) => Promise<void>
  removeSession: (id: string) => Promise<void>
  setActiveSession: (id: string | null) => void
  updateSessionBranch: (id: string, branch: string) => void
  refreshAllBranches: () => Promise<void>
  // UI state actions
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
}

const generateId = () => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Debounced save to avoid too many writes during dragging
let saveTimeout: ReturnType<typeof setTimeout> | null = null
const debouncedSave = async (sessions: Session[], showSidebar: boolean, sidebarWidth: number) => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    const config = await window.config.load()
    await window.config.save({
      agents: config.agents,
      sessions: sessions.map((s) => ({
        id: s.id,
        name: s.name,
        directory: s.directory,
        agentId: s.agentId,
        showAgentTerminal: s.showAgentTerminal,
        showUserTerminal: s.showUserTerminal,
        showExplorer: s.showExplorer,
        showFileViewer: s.showFileViewer,
        showDiff: s.showDiff,
        fileViewerPosition: s.fileViewerPosition,
        layoutSizes: s.layoutSizes,
        explorerFilter: s.explorerFilter,
      })),
      showSidebar,
      sidebarWidth,
    })
  }, 500)
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isLoading: true,
  showSidebar: true,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,

  loadSessions: async () => {
    try {
      const config = await window.config.load()
      const sessions: Session[] = []

      for (const sessionData of config.sessions) {
        const branch = await window.git.getBranch(sessionData.directory)
        sessions.push({
          id: sessionData.id,
          name: sessionData.name,
          directory: sessionData.directory,
          branch,
          status: 'idle',
          agentId: sessionData.agentId ?? null,
          // Restore UI state from config or use defaults
          showAgentTerminal: sessionData.showAgentTerminal ?? true,
          showUserTerminal: sessionData.showUserTerminal ?? false,
          showExplorer: sessionData.showExplorer ?? false,
          showFileViewer: sessionData.showFileViewer ?? false,
          showDiff: sessionData.showDiff ?? false,
          selectedFilePath: null,
          fileViewerPosition: sessionData.fileViewerPosition ?? 'top',
          layoutSizes: sessionData.layoutSizes ?? { ...DEFAULT_LAYOUT_SIZES },
          explorerFilter: sessionData.explorerFilter ?? 'all',
        })
      }

      set({
        sessions,
        activeSessionId: sessions.length > 0 ? sessions[0].id : null,
        isLoading: false,
        showSidebar: config.showSidebar ?? true,
        sidebarWidth: config.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH,
      })
    } catch {
      set({ sessions: [], activeSessionId: null, isLoading: false })
    }
  },

  addSession: async (directory: string, agentId: string | null) => {
    const isGitRepo = await window.git.isGitRepo(directory)
    if (!isGitRepo) {
      throw new Error('Selected directory is not a git repository')
    }

    const branch = await window.git.getBranch(directory)
    const name = basename(directory)
    const id = generateId()

    const newSession: Session = {
      id,
      name,
      directory,
      branch,
      status: 'idle',
      agentId,
      showAgentTerminal: true,
      showUserTerminal: false,
      showExplorer: false,
      showFileViewer: false,
      showDiff: false,
      selectedFilePath: null,
      fileViewerPosition: 'top',
      layoutSizes: { ...DEFAULT_LAYOUT_SIZES },
      explorerFilter: 'all',
    }

    const { sessions, showSidebar, sidebarWidth } = get()
    const updatedSessions = [...sessions, newSession]

    set({
      sessions: updatedSessions,
      activeSessionId: id,
    })

    debouncedSave(updatedSessions, showSidebar, sidebarWidth)
  },

  removeSession: async (id: string) => {
    const { sessions, activeSessionId, showSidebar, sidebarWidth } = get()
    const updatedSessions = sessions.filter((s) => s.id !== id)

    let newActiveId = activeSessionId
    if (activeSessionId === id) {
      newActiveId = updatedSessions.length > 0 ? updatedSessions[0].id : null
    }

    set({
      sessions: updatedSessions,
      activeSessionId: newActiveId,
    })

    debouncedSave(updatedSessions, showSidebar, sidebarWidth)
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

  toggleSidebar: () => {
    const { showSidebar, sessions, sidebarWidth } = get()
    const newShowSidebar = !showSidebar
    set({ showSidebar: newShowSidebar })
    debouncedSave(sessions, newShowSidebar, sidebarWidth)
  },

  setSidebarWidth: (width: number) => {
    const { sessions, showSidebar } = get()
    set({ sidebarWidth: width })
    debouncedSave(sessions, showSidebar, width)
  },

  toggleAgentTerminal: (id: string) => {
    const { sessions, showSidebar, sidebarWidth } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === id ? { ...s, showAgentTerminal: !s.showAgentTerminal } : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, showSidebar, sidebarWidth)
  },

  toggleUserTerminal: (id: string) => {
    const { sessions, showSidebar, sidebarWidth } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === id ? { ...s, showUserTerminal: !s.showUserTerminal } : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, showSidebar, sidebarWidth)
  },

  toggleExplorer: (id: string) => {
    const { sessions, showSidebar, sidebarWidth } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === id ? { ...s, showExplorer: !s.showExplorer } : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, showSidebar, sidebarWidth)
  },

  toggleFileViewer: (id: string) => {
    const { sessions, showSidebar, sidebarWidth } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === id ? { ...s, showFileViewer: !s.showFileViewer } : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, showSidebar, sidebarWidth)
  },

  selectFile: (id: string, filePath: string) => {
    const { sessions, showSidebar, sidebarWidth } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === id ? { ...s, selectedFilePath: filePath, showFileViewer: true } : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, showSidebar, sidebarWidth)
  },

  setFileViewerPosition: (id: string, position: FileViewerPosition) => {
    const { sessions, showSidebar, sidebarWidth } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === id ? { ...s, fileViewerPosition: position } : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, showSidebar, sidebarWidth)
  },

  updateLayoutSize: (id: string, key: keyof LayoutSizes, value: number) => {
    const { sessions, showSidebar, sidebarWidth } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === id ? { ...s, layoutSizes: { ...s.layoutSizes, [key]: value } } : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, showSidebar, sidebarWidth)
  },

  setExplorerFilter: (id: string, filter: ExplorerFilter) => {
    const { sessions, showSidebar, sidebarWidth } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === id ? { ...s, explorerFilter: filter } : s
    )
    set({ sessions: updatedSessions })
    debouncedSave(updatedSessions, showSidebar, sidebarWidth)
  },
}))
