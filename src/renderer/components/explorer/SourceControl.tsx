import { useState, useEffect, useMemo } from 'react'
import type { PrComment } from './types'
import { StatusBadge, BranchStatusCard } from './icons'
import type { GitFileStatus, GitStatusResult, GitHubPrStatus, GitCommitInfo } from '../../../preload/index'
import type { BranchStatus, PrState } from '../../store/sessions'
import { useRepoStore } from '../../store/repos'
import { statusLabel, getStatusColor, prStateBadgeClass } from '../../utils/explorerHelpers'

interface SourceControlProps {
  directory?: string
  gitStatus: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  onFileSelect?: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, searchHighlight?: string, diffBaseRef?: string, diffCurrentRef?: string, diffLabel?: string) => void
  onGitStatusRefresh?: () => void
  branchStatus?: BranchStatus
  repoId?: string
  agentPtyId?: string
  onUpdatePrState?: (prState: PrState, prNumber?: number, prUrl?: string) => void
  pushedToMainAt?: number
  pushedToMainCommit?: string
  onRecordPushToMain?: (commitHash: string) => void
  onClearPushToMain?: () => void
  onOpenReview?: () => void
}

export function SourceControl({
  directory,
  gitStatus,
  syncStatus,
  onFileSelect,
  onGitStatusRefresh,
  branchStatus,
  repoId,
  agentPtyId,
  onUpdatePrState,
  pushedToMainAt,
  pushedToMainCommit,
  onRecordPushToMain,
  onClearPushToMain,
  onOpenReview,
}: SourceControlProps) {
  // Source control state
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [commitErrorExpanded, setCommitErrorExpanded] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSyncingWithMain, setIsSyncingWithMain] = useState(false)
  const [gitOpError, setGitOpError] = useState<{ operation: string; message: string } | null>(null)
  const [scView, setScView] = useState<'working' | 'branch' | 'commits' | 'comments'>('working')
  const [branchChanges, setBranchChanges] = useState<{ path: string; status: string }[]>([])
  const [branchBaseName, setBranchBaseName] = useState<string>('main')
  const [branchMergeBase, setBranchMergeBase] = useState<string>('')
  const [isBranchLoading, setIsBranchLoading] = useState(false)

  // Commits state
  const [branchCommits, setBranchCommits] = useState<GitCommitInfo[]>([])
  const [isCommitsLoading, setIsCommitsLoading] = useState(false)
  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(new Set())
  const [commitFilesByHash, setCommitFilesByHash] = useState<Record<string, { path: string; status: string }[]>>({})
  const [loadingCommitFiles, setLoadingCommitFiles] = useState<Set<string>>(new Set())

  // PR status state
  const [prStatus, setPrStatus] = useState<GitHubPrStatus>(null)
  const [isPrLoading, setIsPrLoading] = useState(false)
  const [hasWriteAccess, setHasWriteAccess] = useState(false)
  const [isPushingToMain, setIsPushingToMain] = useState(false)
  const [currentHeadCommit, setCurrentHeadCommit] = useState<string | null>(null)

  // PR comments state
  const [prComments, setPrComments] = useState<PrComment[]>([])
  const [isCommentsLoading, setIsCommentsLoading] = useState(false)
  const [replyText, setReplyText] = useState<Record<number, string>>({})
  const [isSubmittingReply, setIsSubmittingReply] = useState<number | null>(null)

  // Repo lookup for allowPushToMain
  const repos = useRepoStore((s) => s.repos)
  const currentRepo = repoId ? repos.find((r) => r.id === repoId) : undefined

  // Source control computed values
  const stagedFiles = useMemo(() => gitStatus.filter(f => f.staged), [gitStatus])
  const unstagedFiles = useMemo(() => gitStatus.filter(f => !f.staged), [gitStatus])

  // Check if there are changes since last push to main
  const hasChangesSincePush = useMemo(() => {
    if (!pushedToMainCommit || !currentHeadCommit) return true
    return pushedToMainCommit !== currentHeadCommit
  }, [pushedToMainCommit, currentHeadCommit])

  // Reset source control state when directory (session) changes
  useEffect(() => {
    setPrComments([])
    setPrStatus(null)
    setScView('working')
    setHasWriteAccess(false)
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

    window.git.branchChanges(directory).then((result) => {
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

    window.git.branchCommits(directory).then((result) => {
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

    fetchPrInfo()

    return () => { cancelled = true }

  }, [directory, syncStatus?.ahead, syncStatus?.behind]) // Re-fetch when commits ahead/behind change

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

    fetchComments()

    return () => { cancelled = true }
  }, [scView, directory, prStatus])

  // Clear pushed status if there are new changes
  useEffect(() => {
    if (pushedToMainAt && hasChangesSincePush && onClearPushToMain) {
      onClearPushToMain()
    }
  }, [pushedToMainAt, hasChangesSincePush, onClearPushToMain])

  const handleRevertFile = async (filePath: string) => {
    if (!directory) return
    if (!window.confirm(`Revert changes to "${filePath}"? This cannot be undone.`)) return
    await window.git.checkoutFile(directory, filePath)
    onGitStatusRefresh?.()
  }

  const handleStage = async (filePath: string) => {
    if (!directory) return
    await window.git.stage(directory, filePath)
    onGitStatusRefresh?.()
  }

  const handleStageAll = async () => {
    if (!directory) return
    await window.git.stageAll(directory)
    onGitStatusRefresh?.()
  }

  const handleUnstage = async (filePath: string) => {
    if (!directory) return
    await window.git.unstage(directory, filePath)
    onGitStatusRefresh?.()
  }

  const handleCommit = async () => {
    if (!directory || !commitMessage.trim()) return

    // If nothing staged but there are unstaged changes, offer to stage all
    if (stagedFiles.length === 0 && unstagedFiles.length > 0) {
      const action = await window.menu.popup([
        { id: 'stage-all-commit', label: `Stage All ${unstagedFiles.length} File${unstagedFiles.length !== 1 ? 's' : ''} & Commit` },
      ])
      if (action !== 'stage-all-commit') return
      await window.git.stageAll(directory)
    } else if (stagedFiles.length === 0) {
      return
    }

    setIsCommitting(true)
    setCommitError(null)
    setGitOpError(null)
    try {
      const result = await window.git.commit(directory, commitMessage.trim())
      if (result.success) {
        setCommitMessage('')
        setCommitError(null)
        onGitStatusRefresh?.()
      } else {
        const errorMsg = result.error || 'Commit failed'
        setCommitError(errorMsg)
        setCommitErrorExpanded(false)
        setGitOpError({ operation: 'Commit', message: errorMsg })
      }
    } catch (err) {
      const errorMsg = String(err)
      setCommitError(errorMsg)
      setCommitErrorExpanded(false)
      setGitOpError({ operation: 'Commit', message: errorMsg })
    } finally {
      setIsCommitting(false)
    }
  }

  const handleSync = async () => {
    if (!directory) return
    setIsSyncing(true)
    setGitOpError(null)
    try {
      const pullResult = await window.git.pull(directory)
      if (!pullResult.success) {
        setGitOpError({ operation: 'Pull', message: pullResult.error || 'Pull failed' })
        return
      }
      const pushResult = await window.git.push(directory)
      if (!pushResult.success) {
        setGitOpError({ operation: 'Push', message: pushResult.error || 'Push failed' })
        return
      }
      onGitStatusRefresh?.()
    } catch (err) {
      setGitOpError({ operation: 'Sync', message: String(err) })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleSyncWithMain = async () => {
    if (!directory) return

    // Check for uncommitted changes
    if (gitStatus.length > 0) {
      setGitOpError({ operation: 'Sync with main', message: 'Commit or stash changes before syncing with main' })
      return
    }

    setIsSyncingWithMain(true)
    setGitOpError(null)
    try {
      const result = await window.git.pullOriginMain(directory)
      if (result.success) {
        onGitStatusRefresh?.()
      } else if (result.hasConflicts) {
        // Send conflict resolution command to agent terminal
        if (agentPtyId) {
          await window.pty.write(agentPtyId, 'resolve all merge conflicts\r')
          setGitOpError({ operation: 'Sync with main', message: 'Merge conflicts detected. Agent is resolving them.' })
        } else {
          setGitOpError({ operation: 'Sync with main', message: 'Merge conflicts detected. Resolve them manually.' })
        }
        onGitStatusRefresh?.()
      } else {
        setGitOpError({ operation: 'Sync with main', message: result.error || 'Sync failed' })
      }
    } catch (err) {
      setGitOpError({ operation: 'Sync with main', message: String(err) })
    } finally {
      setIsSyncingWithMain(false)
    }
  }

  const handlePushToMain = async () => {
    if (!directory) return
    setIsPushingToMain(true)
    setGitOpError(null)
    try {
      // Check if we're behind origin's main branch
      const behindInfo = await window.git.isBehindMain(directory)
      if (behindInfo.behind > 0) {
        setIsPushingToMain(false)
        const shouldSync = window.confirm(
          `Main has ${behindInfo.behind} new commit${behindInfo.behind !== 1 ? 's' : ''}. Sync with main first?`
        )
        if (shouldSync) {
          await handleSyncWithMain()
          return
        }
        setIsPushingToMain(true)
      }

      const result = await window.gh.mergeBranchToMain(directory)
      if (result.success) {
        // Record the push with current HEAD commit
        const headCommit = await window.git.headCommit(directory)
        if (headCommit && onRecordPushToMain) {
          onRecordPushToMain(headCommit)
        }
        onGitStatusRefresh?.()
      } else {
        setGitOpError({ operation: `Push to ${branchBaseName}`, message: result.error || 'Push to main failed' })
      }
    } catch (err) {
      setGitOpError({ operation: `Push to ${branchBaseName}`, message: String(err) })
    } finally {
      setIsPushingToMain(false)
    }
  }

  const handleCreatePr = async () => {
    if (!directory) return
    const url = await window.gh.getPrCreateUrl(directory)
    if (url) {
      window.shell.openExternal(url)
    }
  }

  const handleToggleCommit = async (commitHash: string) => {
    const newExpanded = new Set(expandedCommits)
    if (newExpanded.has(commitHash)) {
      newExpanded.delete(commitHash)
    } else {
      newExpanded.add(commitHash)
      // Lazy-load files if not already loaded
      if (!commitFilesByHash[commitHash] && directory) {
        setLoadingCommitFiles(prev => new Set(prev).add(commitHash))
        try {
          const files = await window.git.commitFiles(directory, commitHash)
          setCommitFilesByHash(prev => ({ ...prev, [commitHash]: files }))
        } catch {
          setCommitFilesByHash(prev => ({ ...prev, [commitHash]: [] }))
        }
        setLoadingCommitFiles(prev => {
          const next = new Set(prev)
          next.delete(commitHash)
          return next
        })
      }
    }
    setExpandedCommits(newExpanded)
  }

  const handleReplyToComment = async (commentId: number) => {
    if (!directory || !prStatus || !replyText[commentId]?.trim()) return
    setIsSubmittingReply(commentId)
    try {
      const result = await window.gh.replyToComment(directory, prStatus.number, commentId, replyText[commentId])
      if (result.success) {
        setReplyText(prev => ({ ...prev, [commentId]: '' }))
        // Refresh comments
        const comments = await window.gh.prComments(directory, prStatus.number)
        setPrComments(comments)
      }
    } finally {
      setIsSubmittingReply(null)
    }
  }

  if (!directory) return null

  // View toggle (Working / Branch / Comments)
  const viewToggle = (
    <div className="px-3 py-1.5 border-b border-border flex items-center gap-1">
      <button
        onClick={() => setScView('working')}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          scView === 'working' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
        }`}
      >
        Uncommitted
      </button>
      <button
        onClick={() => setScView('branch')}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          scView === 'branch' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
        }`}
      >
        Branch
      </button>
      <button
        onClick={() => setScView('commits')}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          scView === 'commits' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
        }`}
      >
        Commits
      </button>
      {prStatus && (
        <button
          onClick={() => setScView('comments')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            scView === 'comments' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
          }`}
        >
          Comments
        </button>
      )}
    </div>
  )

  // PR Status banner
  const prStatusBanner = (
    <div className="px-3 py-2 border-b border-border bg-bg-secondary">
      {isPrLoading ? (
        <div className="text-xs text-text-secondary">Loading PR status...</div>
      ) : prStatus ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${prStateBadgeClass(prStatus.state)}`}>
              {prStatus.state}
            </span>
            <button
              onClick={() => window.shell.openExternal(prStatus!.url)}
              className="text-xs text-accent hover:underline truncate flex-1 text-left"
            >
              #{prStatus.number}: {prStatus.title}
            </button>
          </div>
          {prStatus.state === 'OPEN' && gitStatus.length === 0 && syncStatus?.current !== branchBaseName && (
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={handleSyncWithMain}
                disabled={isSyncingWithMain}
                className="px-2 py-1 text-xs rounded bg-bg-tertiary text-text-primary hover:bg-bg-secondary disabled:opacity-50"
              >
                {isSyncingWithMain ? 'Syncing...' : `Sync with ${branchBaseName}`}
              </button>
            </div>
          )}
        </div>
      ) : branchStatus === 'merged' ? (
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-purple-500/20 text-purple-400">
            MERGED
          </span>
          <span className="text-xs text-text-secondary">
            Branch merged to {branchBaseName}
          </span>
        </div>
      ) : null}
    </div>
  )

  // Git operation error banner
  const gitOpErrorBanner = gitOpError ? (
    <div className="px-3 py-2 border-b border-red-500/30 bg-red-500/10 flex items-center gap-2">
      <div
        className="flex-1 text-xs text-red-400 cursor-pointer hover:text-red-300 truncate"
        title="Click to view full error"
        onClick={async () => {
          const errorContent = `${gitOpError.operation} failed\n${'='.repeat(40)}\n\n${gitOpError.message}`
          const errorPath = '/tmp/broomy-git-error.txt'
          await window.fs.writeFile(errorPath, errorContent)
          onFileSelect?.(errorPath, false)
        }}
      >
        {gitOpError.operation} failed: {gitOpError.message.length > 80
          ? gitOpError.message.slice(0, 80) + '...'
          : gitOpError.message}
      </div>
      <button
        onClick={() => setGitOpError(null)}
        className="text-red-400 hover:text-red-300 text-xs shrink-0 px-1"
        title="Dismiss"
      >
        &times;
      </button>
    </div>
  ) : null

  // Comments view
  if (scView === 'comments') {
    return (
      <div className="flex flex-col h-full">
        {viewToggle}
        {prStatusBanner}
        {gitOpErrorBanner}
        {isCommentsLoading ? (
          <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">Loading comments...</div>
        ) : prComments.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
            No review comments
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto text-sm">
            {prComments.filter(c => !c.inReplyToId).map((comment) => {
              const replies = prComments.filter(c => c.inReplyToId === comment.id)
              return (
                <div key={comment.id} className="border-b border-border">
                  <div
                    className="px-3 py-2 hover:bg-bg-tertiary cursor-pointer"
                    onClick={() => {
                      if (onFileSelect && directory && comment.path) {
                        onFileSelect(`${directory}/${comment.path}`, true, comment.line ?? undefined)
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-text-primary">{comment.author}</span>
                      <span className="text-xs text-text-secondary">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs text-accent mb-1">
                      {comment.path}{comment.line ? `:${comment.line}` : ''}
                    </div>
                    <div className="text-xs text-text-primary whitespace-pre-wrap">
                      {comment.body}
                    </div>
                  </div>
                  {/* Replies */}
                  {replies.map(reply => (
                    <div key={reply.id} className="px-3 py-2 pl-6 bg-bg-secondary/50">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-text-primary">{reply.author}</span>
                        <span className="text-xs text-text-secondary">
                          {new Date(reply.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-xs text-text-primary whitespace-pre-wrap">
                        {reply.body}
                      </div>
                    </div>
                  ))}
                  {/* Reply input */}
                  <div className="px-3 py-2 pl-6 bg-bg-tertiary/30">
                    <textarea
                      value={replyText[comment.id] || ''}
                      onChange={(e) => setReplyText(prev => ({ ...prev, [comment.id]: e.target.value }))}
                      placeholder="Write a reply..."
                      className="w-full bg-bg-tertiary border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent resize-none"
                      rows={2}
                    />
                    <button
                      onClick={() => handleReplyToComment(comment.id)}
                      disabled={isSubmittingReply === comment.id || !replyText[comment.id]?.trim()}
                      className="mt-1 px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
                    >
                      {isSubmittingReply === comment.id ? 'Sending...' : 'Reply'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Commits view
  if (scView === 'commits') {
    return (
      <div className="flex flex-col h-full">
        {viewToggle}
        {prStatusBanner}
        {gitOpErrorBanner}
        {isCommitsLoading ? (
          <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">Loading...</div>
        ) : branchCommits.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
            No commits ahead of {branchBaseName}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto text-sm">
            <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
              Commits ({branchCommits.length})
            </div>
            {branchCommits.map((commit) => {
              const isExpanded = expandedCommits.has(commit.hash)
              const files = commitFilesByHash[commit.hash]
              const isLoadingFiles = loadingCommitFiles.has(commit.hash)
              return (
                <div key={commit.hash}>
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-tertiary cursor-pointer"
                    onClick={() => handleToggleCommit(commit.hash)}
                    title={`${commit.shortHash} — ${commit.message}\nby ${commit.author} on ${new Date(commit.date).toLocaleDateString()}`}
                  >
                    <span className="text-text-secondary w-3 text-center text-xs">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                    <span className="text-xs font-mono text-accent shrink-0">{commit.shortHash}</span>
                    <span className="text-xs text-text-primary truncate flex-1">{commit.message}</span>
                  </div>
                  {isExpanded && (
                    <div className="bg-bg-secondary/30">
                      {isLoadingFiles ? (
                        <div className="px-3 py-1 pl-8 text-xs text-text-secondary">Loading files...</div>
                      ) : files && files.length > 0 ? (
                        files.map((file) => (
                          <div
                            key={`${commit.hash}-${file.path}`}
                            className="flex items-center gap-2 px-3 py-1 pl-8 hover:bg-bg-tertiary cursor-pointer"
                            title={`${file.path} — ${statusLabel(file.status)}`}
                            onClick={() => {
                              if (onFileSelect && directory) {
                                onFileSelect(
                                  `${directory}/${file.path}`,
                                  true,
                                  undefined,
                                  undefined,
                                  `${commit.hash}~1`,
                                  commit.hash,
                                  `${commit.shortHash}: ${commit.message}`
                                )
                              }
                            }}
                          >
                            <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                              {file.path}
                            </span>
                            <StatusBadge status={file.status} />
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-1 pl-8 text-xs text-text-secondary">No files changed</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Branch changes view
  if (scView === 'branch') {
    return (
      <div className="flex flex-col h-full">
        {viewToggle}
        {prStatusBanner}
        {gitOpErrorBanner}
        {isBranchLoading ? (
          <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">Loading...</div>
        ) : branchChanges.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
            No changes vs {branchBaseName}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto text-sm">
            <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
              Changes vs {branchBaseName} ({branchChanges.length})
            </div>
            {branchChanges.map((file) => (
              <div
                key={`branch-${file.path}`}
                className="flex items-center gap-2 px-3 py-1 hover:bg-bg-tertiary cursor-pointer"
                title={`${file.path} — ${statusLabel(file.status)}`}
                onClick={() => {
                  if (onFileSelect && directory) {
                    onFileSelect(`${directory}/${file.path}`, true, undefined, undefined, branchMergeBase || `origin/${branchBaseName}`, undefined, `Branch vs ${branchBaseName}`)
                  }
                }}
              >
                <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                  {file.path}
                </span>
                <StatusBadge status={file.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Working changes view
  const hasChanges = gitStatus.length > 0

  if (!hasChanges) {
    const ahead = syncStatus?.ahead ?? 0
    const behind = syncStatus?.behind ?? 0
    const hasRemoteChanges = ahead > 0 || behind > 0

    // No changes: show sync view
    return (
      <div className="flex flex-col h-full">
        {viewToggle}
        {prStatusBanner}
        {gitOpErrorBanner}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
          {syncStatus?.tracking && (
            <div className="text-xs text-text-secondary text-center">
              {syncStatus.current} &rarr; {syncStatus.tracking}
            </div>
          )}

          {hasRemoteChanges ? (
            <div className="flex flex-col items-center gap-2">
              {ahead > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <span className="text-lg">&uarr;</span>
                  <span className="font-medium">{ahead} commit{ahead !== 1 ? 's' : ''} to push</span>
                </div>
              )}
              {behind > 0 && (
                <div className="flex items-center gap-2 text-sm text-blue-400">
                  <span className="text-lg">&darr;</span>
                  <span className="font-medium">{behind} commit{behind !== 1 ? 's' : ''} to pull</span>
                </div>
              )}
            </div>
          ) : branchStatus && branchStatus !== 'in-progress' ? (
            <>
              <BranchStatusCard status={branchStatus} />
              {(branchStatus === 'open' || branchStatus === 'pushed') && onOpenReview && (
                <button
                  onClick={onOpenReview}
                  className="px-4 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-500 transition-colors"
                >
                  Get AI Review
                </button>
              )}
            </>
          ) : (
            <div className="text-sm text-text-secondary">Up to date</div>
          )}

          {syncStatus?.tracking && branchStatus !== 'merged' && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className={`px-4 py-1.5 text-xs rounded text-white disabled:opacity-50 ${
                hasRemoteChanges
                  ? 'bg-accent hover:bg-accent/80'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary'
              }`}
            >
              {isSyncing ? 'Syncing...' : 'Sync Changes'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // Has changes: show commit view
  return (
    <div className="flex flex-col h-full">
      {viewToggle}
      {prStatusBanner}
      {gitOpErrorBanner}
      {/* Commit area */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCommit()
            }}
            placeholder="Commit message"
            className="flex-1 bg-bg-tertiary border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent min-w-0"
          />
          <button
            onClick={handleCommit}
            disabled={isCommitting || gitStatus.length === 0 || !commitMessage.trim()}
            className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {isCommitting ? 'Committing...' : 'Commit'}
          </button>
          <button
            onClick={async () => {
              const action = await window.menu.popup([
                { id: 'stage-all', label: 'Stage All Changes' },
              ])
              if (action === 'stage-all') handleStageAll()
            }}
            disabled={unstagedFiles.length === 0}
            className="px-1 py-1 text-xs rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            title="More actions"
          >
            &#x22EF;
          </button>
        </div>
        {commitError && (
          <div className="mt-1 flex items-start gap-1 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
            <div
              className="flex-1 text-xs text-red-400 cursor-pointer"
              onClick={() => setCommitErrorExpanded(!commitErrorExpanded)}
            >
              {commitErrorExpanded ? commitError : (commitError.length > 80 ? commitError.slice(0, 80) + '...' : commitError)}
            </div>
            <button
              onClick={() => setCommitError(null)}
              className="text-red-400 hover:text-red-300 text-xs shrink-0 px-1"
              title="Dismiss"
            >
              x
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto text-sm">
        {/* Staged Changes */}
        <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
          Staged Changes ({stagedFiles.length})
        </div>
        {stagedFiles.length === 0 ? (
          <div className="px-3 py-2 text-xs text-text-secondary">No staged changes</div>
        ) : (
          stagedFiles.map((file) => (
            <div
              key={`staged-${file.path}`}
              className="flex items-center gap-2 px-3 py-1 hover:bg-bg-tertiary cursor-pointer group"
              title={`${file.path} — ${statusLabel(file.status)} (staged)`}
              onClick={() => {
                if (onFileSelect && directory) {
                  onFileSelect(`${directory}/${file.path}`, true)
                }
              }}
            >
              <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                {file.path}
              </span>
              <StatusBadge status={file.status} />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleUnstage(file.path)
                }}
                className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary text-xs px-1"
                title="Unstage"
              >
                -
              </button>
            </div>
          ))
        )}

        {/* Changes */}
        <div
          className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary mt-1 cursor-default"
          onContextMenu={async (e) => {
            e.preventDefault()
            if (unstagedFiles.length === 0) return
            const action = await window.menu.popup([
              { id: 'stage-all', label: 'Stage All Changes' },
            ])
            if (action === 'stage-all') handleStageAll()
          }}
        >
          Changes ({unstagedFiles.length})
        </div>
        {unstagedFiles.length === 0 ? (
          <div className="px-3 py-2 text-xs text-text-secondary">No changes</div>
        ) : (
          unstagedFiles.map((file) => (
            <div
              key={`unstaged-${file.path}`}
              className="flex items-center gap-2 px-3 py-1 hover:bg-bg-tertiary cursor-pointer group"
              title={`${file.path} — ${statusLabel(file.status)}`}
              onClick={() => {
                if (onFileSelect && directory) {
                  onFileSelect(`${directory}/${file.path}`, true)
                }
              }}
            >
              <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                {file.path}
              </span>
              <StatusBadge status={file.status} />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleStage(file.path)
                }}
                className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary text-xs px-1"
                title="Stage"
              >
                +
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
