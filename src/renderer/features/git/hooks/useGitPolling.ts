/**
 * Polls git status for the active session and computes branch status including ahead/behind counts and merge state.
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import type { GitStatusResult } from '../../../../preload/index'
import type { Session, BranchStatus } from '../../../store/sessions'
import type { ManagedRepo } from '../../../../preload/index'
import { normalizeGitStatus } from '../gitStatusNormalizer'
import { computeBranchStatus } from '../branchStatus'

export function useGitPolling({
  sessions,
  activeSession,
  repos,
  markHasHadCommits,
  clearHasHadCommits,
  updateBranchStatus,
  updatePrState,
}: {
  sessions: Session[]
  activeSession: Session | undefined
  repos: ManagedRepo[]
  markHasHadCommits: (sessionId: string) => void
  clearHasHadCommits: (sessionId: string) => void
  updateBranchStatus: (sessionId: string, status: BranchStatus) => void
  updatePrState: (sessionId: string, prState: import('../../../store/sessions').PrState, prNumber?: number, prUrl?: string) => void
}) {
  const [gitStatusBySession, setGitStatusBySession] = useState<Record<string, GitStatusResult | undefined>>({})
  const [isMergedBySession, setIsMergedBySession] = useState<Record<string, boolean | undefined>>({})

  // Fetch git status for active session
  const fetchGitStatus = useCallback(async () => {
    if (!activeSession || activeSession.status === 'initializing') return
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
      // them into one render. Branch status is computed inline here rather
      // than in a separate useEffect to eliminate a render gap where stale
      // branchStatus is briefly visible (e.g. showing 'merged' from a
      // previous session lifecycle when switching sessions).
      const effectiveHasHadCommits = shouldMarkHasHadCommits || (activeSession.hasHadCommits ?? false)
      const computedStatus = computeBranchStatus({
        uncommittedFiles: normalized.files.length,
        ahead: normalized.ahead,
        hasTrackingBranch: !!normalized.tracking,
        isOnMainBranch: isOnMain,
        isMergedToMain: merged,
        hasHadCommits: effectiveHasHadCommits,
        lastKnownPrState: activeSession.lastKnownPrState,
      })

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
      updateBranchStatus(activeSession.id, computedStatus)
    } catch {
      // Ignore errors
    }
  }, [activeSession?.id, activeSession?.directory, activeSession?.repoId, activeSession?.hasHadCommits, activeSession?.lastKnownPrState, repos, markHasHadCommits, updateBranchStatus])

  // Poll git status every 2 seconds
  useEffect(() => {
    if (activeSession && activeSession.status !== 'initializing') {
      void fetchGitStatus()
      const interval = setInterval(() => { void fetchGitStatus() }, 2000)
      return () => clearInterval(interval)
    }
  }, [activeSession?.id, activeSession?.status, fetchGitStatus])

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

      // Clear stale PR state when new work is detected on a previously merged/closed branch.
      // This prevents the branch from snapping back to 'merged' after pushing new commits.
      // Also reset hasHadCommits so the git-native merge check (rule 3) doesn't re-assert
      // 'merged' — the branch starts a fresh lifecycle after moving beyond the old PR.
      if (
        (session.lastKnownPrState === 'MERGED' || session.lastKnownPrState === 'CLOSED') &&
        (gitStatus.ahead > 0 || gitStatus.files.length > 0)
      ) {
        updatePrState(session.id, null)
        clearHasHadCommits(session.id)
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
