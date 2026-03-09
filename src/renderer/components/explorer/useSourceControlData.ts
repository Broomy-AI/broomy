/**
 * Hook that manages source control data fetching for PR status, branch changes, and commits.
 */
import { useState, useEffect, useMemo } from 'react'
import type { GitFileStatus, GitStatusResult, GitHubPrStatus, GitCommitInfo } from '../../../preload/index'
import type { BranchStatus, PrState } from '../../store/sessions'
import { useRepoStore } from '../../store/repos'

export interface SourceControlDataProps {
  directory?: string
  gitStatus: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  branchStatus?: BranchStatus
  onUpdatePrState?: (prState: PrState, prNumber?: number, prUrl?: string) => void
  repoId?: string
  scView: 'working' | 'branch' | 'commits'
}

interface PrEffectsConfig {
  directory?: string
  syncStatus?: GitStatusResult | null
  onUpdatePrState?: (prState: PrState, prNumber?: number, prUrl?: string) => void
}

/** PR data-fetching effects, extracted for function size limits. */
function usePrEffects(config: PrEffectsConfig) {
  const { directory, syncStatus, onUpdatePrState } = config
  const [prStatus, setPrStatus] = useState<GitHubPrStatus>(null)
  const [isPrLoading, setIsPrLoading] = useState(false)
  const [hasWriteAccess, setHasWriteAccess] = useState(false)
  const [checksStatus, setChecksStatus] = useState<'passed' | 'failed' | 'pending' | 'none'>('none')
  const [hasPrLoadedOnce, setHasPrLoadedOnce] = useState(false)

  // Fetch PR status, write access, and checks when source control is active
  useEffect(() => {
    if (!directory) { setHasPrLoadedOnce(true); return }
    let cancelled = false
    setIsPrLoading(true)

    const fetchPrInfo = async () => {
      try {
        const [prResult, writeAccess] = await Promise.all([
          window.gh.prStatus(directory),
          window.gh.hasWriteAccess(directory),
        ])
        if (cancelled) return
        setPrStatus(prResult)
        setHasWriteAccess(writeAccess)

        // Fetch checks status only if there's an open PR
        if (prResult?.state === 'OPEN') {
          const checks = await window.gh.prChecksStatus(directory).catch(() => 'none' as const)
          setChecksStatus(checks)
        } else {
          setChecksStatus('none')
        }
      } catch {
        if (cancelled) return
        setPrStatus(null)
        setHasWriteAccess(false)
        setChecksStatus('none')
      } finally {
        if (!cancelled) {
          setIsPrLoading(false)
          setHasPrLoadedOnce(true)
        }
      }
    }

    void fetchPrInfo()
    return () => { cancelled = true }
  }, [directory, syncStatus?.ahead, syncStatus?.behind])

  // Update session PR state when Explorer fetches PR status
  useEffect(() => {
    if (!onUpdatePrState) return
    if (isPrLoading) return
    if (prStatus) {
      onUpdatePrState(prStatus.state, prStatus.number, prStatus.url)
    } else {
      onUpdatePrState(null)
    }
  }, [prStatus, isPrLoading])

  // Reset on directory change
  const resetPr = () => {
    setPrStatus(null)
    setHasWriteAccess(false)
    setChecksStatus('none')
    setHasPrLoadedOnce(false)
  }

  return {
    prStatus, isPrLoading,
    hasWriteAccess,
    checksStatus,
    hasPrLoadedOnce,
    resetPr,
  }
}

export function useSourceControlData({
  directory,
  gitStatus,
  syncStatus,
  branchStatus,
  onUpdatePrState,
  repoId,
  scView,
}: SourceControlDataProps) {
  // Source control state
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [commitErrorExpanded, setCommitErrorExpanded] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSyncingWithMain, setIsSyncingWithMain] = useState(false)
  const [gitOpError, setGitOpError] = useState<{ operation: string; message: string } | null>(null)
  const [branchChanges, setBranchChanges] = useState<{ path: string; status: string }[]>([])
  const [branchBaseName, setBranchBaseName] = useState<string>('main')
  const [branchMergeBase, setBranchMergeBase] = useState<string>('')
  const [isBranchLoading, setIsBranchLoading] = useState(false)

  // Commits state
  const [branchCommits, setBranchCommits] = useState<GitCommitInfo[]>([])
  const [isCommitsLoading, setIsCommitsLoading] = useState(false)
  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(new Set())
  const [commitFilesByHash, setCommitFilesByHash] = useState<Record<string, { path: string; status: string }[] | undefined>>({})
  const [loadingCommitFiles, setLoadingCommitFiles] = useState<Set<string>>(new Set())

  // Behind-main state
  const [behindMainCount, setBehindMainCount] = useState(0)
  const [isFetchingBehindMain, setIsFetchingBehindMain] = useState(false)
  const [hasBehindMainLoadedOnce, setHasBehindMainLoadedOnce] = useState(false)

  // Agent merge message (shown as info banner instead of error)
  const [agentMergeMessage, setAgentMergeMessage] = useState<string | null>(null)

  // Track whether we already asked the agent to resolve conflicts
  const [askedAgentToResolve, setAskedAgentToResolve] = useState(false)

  // PR effects
  const pr = usePrEffects({ directory, syncStatus, onUpdatePrState })

  // Repo lookup for allowApproveAndMerge
  const repos = useRepoStore((s) => s.repos)
  const currentRepo = repoId ? repos.find((r) => r.id === repoId) : undefined

  // Source control computed values
  const stagedFiles = useMemo(() => gitStatus.filter(f => f.staged), [gitStatus])
  const unstagedFiles = useMemo(() => gitStatus.filter(f => !f.staged), [gitStatus])

  // Reset source control state when directory (session) changes
  useEffect(() => {
    pr.resetPr()
    setCommitError(null)
    setGitOpError(null)
    setAgentMergeMessage(null)
    setBehindMainCount(0)
    setHasBehindMainLoadedOnce(false)
    setBranchCommits([])
    setExpandedCommits(new Set())
    setCommitFilesByHash({})
    setLoadingCommitFiles(new Set())
  }, [directory])

  // Check if main has new commits when branch is pushed/empty with no changes
  useEffect(() => {
    if (scView !== 'working' || !directory || gitStatus.length > 0) {
      setBehindMainCount(0)
      setHasBehindMainLoadedOnce(true)
      return
    }
    if (branchStatus !== 'pushed' && branchStatus !== 'empty' && branchStatus !== 'open') {
      setBehindMainCount(0)
      setHasBehindMainLoadedOnce(true)
      return
    }

    let cancelled = false
    setIsFetchingBehindMain(true)

    window.git.isBehindMain(directory).then((result: { behind: number; defaultBranch: string }) => {
      if (cancelled) return
      setBehindMainCount(result.behind)
      setIsFetchingBehindMain(false)
      setHasBehindMainLoadedOnce(true)
    }).catch(() => {
      if (cancelled) return
      setBehindMainCount(0)
      setIsFetchingBehindMain(false)
      setHasBehindMainLoadedOnce(true)
    })

    return () => { cancelled = true }
  }, [scView, directory, gitStatus.length, branchStatus])

  // Fetch branch changes when branch view is active
  useEffect(() => {
    if (scView !== 'branch' || !directory) return

    let cancelled = false
    setIsBranchLoading(true)

    window.git.branchChanges(directory).then((result: { files: { path: string; status: string }[]; baseBranch: string; mergeBase: string }) => {
      if (cancelled) return
      setBranchChanges(result.files)
      setBranchBaseName(result.baseBranch)
      setBranchMergeBase(result.mergeBase)
      setIsBranchLoading(false)
    }).catch(() => {
      if (cancelled) return
      setBranchChanges([])
      setBranchMergeBase('')
      setIsBranchLoading(false)
    })

    return () => { cancelled = true }
  }, [scView, directory])

  // Fetch branch commits when commits view is active
  useEffect(() => {
    if (scView !== 'commits' || !directory) return

    let cancelled = false
    setIsCommitsLoading(true)

    window.git.branchCommits(directory).then((result: { commits: GitCommitInfo[]; baseBranch: string }) => {
      if (cancelled) return
      setBranchCommits(result.commits)
      setBranchBaseName(result.baseBranch)
      setIsCommitsLoading(false)
    }).catch(() => {
      if (cancelled) return
      setBranchCommits([])
      setIsCommitsLoading(false)
    })

    return () => { cancelled = true }
  }, [scView, directory])

  // All async condition-state sources must complete before we reveal the condition state.
  // This prevents buttons from appearing one-at-a-time as independent fetches resolve.
  const isInitialLoading = !pr.hasPrLoadedOnce || !hasBehindMainLoadedOnce

  return {
    // State values
    isInitialLoading,
    commitMessage, setCommitMessage,
    isCommitting, setIsCommitting,
    commitError, setCommitError,
    commitErrorExpanded, setCommitErrorExpanded,
    isSyncing, setIsSyncing,
    isSyncingWithMain, setIsSyncingWithMain,
    gitOpError, setGitOpError,
    branchChanges,
    branchBaseName,
    branchMergeBase,
    isBranchLoading,
    branchCommits,
    isCommitsLoading,
    expandedCommits, setExpandedCommits,
    commitFilesByHash, setCommitFilesByHash,
    loadingCommitFiles, setLoadingCommitFiles,
    // Behind-main state
    behindMainCount,
    isFetchingBehindMain,
    // Agent merge message
    agentMergeMessage, setAgentMergeMessage,
    askedAgentToResolve, setAskedAgentToResolve,
    // PR state (spread from sub-hook)
    ...pr,
    currentRepo,
    // Computed
    stagedFiles,
    unstagedFiles,
    // Pass-through from props (needed by actions hook)
    gitStatus,
  }
}

export type SourceControlData = ReturnType<typeof useSourceControlData>
