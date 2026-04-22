/**
 * Hook providing git infrastructure action handlers (merge commit, stage, sync).
 *
 * Agent-dispatching actions (commit, create PR, merge PR, resolve conflicts, review)
 * are handled by the modular commands.json system via ActionButtons.
 */
import type { SourceControlData } from './useSourceControlData'
import { withGitProgress } from '../../../../features/git/gitOperationProgress'
import { useSessionStore } from '../../../../store/sessions'

export interface SourceControlActionsProps {
  directory?: string
  onGitStatusRefresh?: () => void
  agentPtyId?: string
  agentId?: string | null
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
    setIsSyncing,
    gitStatus,
    expandedCommits, setExpandedCommits,
    commitFilesByHash, setCommitFilesByHash,
    setLoadingCommitFiles,
  } = data

  const activeSessionId = useSessionStore((s) => s.activeSessionId)

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
      })
    } catch (err) {
      setGitOpError({ operation: 'Sync', message: String(err) })
    } finally {
      setIsSyncing(false)
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
    handleCommitMerge,
    handleSync,
    handleToggleCommit,
  }
}
