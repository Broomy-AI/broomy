import { useState, useEffect, useRef } from 'react'
import type { ReviewData, PendingComment, ReviewComparison, ReviewHistory } from '../../types/review'

export interface ReviewDataState {
  reviewData: ReviewData | null
  comments: PendingComment[]
  comparison: ReviewComparison | null
  waitingForAgent: boolean
  pushing: boolean
  pushResult: string | null
  error: string | null
  showGitignoreModal: boolean
  pendingGenerate: boolean
  mergeBase: string
  unpushedCount: number
  broomyDir: string
  reviewFilePath: string
  commentsFilePath: string
  historyFilePath: string
  promptFilePath: string
  setReviewData: React.Dispatch<React.SetStateAction<ReviewData | null>>
  setComments: React.Dispatch<React.SetStateAction<PendingComment[]>>
  setComparison: React.Dispatch<React.SetStateAction<ReviewComparison | null>>
  setWaitingForAgent: React.Dispatch<React.SetStateAction<boolean>>
  setPushing: React.Dispatch<React.SetStateAction<boolean>>
  setPushResult: React.Dispatch<React.SetStateAction<string | null>>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  setShowGitignoreModal: React.Dispatch<React.SetStateAction<boolean>>
  setPendingGenerate: React.Dispatch<React.SetStateAction<boolean>>
  setMergeBase: React.Dispatch<React.SetStateAction<string>>
}

export function useReviewData(sessionId: string, sessionDirectory: string, prBaseBranch?: string): ReviewDataState {
  const currentSessionRef = useRef<string>(sessionId)

  const [reviewData, setReviewData] = useState<ReviewData | null>(null)
  const [comments, setComments] = useState<PendingComment[]>([])
  const [comparison, setComparison] = useState<ReviewComparison | null>(null)
  const [waitingForAgent, setWaitingForAgent] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showGitignoreModal, setShowGitignoreModal] = useState(false)
  const [pendingGenerate, setPendingGenerate] = useState(false)
  const [mergeBase, setMergeBase] = useState<string>('')

  // All files live in .broomy folder in the repo
  const broomyDir = `${sessionDirectory}/.broomy`
  const reviewFilePath = `${broomyDir}/review.json`
  const commentsFilePath = `${broomyDir}/comments.json`
  const historyFilePath = `${broomyDir}/review-history.json`
  const promptFilePath = `${broomyDir}/review-prompt.md`

  // Reset state when session changes
  useEffect(() => {
    if (currentSessionRef.current !== sessionId) {
      currentSessionRef.current = sessionId
      setReviewData(null)
      setComments([])
      setComparison(null)
      setWaitingForAgent(false)
      setError(null)
      setPushResult(null)
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

  // Load review data and comments from .broomy folder on mount and session change
  useEffect(() => {
    const loadData = async () => {
      try {
        const exists = await window.fs.exists(reviewFilePath)
        if (exists) {
          const content = await window.fs.readFile(reviewFilePath)
          const data = JSON.parse(content) as ReviewData
          setReviewData(data)
        } else {
          setReviewData(null)
        }
      } catch {
        setReviewData(null)
      }

      try {
        const exists = await window.fs.exists(commentsFilePath)
        if (exists) {
          const content = await window.fs.readFile(commentsFilePath)
          setComments(JSON.parse(content))
        } else {
          setComments([])
        }
      } catch {
        setComments([])
      }
    }
    void loadData()
  }, [sessionId, reviewFilePath, commentsFilePath])

  // Load comparison data if we have a previous review
  useEffect(() => {
    const loadComparison = async () => {
      if (!reviewData) {
        setComparison(null)
        return
      }

      try {
        const historyExists = await window.fs.exists(historyFilePath)
        if (!historyExists) {
          setComparison(null)
          return
        }

        const historyContent = await window.fs.readFile(historyFilePath)
        const history = JSON.parse(historyContent) as ReviewHistory

        // Find previous review (not the current one)
        const previousReview = history.reviews.find(r => r.headCommit !== reviewData.headCommit)
        if (!previousReview) {
          setComparison(null)
          return
        }

        // Get comparison data from the review if it includes it
        // The agent should include this in the review.json when there's history
        const comparisonPath = `${broomyDir}/comparison.json`
        const comparisonExists = await window.fs.exists(comparisonPath)
        if (comparisonExists) {
          const comparisonContent = await window.fs.readFile(comparisonPath)
          setComparison(JSON.parse(comparisonContent) as ReviewComparison)
        } else {
          setComparison(null)
        }
      } catch {
        setComparison(null)
      }
    }
    void loadComparison()
  }, [reviewData, historyFilePath, broomyDir])

  // Poll for review.json when waiting for agent
  useEffect(() => {
    if (!waitingForAgent) return

    const updateReviewHistory = async (data: ReviewData) => {
      try {
        let history: ReviewHistory = { reviews: [] }

        const historyExists = await window.fs.exists(historyFilePath)
        if (historyExists) {
          const content = await window.fs.readFile(historyFilePath)
          history = JSON.parse(content) as ReviewHistory
        }

        // Add this review to history if it has a different commit
        const alreadyExists = history.reviews.some(r => r.headCommit === data.headCommit)
        if (!alreadyExists && data.headCommit) {
          history.reviews.unshift({
            generatedAt: data.generatedAt,
            headCommit: data.headCommit,
            requestedChanges: data.requestedChanges || [],
          })
          // Keep only last 10 reviews
          history.reviews = history.reviews.slice(0, 10)
          await window.fs.writeFile(historyFilePath, JSON.stringify(history, null, 2))
        }
      } catch {
        // Non-fatal
      }
    }

    const interval = setInterval(() => {
      void (async () => {
        try {
          const exists = await window.fs.exists(reviewFilePath)
          if (exists) {
            const content = await window.fs.readFile(reviewFilePath)
            const data = JSON.parse(content) as ReviewData

            // Add head commit if not present
            if (!data.headCommit) {
              const headCommit = await window.git.headCommit(sessionDirectory)
              if (headCommit) {
                data.headCommit = headCommit
                await window.fs.writeFile(reviewFilePath, JSON.stringify(data, null, 2))
              }
            }

            // Update history
            await updateReviewHistory(data)

            setReviewData(data)
            setWaitingForAgent(false)
          }
        } catch {
          // File may not exist yet or be partially written
        }
      })()
    }, 1000)

    return () => clearInterval(interval)
  }, [waitingForAgent, reviewFilePath, sessionDirectory, historyFilePath])

  const unpushedCount = comments.filter(c => !c.pushed).length

  return {
    reviewData,
    comments,
    comparison,
    waitingForAgent,
    pushing,
    pushResult,
    error,
    showGitignoreModal,
    pendingGenerate,
    mergeBase,
    unpushedCount,
    broomyDir,
    reviewFilePath,
    commentsFilePath,
    historyFilePath,
    promptFilePath,
    setReviewData,
    setComments,
    setComparison,
    setWaitingForAgent,
    setPushing,
    setPushResult,
    setError,
    setShowGitignoreModal,
    setPendingGenerate,
    setMergeBase,
  }
}
