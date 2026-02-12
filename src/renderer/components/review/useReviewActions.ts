import { useCallback } from 'react'
import type { CodeLocation, RequestedChange, ReviewHistory } from '../../types/review'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import { buildReviewPrompt } from '../../utils/reviewPromptBuilder'
import type { ReviewDataState } from './useReviewData'

export interface ReviewActions {
  handleGenerateReview: () => Promise<void>
  handlePushComments: () => Promise<void>
  handleDeleteComment: (commentId: string) => Promise<void>
  handleOpenPrUrl: () => void
  handleClickLocation: (location: CodeLocation) => void
  handleGitignoreAdd: () => Promise<void>
  handleGitignoreContinue: () => Promise<void>
  handleGitignoreCancel: () => void
}

export function useReviewActions(
  session: Session,
  repo: ManagedRepo | undefined,
  onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void,
  state: ReviewDataState,
): ReviewActions {
  const {
    comments,
    mergeBase,
    broomyDir,
    commentsFilePath,
    historyFilePath,
    promptFilePath,
    setWaitingForAgent,
    setPushing,
    setPushResult,
    setError,
    setShowGitignoreModal,
    setPendingGenerate,
    setComments,
  } = state

  const checkGitignore = async (): Promise<boolean> => {
    try {
      const gitignorePath = `${session.directory}/.gitignore`
      const exists = await window.fs.exists(gitignorePath)
      if (!exists) return false

      const content = await window.fs.readFile(gitignorePath)
      const lines = content.split('\n').map((l: string) => l.trim())
      return lines.some((line: string) => line === '.broomy' || line === '.broomy/' || line === '/.broomy' || line === '/.broomy/')
    } catch {
      return false
    }
  }

  const addToGitignore = async () => {
    try {
      const gitignorePath = `${session.directory}/.gitignore`
      const exists = await window.fs.exists(gitignorePath)

      if (exists) {
        await window.fs.appendFile(gitignorePath, '\n# Broomy review data\n.broomy/\n')
      } else {
        await window.fs.writeFile(gitignorePath, '# Broomy review data\n.broomy/\n')
      }
    } catch (err) {
      setError(`Failed to update .gitignore: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const proceedWithGeneration = async () => {
    setShowGitignoreModal(false)
    setPendingGenerate(false)
    setWaitingForAgent(true)
    setError(null)

    try {
      // Create .broomy directory
      await window.fs.mkdir(broomyDir)

      // Get previous review history for comparison
      let previousRequestedChanges: RequestedChange[] = []
      try {
        const historyExists = await window.fs.exists(historyFilePath)
        if (historyExists) {
          const content = await window.fs.readFile(historyFilePath)
          const history = JSON.parse(content) as ReviewHistory
          if (history.reviews.length > 0) {
            previousRequestedChanges = history.reviews[0].requestedChanges
          }
        }
      } catch {
        // Non-fatal
      }

      // Build the review prompt
      const reviewInstructions = repo?.reviewInstructions || ''
      const prompt = buildReviewPrompt(session, reviewInstructions, previousRequestedChanges)

      // Write the prompt file
      await window.fs.writeFile(promptFilePath, prompt)

      // Send command to agent terminal (user must press enter to confirm)
      await window.pty.write(session.agentPtyId!, 'Please read and follow the instructions in .broomy/review-prompt.md')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setWaitingForAgent(false)
    }
  }

  const handleGenerateReview = useCallback(async () => {
    if (!session.agentPtyId) {
      setError('No agent terminal found. Wait for the agent to start.')
      return
    }

    // Check gitignore first
    const inGitignore = await checkGitignore()
    if (!inGitignore) {
      setPendingGenerate(true)
      setShowGitignoreModal(true)
      return
    }

    await proceedWithGeneration()
  }, [session])

  const handleGitignoreAdd = async () => {
    await addToGitignore()
    await proceedWithGeneration()
  }

  const handleGitignoreContinue = async () => {
    await proceedWithGeneration()
  }

  const handleGitignoreCancel = () => {
    setShowGitignoreModal(false)
    setPendingGenerate(false)
  }

  const handlePushComments = useCallback(async () => {
    if (!session.prNumber || comments.length === 0) return

    const unpushedComments = comments.filter(c => !c.pushed)
    if (unpushedComments.length === 0) {
      setPushResult('All comments already pushed')
      setTimeout(() => setPushResult(null), 3000)
      return
    }

    setPushing(true)
    setPushResult(null)

    try {
      const relativePath = (file: string) => file.replace(`${session.directory  }/`, '')

      const result = await window.gh.submitDraftReview(
        session.directory,
        session.prNumber,
        unpushedComments.map(c => ({
          path: relativePath(c.file),
          line: c.line,
          body: c.body,
        }))
      )

      if (result.success) {
        // Mark comments as pushed
        const updatedComments = comments.map(c =>
          unpushedComments.find(u => u.id === c.id) ? { ...c, pushed: true } : c
        )
        setComments(updatedComments)
        await window.fs.writeFile(commentsFilePath, JSON.stringify(updatedComments, null, 2))
        setPushResult(`Pushed ${unpushedComments.length} comment${unpushedComments.length !== 1 ? 's' : ''} as draft review`)
      } else {
        setPushResult(`Failed: ${result.error}`)
      }
    } catch (err) {
      setPushResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPushing(false)
      setTimeout(() => setPushResult(null), 5000)
    }
  }, [session, comments, commentsFilePath])

  const handleDeleteComment = useCallback(async (commentId: string) => {
    const updatedComments = comments.filter(c => c.id !== commentId)
    setComments(updatedComments)
    await window.fs.writeFile(commentsFilePath, JSON.stringify(updatedComments, null, 2))
  }, [comments, commentsFilePath])

  const handleOpenPrUrl = useCallback(() => {
    if (session.prUrl) {
      window.open(session.prUrl, '_blank')
    }
  }, [session.prUrl])

  const handleClickLocation = useCallback((location: CodeLocation) => {
    const fullPath = location.file.startsWith('/')
      ? location.file
      : `${session.directory}/${location.file}`
    // Use merge-base SHA for correct PR diffs (matches what GitHub shows)
    const diffRef = mergeBase || `origin/${session.prBaseBranch || 'main'}`
    onSelectFile(fullPath, true, location.startLine, diffRef)
  }, [session.directory, session.prBaseBranch, mergeBase, onSelectFile])

  return {
    handleGenerateReview,
    handlePushComments,
    handleDeleteComment,
    handleOpenPrUrl,
    handleClickLocation,
    handleGitignoreAdd,
    handleGitignoreContinue,
    handleGitignoreCancel,
  }
}
