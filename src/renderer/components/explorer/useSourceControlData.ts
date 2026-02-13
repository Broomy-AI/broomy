import { useState, useEffect, useMemo } from 'react'
import type { PrComment } from './types'
import type { GitFileStatus, GitStatusResult, GitHubPrStatus, GitCommitInfo } from '../../../preload/index'
import type { PrState } from '../../store/sessions'
import { useRepoStore } from '../../store/repos'

export interface SourceControlDataProps {
  directory?: string
  gitStatus: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  onUpdatePrState?: (prState: PrState, prNumber?: number, prUrl?: string) => void
  pushedToMainAt?: number
  pushedToMainCommit?: string
  onClearPushToMain?: () => void
  repoId?: string
  scView: 'working' | 'branch' | 'commits' | 'comments'
}

interface PrEffectsConfig {
  directory?: string
  syncStatus?: GitStatusResult | null
  scView: string
  onUpdatePrState?: (prState: PrState, prNumber?: number, prUrl?: string) => void
  pushedToMainAt?: number
  pushedToMainCommit?: string
  onClearPushToMain?: () => void
}

/** PR and comments data-fetching effects, extracted for function size limits. */
function usePrEffects(config: PrEffectsConfig) {
  const { directory, syncStatus, scView, onUpdatePrState, pushedToMainAt, pushedToMainCommit, onClearPushToMain } = config
  const [prStatus, setPrStatus] = useState<GitHubPrStatus>(null)
  const [isPrLoading, setIsPrLoading] = useState(false)
  const [hasWriteAccess, setHasWriteAccess] = useState(false)
  const [isPushingToMain, setIsPushingToMain] = useState(false)
  const [currentHeadCommit, setCurrentHeadCommit] = useState<string | null>(null)

  const [prComments, setPrComments] = useState<PrComment[]>([])
  const [isCommentsLoading, setIsCommentsLoading] = useState(false)
  const [replyText, setReplyText] = useState<Record<number, string | undefined>>({})
  const [isSubmittingReply, setIsSubmittingReply] = useState<number | null>(null)

  const hasChangesSincePush = useMemo(() => {
    if (!pushedToMainCommit || !currentHeadCommit) return true
    return pushedToMainCommit !== currentHeadCommit
  }, [pushedToMainCommit, currentHeadCommit])

  // Fetch PR status and write access when source control is active
  useEffect(() => {
    if (!directory) return
    let cancelled = false
    setIsPrLoading(true)

    const fetchPrInfo = async () => {
      try {
        const [prResult, writeAccess, headCommit] = await Promise.all([
          window.gh.prStatus(directory),
          window.gh.hasWriteAccess(directory),
          window.git.headCommit(directory),
        ])
        if (cancelled) return
        setPrStatus(prResult)
        setHasWriteAccess(writeAccess)
        setCurrentHeadCommit(headCommit)
      } catch {
        if (cancelled) return
        setPrStatus(null)
        setHasWriteAccess(false)
      }
      setIsPrLoading(false)
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

  // Fetch PR comments when comments view is active
  useEffect(() => {
    if (scView !== 'comments' || !directory || !prStatus) return
    let cancelled = false
    setIsCommentsLoading(true)

    const fetchComments = async () => {
      try {
        const result = await window.gh.prComments(directory, prStatus.number)
        if (cancelled) return
        setPrComments(result)
      } catch {
        if (cancelled) return
        setPrComments([])
      }
      setIsCommentsLoading(false)
    }

    void fetchComments()
    return () => { cancelled = true }
  }, [scView, directory, prStatus])

  // Clear pushed status if there are new changes
  useEffect(() => {
    if (pushedToMainAt && hasChangesSincePush && onClearPushToMain) {
      onClearPushToMain()
    }
  }, [pushedToMainAt, hasChangesSincePush, onClearPushToMain])

  // Reset on directory change
  const resetPr = () => {
    setPrComments([])
    setPrStatus(null)
    setHasWriteAccess(false)
  }

  return {
    prStatus, isPrLoading,
    hasWriteAccess,
    isPushingToMain, setIsPushingToMain,
    currentHeadCommit,
    prComments, setPrComments,
    isCommentsLoading,
    replyText, setReplyText,
    isSubmittingReply, setIsSubmittingReply,
    hasChangesSincePush,
    resetPr,
  }
}

export function useSourceControlData({
  directory,
  gitStatus,
  syncStatus,
  onUpdatePrState,
  pushedToMainAt,
  pushedToMainCommit,
  onClearPushToMain,
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

  // PR effects
  const pr = usePrEffects({ directory, syncStatus, scView, onUpdatePrState, pushedToMainAt, pushedToMainCommit, onClearPushToMain })

  // Repo lookup for allowPushToMain
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
    setBranchCommits([])
    setExpandedCommits(new Set())
    setCommitFilesByHash({})
    setLoadingCommitFiles(new Set())
  }, [directory])

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

  return {
    // State values
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
