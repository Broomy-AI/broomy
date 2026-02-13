import type { Session, PanelVisibility, BranchStatus, PrState } from './sessions'
import { debouncedSave } from './sessionPersistence'

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
}>) => void

export function createBranchActions(get: StoreGet, set: StoreSet) {
  return {
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
      if (!session || session.hasHadCommits) return
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
  }
}
