/**
 * Hook that manages all review panel state: markdown review content and generation status.
 */
import { useState, useEffect, useRef } from 'react'
import { useReviewFilePoller } from './useReviewFilePoller'

export type FetchingStatus = 'fetching' | 'sent' | null

export interface ReviewDataState {
  reviewMarkdown: string | null
  fetching: boolean
  waitingForAgent: boolean
  fetchingStatus: FetchingStatus
  error: string | null
  showGitignoreModal: boolean
  pendingGenerate: boolean
  mergeBase: string
  broomyDir: string
  outputDir: string
  reviewFilePath: string
  promptFilePath: string
  setReviewMarkdown: React.Dispatch<React.SetStateAction<string | null>>
  setFetching: React.Dispatch<React.SetStateAction<boolean>>
  setWaitingForAgent: React.Dispatch<React.SetStateAction<boolean>>
  setFetchingStatus: React.Dispatch<React.SetStateAction<FetchingStatus>>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  setShowGitignoreModal: React.Dispatch<React.SetStateAction<boolean>>
  setPendingGenerate: React.Dispatch<React.SetStateAction<boolean>>
  setMergeBase: React.Dispatch<React.SetStateAction<string>>
}

export function useReviewData(sessionId: string, sessionDirectory: string, prBaseBranch?: string): ReviewDataState {
  const currentSessionRef = useRef<string>(sessionId)

  const [reviewMarkdown, setReviewMarkdown] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [waitingForAgent, setWaitingForAgent] = useState(false)
  const [fetchingStatus, setFetchingStatus] = useState<FetchingStatus>(null)
  const [error, setError] = useState<string | null>(null)
  const [showGitignoreModal, setShowGitignoreModal] = useState(false)
  const [pendingGenerate, setPendingGenerate] = useState(false)
  const [mergeBase, setMergeBase] = useState<string>('')

  // Generated files live in .broomy/output/ (gitignored via .broomy/.gitignore)
  const broomyDir = `${sessionDirectory}/.broomy`
  const outputDir = `${broomyDir}/output`
  const reviewFilePath = `${outputDir}/review.md`
  const promptFilePath = `${outputDir}/review-prompt.md`

  // Reset state when session changes
  useEffect(() => {
    if (currentSessionRef.current !== sessionId) {
      currentSessionRef.current = sessionId
      setReviewMarkdown(null)
      setFetching(false)
      setWaitingForAgent(false)
      setFetchingStatus(null)
      setError(null)
      setMergeBase('')
    }
  }, [sessionId])

  // Compute merge-base for correct PR diffs
  useEffect(() => {
    if (!sessionDirectory) return
    const baseBranch = prBaseBranch || undefined
    window.git.branchChanges(sessionDirectory, baseBranch).then((result: { mergeBase: string }) => {
      setMergeBase(result.mergeBase)
    }).catch(() => {
      setMergeBase('')
    })
  }, [sessionDirectory, prBaseBranch])

  // Load review markdown from .broomy/review.md on mount and session change
  useEffect(() => {
    const loadData = async () => {
      try {
        const exists = await window.fs.exists(reviewFilePath)
        if (exists) {
          const content = await window.fs.readFile(reviewFilePath)
          setReviewMarkdown(content)
        } else {
          setReviewMarkdown(null)
        }
      } catch {
        setReviewMarkdown(null)
      }
    }
    void loadData()
  }, [sessionId, reviewFilePath])

  // Poll for review.md changes every second
  useReviewFilePoller({
    reviewFilePath, sessionDirectory,
    setReviewMarkdown, setWaitingForAgent,
  })

  return {
    reviewMarkdown,
    fetching,
    waitingForAgent,
    fetchingStatus,
    error,
    showGitignoreModal,
    pendingGenerate,
    mergeBase,
    broomyDir,
    outputDir,
    reviewFilePath,
    promptFilePath,
    setReviewMarkdown,
    setFetching,
    setWaitingForAgent,
    setFetchingStatus,
    setError,
    setShowGitignoreModal,
    setPendingGenerate,
    setMergeBase,
  }
}
