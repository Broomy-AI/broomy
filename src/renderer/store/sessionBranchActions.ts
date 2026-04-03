/**
 * Session store actions for branch status, PR state, and session lifecycle.
 */
import type { Session, BranchStatus, PrState } from './sessions'
import { computeStatusChip } from '../features/git/branchStatus'
import { debouncedSave } from './sessionPersistence'

/** Recompute statusChip from current session fields. */
function recomputeStatusChip(s: Session): Session {
  const statusChip = computeStatusChip(s.branchStatus, s.hasFeedback, s.checksStatus)
  return statusChip !== s.statusChip ? { ...s, statusChip } : s
}

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

    clearHasHadCommits: (sessionId: string) => {
      const { sessions } = get()
      const session = sessions.find((s) => s.id === sessionId)
      if (!session?.hasHadCommits) return
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? { ...s, hasHadCommits: false } : s
      )
      set({ sessions: updatedSessions })
      debouncedSave()
    },

    updateBranchStatus: (sessionId: string, status: BranchStatus) => {
      const { sessions } = get()
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? recomputeStatusChip({ ...s, branchStatus: status }) : s
      )
      set({ sessions: updatedSessions })
    },

    updateSessionBranch: (sessionId: string, branch: string) => {
      const { sessions } = get()
      const session = sessions.find((s) => s.id === sessionId)
      if (!session || session.branch === branch) return
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              branch,
              hasHadCommits: false,
              lastKnownPrState: undefined,
              lastKnownPrNumber: undefined,
              lastKnownPrUrl: undefined,
              branchStatus: 'none' as BranchStatus,
            }
          : s
      )
      set({ sessions: updatedSessions })
      debouncedSave()
    },

    updatePrState: (sessionId: string, prState: PrState, prNumber?: number, prUrl?: string) => {
      const { sessions } = get()
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              lastKnownPrState: prState,
              // When clearing PR state (null), also clear number and URL so the session
              // can start a fresh PR lifecycle.
              lastKnownPrNumber: prState === null ? undefined : (prNumber ?? s.lastKnownPrNumber),
              lastKnownPrUrl: prState === null ? undefined : (prUrl ?? s.lastKnownPrUrl),
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

    updateFeedbackStatus: (sessionId: string, hasFeedback: boolean) => {
      const { sessions } = get()
      const session = sessions.find((s) => s.id === sessionId)
      if (!session || session.hasFeedback === hasFeedback) return
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? recomputeStatusChip({ ...s, hasFeedback }) : s
      )
      set({ sessions: updatedSessions })
    },

    updateChecksStatus: (sessionId: string, checksStatus: 'passed' | 'failed' | 'pending' | 'none') => {
      const { sessions } = get()
      const session = sessions.find((s) => s.id === sessionId)
      if (!session || session.checksStatus === checksStatus) return
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? recomputeStatusChip({ ...s, checksStatus }) : s
      )
      set({ sessions: updatedSessions })
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
