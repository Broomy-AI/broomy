import { useEffect, useRef } from 'react'
import type { ReviewData, ReviewHistory } from '../../types/review'

interface PollerOptions {
  reviewFilePath: string
  commentsFilePath: string
  historyFilePath: string
  sessionDirectory: string
  reviewData: ReviewData | null
  setReviewData: React.Dispatch<React.SetStateAction<ReviewData | null>>
  setComments: React.Dispatch<React.SetStateAction<unknown[]>>
  setWaitingForAgent: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * Polls review.json and comments.json for changes every second.
 * Updates reviewData and comments when the files change on disk.
 */
export function useReviewFilePoller(options: PollerOptions): void {
  const {
    reviewFilePath, commentsFilePath, historyFilePath, sessionDirectory,
    reviewData, setReviewData, setComments, setWaitingForAgent,
  } = options

  const lastSeenGeneratedAtRef = useRef<string | null>(null)
  const lastSeenCommentsRef = useRef<string | null>(null)

  // Keep the ref in sync with loaded review data
  useEffect(() => {
    lastSeenGeneratedAtRef.current = reviewData?.generatedAt ?? null
  }, [reviewData])

  useEffect(() => {
    const updateReviewHistory = async (data: ReviewData) => {
      try {
        let history: ReviewHistory = { reviews: [] }

        const historyExists = await window.fs.exists(historyFilePath)
        if (historyExists) {
          const content = await window.fs.readFile(historyFilePath)
          history = JSON.parse(content) as ReviewHistory
        }

        const alreadyExists = history.reviews.some(r => r.headCommit === data.headCommit)
        if (!alreadyExists && data.headCommit) {
          history.reviews.unshift({
            generatedAt: data.generatedAt,
            headCommit: data.headCommit,
            requestedChanges: data.requestedChanges || [],
          })
          history.reviews = history.reviews.slice(0, 10)
          await window.fs.writeFile(historyFilePath, JSON.stringify(history, null, 2))
        }
      } catch {
        // Non-fatal
      }
    }

    const interval = setInterval(() => {
      void (async () => {
        // Check for review.json changes
        try {
          const exists = await window.fs.exists(reviewFilePath)
          if (exists) {
            const content = await window.fs.readFile(reviewFilePath)
            const data = JSON.parse(content) as ReviewData

            if (data.generatedAt !== lastSeenGeneratedAtRef.current) {
              if (!data.headCommit) {
                const headCommit = await window.git.headCommit(sessionDirectory)
                if (headCommit) {
                  data.headCommit = headCommit
                  await window.fs.writeFile(reviewFilePath, JSON.stringify(data, null, 2))
                }
              }

              await updateReviewHistory(data)
              setReviewData(data)
              setWaitingForAgent(false)
            }
          } else if (lastSeenGeneratedAtRef.current !== null) {
            setReviewData(null)
          }
        } catch {
          // File may not exist yet or be partially written
        }

        // Check for comments.json changes
        try {
          const exists = await window.fs.exists(commentsFilePath)
          if (exists) {
            const content = await window.fs.readFile(commentsFilePath)
            if (content !== lastSeenCommentsRef.current) {
              lastSeenCommentsRef.current = content
              setComments(JSON.parse(content))
            }
          }
        } catch {
          // Non-fatal
        }
      })()
    }, 1000)

    return () => clearInterval(interval)
  }, [reviewFilePath, commentsFilePath, sessionDirectory, historyFilePath, setReviewData, setComments, setWaitingForAgent])
}
