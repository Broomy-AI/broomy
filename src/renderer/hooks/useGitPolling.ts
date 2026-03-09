/**
 * Polls git status for the active session and computes branch status including ahead/behind counts and merge state.
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import type { GitStatusResult } from '../../preload/index'
import type { Session, BranchStatus } from '../store/sessions'
import type { ManagedRepo } from '../../preload/index'
import { normalizeGitStatus } from '../utils/gitStatusNormalizer'
import { computeBranchStatus } from '../utils/branchStatus'

export function useGitPolling({
  sessions,
  activeSession,
  repos,
  markHasHadCommits,
  updateBranchStatus,
}: {
  sessions: Session[]
  activeSession: Session | undefined
  repos: ManagedRepo[]
  markHasHadCommits: (sessionId: string) => void
  updateBranchStatus: (sessionId: string, status: BranchStatus) => void
}) {
  const [gitStatusBySession, setGitStatusBySession] = useState<Record<string, GitStatusResult | undefined>>({})
  const [isMergedBySession, setIsMergedBySession] = useState<Record<string, boolean | undefined>>({})

  // Fetch git status for active session
  const fetchGitStatus = useCallback(async () => {
    if (!activeSession) return
    try {
      const status = await window.git.status(activeSession.directory)
      const normalized = normalizeGitStatus(status)

      // Check if branch is merged into the default branch
      let merged = false
      let shouldMarkHasHadCommits = normalized.ahead > 0
      const isOnMain = normalized.current === 'main' || normalized.current === 'master'
      if (!isOnMain && normalized.current) {
        const repo = repos.find(r => r.id === activeSession.repoId)
        const defaultBranch = repo?.defaultBranch || 'main'
        const [mergedResult, hasBranchCommitsResult] = await Promise.all([
          window.git.isMergedInto(activeSession.directory, defaultBranch),
          window.git.hasBranchCommits(activeSession.directory, defaultBranch),
        ])
        merged = mergedResult
        // Also mark hasHadCommits if the branch has diverged from main
        if (hasBranchCommitsResult) {
          shouldMarkHasHadCommits = true
        }
      }

      // Update all state in the same synchronous block so React batches
      // them into one render. markHasHadCommits must happen AFTER the
      // await and alongside setGitStatusBySession/setIsMergedBySession —
      // otherwise the Zustand update triggers a render with stale
      // isMergedBySession data, briefly computing 'merged' for new sessions.
      setGitStatusBySession(prev => ({
        ...prev,
        [activeSession.id]: normalized
      }))
      setIsMergedBySession(prev => ({
        ...prev,
        [activeSession.id]: merged
      }))
      if (shouldMarkHasHadCommits) {
        markHasHadCommits(activeSession.id)
      }
    } catch {
      // Ignore errors
    }
  }, [activeSession?.id, activeSession?.directory, activeSession?.repoId, repos, markHasHadCommits])

  // Poll git status every 2 seconds
  useEffect(() => {
    if (activeSession) {
      void fetchGitStatus()
      const interval = setInterval(() => { void fetchGitStatus() }, 2000)
      return () => clearInterval(interval)
    }
  }, [activeSession?.id, fetchGitStatus])

  // Compute branch status whenever git status changes
  useEffect(() => {
    for (const session of sessions) {
      const gitStatus = gitStatusBySession[session.id]
      if (!gitStatus) continue

      const status = computeBranchStatus({
        uncommittedFiles: gitStatus.files.length,
        ahead: gitStatus.ahead,
        hasTrackingBranch: !!gitStatus.tracking,
        isOnMainBranch: gitStatus.current === 'main' || gitStatus.current === 'master',
        isMergedToMain: isMergedBySession[session.id] ?? false,
        hasHadCommits: session.hasHadCommits ?? false,
        lastKnownPrState: session.lastKnownPrState,
      })

      if (status !== session.branchStatus) {
        updateBranchStatus(session.id, status)
      }
    }
  }, [gitStatusBySession, isMergedBySession, sessions, updateBranchStatus])

  // Get git status for the selected file
  const selectedFileStatus = useMemo(() => {
    if (!activeSession?.selectedFilePath || !activeSession.directory) return null
    const statusResult = gitStatusBySession[activeSession.id]
    const files = statusResult?.files || []
    const relativePath = activeSession.selectedFilePath.replace(`${activeSession.directory  }/`, '')
    const fileStatus = files.find(s => s.path === relativePath)
    return fileStatus?.status ?? null
  }, [activeSession?.selectedFilePath, activeSession?.directory, activeSession?.id, gitStatusBySession])

  // Get current git status for the active session
  const activeSessionGitStatusResult = activeSession ? (gitStatusBySession[activeSession.id] || null) : null
  const activeSessionGitStatus = activeSessionGitStatusResult?.files || []

  return {
    gitStatusBySession,
    activeSessionGitStatus,
    activeSessionGitStatusResult,
    selectedFileStatus,
    fetchGitStatus,
  }
}
