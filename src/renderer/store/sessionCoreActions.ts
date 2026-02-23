import { basename } from 'path-browserify'
import { useErrorStore } from './errors'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/types'
import type { Session, PanelVisibility, TerminalTabsState } from './sessions'
import {
  debouncedSave,
  createPanelVisibilityFromLegacy,
  setCurrentProfileId,
  getCurrentProfileId,
  setLoadedSessionCount,
} from './sessionPersistence'

export const DEFAULT_SIDEBAR_WIDTH = 224 // 14rem = 224px

// Default layout sizes
const DEFAULT_LAYOUT_SIZES = {
  explorerWidth: 256, // 16rem = 256px
  fileViewerSize: 300,
  userTerminalHeight: 192, // 12rem = 192px
  diffPanelWidth: 320, // 20rem = 320px
  tutorialPanelWidth: 320,
}

// Default panel visibility for new sessions
const DEFAULT_PANEL_VISIBILITY: PanelVisibility = {
  [PANEL_IDS.EXPLORER]: true,
  [PANEL_IDS.FILE_VIEWER]: false,
}

// Panel visibility for review sessions
const REVIEW_PANEL_VISIBILITY: PanelVisibility = {
  [PANEL_IDS.EXPLORER]: true,
  [PANEL_IDS.FILE_VIEWER]: false,
}

// Default terminal tabs - starts with one user tab, agent tab selected by default (null → agent)
const createDefaultTerminalTabs = (): TerminalTabsState => {
  const id = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  return {
    tabs: [{ id, name: 'Terminal' }],
    activeTabId: null,
  }
}

// Ensure saved toolbar panels include all known panels (e.g. 'review' added later).
function migrateToolbarPanels(saved: string[] | undefined): string[] {
  if (!saved || saved.length === 0) return [...DEFAULT_TOOLBAR_PANELS]
  const knownIds = new Set(DEFAULT_TOOLBAR_PANELS)
  // Remove stale panel IDs that no longer exist (e.g. agentTerminal, userTerminal)
  const filtered = saved.filter((p) => knownIds.has(p))
  if (filtered.length === 0) return [...DEFAULT_TOOLBAR_PANELS]
  const missing = DEFAULT_TOOLBAR_PANELS.filter((p) => !filtered.includes(p))
  if (missing.length === 0) return filtered
  const result = [...filtered]
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

const generateId = () => `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

type StoreGet = () => {
  sessions: Session[]
  activeSessionId: string | null
  globalPanelVisibility: PanelVisibility
  sidebarWidth: number
  toolbarPanels: string[]
}
type StoreSet = (partial: Partial<{
  sessions: Session[]
  activeSessionId: string | null
  isLoading: boolean
  showSidebar: boolean
  sidebarWidth: number
  toolbarPanels: string[]
  globalPanelVisibility: PanelVisibility
}>) => void

export type DuplicateSessionResult = {
  existingSessionId: string
  existingSessionName: string
  wasArchived: boolean
}

function handleDuplicateSession(
  duplicate: Session,
  get: StoreGet,
  set: StoreSet,
): DuplicateSessionResult {
  const wasArchived = duplicate.isArchived
  if (wasArchived) {
    const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
    const updatedSessions = sessions.map((s) =>
      s.id === duplicate.id ? { ...s, isArchived: false } : s
    )
    set({ sessions: updatedSessions, activeSessionId: duplicate.id })
    debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
  } else {
    set({ activeSessionId: duplicate.id })
  }
  return { existingSessionId: duplicate.id, existingSessionName: duplicate.name, wasArchived }
}

export function createCoreActions(get: StoreGet, set: StoreSet) {
  const updateSessionBranch = (id: string, branch: string) => {
    const { sessions } = get()
    set({
      sessions: sessions.map((s) => (s.id === id ? { ...s, branch } : s)),
    })
  }

  return {
    loadSessions: async (profileId?: string) => {
      if (profileId !== undefined) {
        setCurrentProfileId(profileId)
      }
      try {
        const config = await window.config.load(getCurrentProfileId())
        const sessions: Session[] = []

        for (const sessionData of config.sessions) {
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
            issueUrl: sessionData.issueUrl,
            sessionType: sessionData.sessionType,
            prNumber: sessionData.prNumber,
            prTitle: sessionData.prTitle,
            prUrl: sessionData.prUrl,
            prBaseBranch: sessionData.prBaseBranch,
            panelVisibility,
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
            lastMessage: null,
            lastMessageTime: null,
            isUnread: false,
            workingStartTime: null,
            recentFiles: [],
            terminalTabs: (sessionData.terminalTabs as TerminalTabsState | undefined) ?? createDefaultTerminalTabs(),
            pushedToMainAt: sessionData.pushedToMainAt,
            pushedToMainCommit: sessionData.pushedToMainCommit,
            hasHadCommits: sessionData.hasHadCommits,
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
          activeSessionId: (sessions.find((s) => !s.isArchived) ?? (sessions[0] as Session | undefined))?.id ?? null,
          isLoading: false,
          showSidebar: config.showSidebar ?? true,
          sidebarWidth: config.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH,
          toolbarPanels: migrateToolbarPanels(config.toolbarPanels),
          globalPanelVisibility,
        })
      } catch (err) {
        console.warn('[sessions] Failed to load sessions config:', err)
        useErrorStore.getState().addError('Failed to load session config')
        set({ sessions: [], activeSessionId: null, isLoading: false })
      }
    },

    addSession: async (directory: string, agentId: string | null, extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; issueUrl?: string; name?: string; sessionType?: 'default' | 'review'; prNumber?: number; prTitle?: string; prUrl?: string; prBaseBranch?: string }): Promise<DuplicateSessionResult | undefined> => {
      const isGitRepo = await window.git.isGitRepo(directory)
      if (!isGitRepo) {
        throw new Error('Selected directory is not a git repository')
      }

      const branch = await window.git.getBranch(directory)

      // Check for duplicate sessions (active or archived) for the same branch in the same repo
      const existingSessions = get().sessions
      const duplicate = existingSessions.find((s) =>
        s.branch === branch &&
        (s.directory === directory || (extra?.repoId && s.repoId === extra.repoId))
      )
      if (duplicate) {
        return handleDuplicateSession(duplicate, get, set)
      }

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
        showExplorer: panelVisibility[PANEL_IDS.EXPLORER] ?? false,
        showFileViewer: panelVisibility[PANEL_IDS.FILE_VIEWER] ?? false,
        showDiff: false,
        selectedFilePath: null,
        planFilePath: null,
        fileViewerPosition: 'top',
        layoutSizes: { ...DEFAULT_LAYOUT_SIZES },
        explorerFilter: isReview ? 'review' : 'files',
        lastMessage: null,
        lastMessageTime: null,
        isUnread: false,
        workingStartTime: null,
        recentFiles: [],
        terminalTabs: createDefaultTerminalTabs(),
        branchStatus: 'in-progress',
        isArchived: false,
      }

      const { sessions, globalPanelVisibility, sidebarWidth, toolbarPanels } = get()
      const updatedSessions = [...sessions, newSession]

      set({
        sessions: updatedSessions,
        activeSessionId: id,
      })

      debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
    },

    removeSession: (id: string) => {
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

    updateSessionBranch,

    refreshAllBranches: async () => {
      const { sessions } = get()
      for (const session of sessions) {
        const branch = await window.git.getBranch(session.directory)
        if (branch !== session.branch) {
          updateSessionBranch(session.id, branch)
        }
      }
    },
  }
}
