/**
 * Session store actions for review status and session archiving.
 *
 * Branch status, PR state, feedback, checks, and hasHadCommits are all owned by
 * the single `refreshSession` action in sessionRefresh.ts and not written from
 * anywhere else. Keep this module narrow.
 */
import type { Session } from './sessions'
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
    updateReviewStatus: (sessionId: string, reviewStatus: 'pending' | 'reviewed') => {
      const { sessions } = get()
      const session = sessions.find((s) => s.id === sessionId)
      if (!session || session.reviewStatus === reviewStatus) return
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? recomputeStatusChip({ ...s, reviewStatus }) : s
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
