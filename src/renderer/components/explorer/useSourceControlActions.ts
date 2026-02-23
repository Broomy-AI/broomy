import type { SourceControlData } from './useSourceControlData'
import { focusAgentTerminal } from '../../utils/focusHelpers'
import { withGitProgress } from '../../utils/gitOperationProgress'
import { useSessionStore } from '../../store/sessions'
import { buildCreatePrPrompt } from '../../utils/prPromptBuilder'

export interface SourceControlActionsProps {
  directory?: string
  onGitStatusRefresh?: () => void
  agentPtyId?: string
  onRecordPushToMain?: (commitHash: string) => void
  data: SourceControlData
}

interface GitActionsConfig {
  directory: string | undefined
  onGitStatusRefresh: (() => void) | undefined
  agentPtyId: string | undefined
  onRecordPushToMain: ((commitHash: string) => void) | undefined
  data: SourceControlData
  sessionId: string | null
}

function createGitActions(config: GitActionsConfig) {
  const { directory, onGitStatusRefresh, agentPtyId, onRecordPushToMain, data, sessionId } = config
  const {
    setIsSyncing, setIsSyncingWithMain, setGitOpError,
    branchBaseName, setIsPushingToMain, gitStatus,
    setAgentMergeMessage,
  } = data

  const handleSync = async () => {
    if (!directory) return
    setIsSyncing(true)
    setGitOpError(null)
    try {
      await withGitProgress(sessionId, async () => {
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
      })
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
    setAgentMergeMessage(null)
    try {
      await withGitProgress(sessionId, async () => {
        const result = await window.git.pullOriginMain(directory)
        if (result.success) {
          onGitStatusRefresh?.()
        } else if (result.hasConflicts) {
          onGitStatusRefresh?.()
        } else {
          setGitOpError({ operation: 'Sync with main', message: result.error || 'Sync failed' })
        }
      })
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
      await withGitProgress(sessionId, async () => {
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
      })
    } catch (err) {
      setGitOpError({ operation: `Push to ${branchBaseName}`, message: String(err) })
    } finally {
      setIsPushingToMain(false)
    }
  }

  const handleCreatePr = async () => {
    if (!directory || !agentPtyId) return

    const broomyDir = `${directory}/.broomy`
    const promptPath = `${broomyDir}/create-pr-prompt.md`
    const baseBranch = branchBaseName || 'main'

    // Ensure .broomy directory exists
    await window.fs.mkdir(broomyDir)

    // Write the prompt file
    const prompt = buildCreatePrPrompt(baseBranch)
    await window.fs.writeFile(promptPath, prompt)

    // Send instruction to agent
    await window.pty.write(agentPtyId, 'Please read and follow the instructions in .broomy/create-pr-prompt.md')
    focusAgentTerminal()
  }

  const handlePushNewBranch = async (branchName: string) => {
    if (!directory) return
    setIsSyncing(true)
    setGitOpError(null)
    try {
      await withGitProgress(sessionId, async () => {
        const result = await window.git.pushNewBranch(directory, branchName)
        if (!result.success) {
          setGitOpError({ operation: 'Push branch', message: result.error || 'Failed to push branch' })
          return
        }
        onGitStatusRefresh?.()
      })
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
    setGitOpError, setAgentMergeMessage, setAskedAgentToResolve,
    expandedCommits, setExpandedCommits,
    commitFilesByHash, setCommitFilesByHash,
    setLoadingCommitFiles,
    prStatus, setPrComments,
    replyText, setReplyText, setIsSubmittingReply,
  } = data

  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const gitActions = createGitActions({ directory, onGitStatusRefresh, agentPtyId, onRecordPushToMain, data, sessionId: activeSessionId })

  const handleCommitMerge = async () => {
    if (!directory) return
    setIsCommitting(true)
    setCommitError(null)
    setGitOpError(null)
    setAgentMergeMessage(null)
    try {
      await withGitProgress(activeSessionId, async () => {
        // Stage all files (including resolved conflict files) before committing
        await window.git.stageAll(directory)
        const result = await window.git.commitMerge(directory)
        if (result.success) {
          onGitStatusRefresh?.()
        } else {
          const errorMsg = result.error || 'Merge commit failed'
          setCommitError(errorMsg)
          setGitOpError({ operation: 'Merge commit', message: errorMsg })
        }
      })
    } catch (err) {
      const errorMsg = String(err)
      setCommitError(errorMsg)
      setGitOpError({ operation: 'Merge commit', message: errorMsg })
    } finally {
      setIsCommitting(false)
    }
  }

  const handleResolveConflicts = async () => {
    if (!agentPtyId) return
    await window.pty.write(agentPtyId, 'resolve all merge conflicts\r')
    focusAgentTerminal()
    setAskedAgentToResolve(true)
    setAgentMergeMessage('Asked agent to resolve merge conflicts. Wait for the agent to finish, then commit the merge.')
  }

  const handleRevertFile = async (filePath: string) => {
    if (!directory) return
    if (!window.confirm(`Revert changes to "${filePath}"? This cannot be undone.`)) return
    try {
      await window.git.checkoutFile(directory, filePath)
      onGitStatusRefresh?.()
    } catch (err) {
      setGitOpError({ operation: 'Revert', message: String(err) })
    }
  }

  const handleStage = async (filePath: string) => {
    if (!directory) return
    try {
      await window.git.stage(directory, filePath)
      onGitStatusRefresh?.()
    } catch (err) {
      setGitOpError({ operation: 'Stage', message: String(err) })
    }
  }

  const handleStageAll = async () => {
    if (!directory) return
    try {
      await window.git.stageAll(directory)
      onGitStatusRefresh?.()
    } catch (err) {
      setGitOpError({ operation: 'Stage', message: String(err) })
    }
  }

  const handleUnstage = async (filePath: string) => {
    if (!directory) return
    try {
      await window.git.unstage(directory, filePath)
      onGitStatusRefresh?.()
    } catch (err) {
      setGitOpError({ operation: 'Unstage', message: String(err) })
    }
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
      await withGitProgress(activeSessionId, async () => {
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
      })
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
      } else {
        setGitOpError({ operation: 'Reply', message: result.error || 'Failed to post reply' })
      }
    } catch (err) {
      setGitOpError({ operation: 'Reply', message: String(err) })
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
    handleCommitMerge,
    handleResolveConflicts,
    handleToggleCommit,
    handleReplyToComment,
    ...gitActions,
  }
}
