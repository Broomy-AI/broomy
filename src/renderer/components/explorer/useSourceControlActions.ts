/**
 * Hook providing git infrastructure action handlers (commit, stage, sync).
 *
 * Agent-dispatching actions (commit with AI, create PR, push to main, resolve conflicts, review)
 * are now handled by the modular commands.json system via ActionButtons.
 */
import type { SourceControlData } from './useSourceControlData'
import { withGitProgress } from '../../utils/gitOperationProgress'
import { useSessionStore } from '../../store/sessions'

export interface SourceControlActionsProps {
  directory?: string
  onGitStatusRefresh?: () => void
  agentPtyId?: string
  agentId?: string | null
  onRecordPushToMain?: (commitHash: string) => void
  data: SourceControlData
}

export function useSourceControlActions({
  directory,
  onGitStatusRefresh,
  data,
}: SourceControlActionsProps) {
  const {
    setIsCommitting, setCommitError,
    setGitOpError, setAgentMergeMessage,
    setIsSyncing, setIsSyncingWithMain,
    branchBaseName: _branchBaseName, gitStatus,
    expandedCommits, setExpandedCommits,
    commitFilesByHash, setCommitFilesByHash,
    setLoadingCommitFiles,
  } = data

  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const refreshBranches = () => { void useSessionStore.getState().refreshAllBranches() }

  const handleSync = async () => {
    if (!directory) return

    if (gitStatus.length > 0) {
      setGitOpError({ operation: 'Sync', message: 'Commit or stash changes before syncing' })
      return
    }

    setIsSyncing(true)
    setGitOpError(null)
    try {
      await withGitProgress(activeSessionId, async () => {
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
        refreshBranches()
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
      await withGitProgress(activeSessionId, async () => {
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



  const handleCommitMerge = async () => {
    if (!directory) return
    setIsCommitting(true)
    setCommitError(null)
    setGitOpError(null)
    setAgentMergeMessage(null)
    try {
      await withGitProgress(activeSessionId, async () => {
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

  const handleCommit = async (message: string, stageAll?: boolean) => {
    if (!directory) return
    setIsCommitting(true)
    setGitOpError(null)
    try {
      await withGitProgress(activeSessionId, async () => {
        if (stageAll) {
          const stageResult = await window.git.stageAll(directory)
          if (!stageResult.success) {
            setGitOpError({ operation: 'Stage All', message: stageResult.error || 'Failed to stage changes' })
            return
          }
        }
        const result = await window.git.commit(directory, message)
        if (result.success) {
          onGitStatusRefresh?.()
        } else {
          setGitOpError({ operation: 'Commit', message: result.error || 'Commit failed' })
        }
      })
    } catch (err) {
      setGitOpError({ operation: 'Commit', message: String(err) })
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

  return {
    handleStage,
    handleStageAll,
    handleUnstage,
    handleCommit,
    handleCommitMerge,
    handleSync,
    handleSyncWithMain,
    handleToggleCommit,
  }
}
