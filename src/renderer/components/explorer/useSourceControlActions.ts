import type { SourceControlData } from './useSourceControlData'

export interface SourceControlActionsProps {
  directory?: string
  onGitStatusRefresh?: () => void
  agentPtyId?: string
  onRecordPushToMain?: (commitHash: string) => void
  data: SourceControlData
}

function createGitActions(
  directory: string | undefined,
  onGitStatusRefresh: (() => void) | undefined,
  agentPtyId: string | undefined,
  onRecordPushToMain: ((commitHash: string) => void) | undefined,
  data: SourceControlData,
) {
  const {
    setIsSyncing, setIsSyncingWithMain, setGitOpError,
    branchBaseName, setIsPushingToMain, gitStatus,
  } = data

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
      void window.shell.openExternal(url)
    }
  }

  const handlePushNewBranch = async (branchName: string) => {
    if (!directory) return
    setIsSyncing(true)
    setGitOpError(null)
    try {
      const result = await window.git.pushNewBranch(directory, branchName)
      if (!result.success) {
        setGitOpError({ operation: 'Push branch', message: result.error || 'Failed to push branch' })
        return
      }
      onGitStatusRefresh?.()
    } catch (err) {
      setGitOpError({ operation: 'Push branch', message: String(err) })
    } finally {
      setIsSyncing(false)
    }
  }

  return { handleSync, handleSyncWithMain, handlePushToMain, handleCreatePr, handlePushNewBranch }
}

export function useSourceControlActions({
  directory,
  onGitStatusRefresh,
  agentPtyId,
  onRecordPushToMain,
  data,
}: SourceControlActionsProps) {
  const {
    stagedFiles, unstagedFiles,
    commitMessage, setCommitMessage,
    setIsCommitting, setCommitError, setCommitErrorExpanded,
    setGitOpError,
    expandedCommits, setExpandedCommits,
    commitFilesByHash, setCommitFilesByHash,
    setLoadingCommitFiles,
    prStatus, setPrComments,
    replyText, setReplyText, setIsSubmittingReply,
  } = data

  const gitActions = createGitActions(directory, onGitStatusRefresh, agentPtyId, onRecordPushToMain, data)

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

  const handleToggleCommit = async (commitHash: string) => {
    const newExpanded = new Set(expandedCommits)
    if (newExpanded.has(commitHash)) {
      newExpanded.delete(commitHash)
    } else {
      newExpanded.add(commitHash)
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
    const text = replyText[commentId]
    if (!directory || !prStatus || !text?.trim()) return
    setIsSubmittingReply(commentId)
    try {
      const result = await window.gh.replyToComment(directory, prStatus.number, commentId, text)
      if (result.success) {
        setReplyText(prev => ({ ...prev, [commentId]: '' }))
        const comments = await window.gh.prComments(directory, prStatus.number)
        setPrComments(comments)
      }
    } finally {
      setIsSubmittingReply(null)
    }
  }

  return {
    handleRevertFile,
    handleStage,
    handleStageAll,
    handleUnstage,
    handleCommit,
    handleToggleCommit,
    handleReplyToComment,
    ...gitActions,
  }
}
