/**
 * Session store actions for branch status, PR state, and session lifecycle.
 */
import type { Session, BranchStatus, PrState } from './sessions'
import { debouncedSave } from './sessionPersistence'

type StoreGet = () => {
  sessions: Session[]
  activeSessionId: string | null
}
type StoreSet = (partial: Partial<{
  sessions: Session[]
  activeSessionId: string | null
}>) => void

export function createBranchActions(get: StoreGet, set: StoreSet) {
  return {
    markHasHadCommits: (sessionId: string) => {
      const { sessions } = get()
      const session = sessions.find((s) => s.id === sessionId)
      if (!session || session.hasHadCommits) return
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? { ...s, hasHadCommits: true } : s
      )
      set({ sessions: updatedSessions })
      debouncedSave()
    },

    updateBranchStatus: (sessionId: string, status: BranchStatus) => {
      const { sessions } = get()
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? { ...s, branchStatus: status } : s
      )
      set({ sessions: updatedSessions })
    },

    updatePrState: (sessionId: string, prState: PrState, prNumber?: number, prUrl?: string) => {
      const { sessions } = get()
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
      debouncedSave()
    },

    updateReviewStatus: (sessionId: string, reviewStatus: 'pending' | 'reviewed') => {
      const { sessions } = get()
      const session = sessions.find((s) => s.id === sessionId)
      if (!session || session.reviewStatus === reviewStatus) return
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? { ...s, reviewStatus } : s
      )
      set({ sessions: updatedSessions })
      debouncedSave()
    },

    archiveSession: (sessionId: string) => {
      const { sessions, activeSessionId } = get()
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? { ...s, isArchived: true } : s
      )
      let newActiveId = activeSessionId
      if (activeSessionId === sessionId) {
        const nextActive = updatedSessions.find((s) => !s.isArchived)
        newActiveId = nextActive?.id ?? null
      }
      set({ sessions: updatedSessions, activeSessionId: newActiveId })
      debouncedSave()
    },

    unarchiveSession: (sessionId: string) => {
      const { sessions } = get()
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? { ...s, isArchived: false } : s
      )
      set({ sessions: updatedSessions })
      debouncedSave()
    },
  }
}
