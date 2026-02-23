import { useState, useEffect, useRef, useCallback } from 'react'
import type { NormalizedComment } from './useReviewData'

export interface GitHubPrDataState {
  prDescription: string | null
  prGitHubComments: NormalizedComment[]
  prCommentsLoading: boolean
  prCommentsHasMore: boolean
  loadOlderComments: () => void
  resetGitHubPrData: () => void
}

export function useGitHubPrData(sessionId: string, sessionDirectory: string, prNumber?: number): GitHubPrDataState {
  const [prDescription, setPrDescription] = useState<string | null>(null)
  const [prGitHubComments, setPrGitHubComments] = useState<NormalizedComment[]>([])
  const [prCommentsLoading, setPrCommentsLoading] = useState(false)
  const [prCommentsHasMore, setPrCommentsHasMore] = useState(false)
  const issueCommentsPageRef = useRef(1)

  const resetGitHubPrData = useCallback(() => {
    setPrDescription(null)
    setPrGitHubComments([])
    setPrCommentsHasMore(false)
    issueCommentsPageRef.current = 1
  }, [])

  // Fetch PR description from GitHub
  useEffect(() => {
    if (!prNumber || !sessionDirectory) {
      setPrDescription(null)
      return
    }
    window.gh.prDescription(sessionDirectory, prNumber).then(desc => {
      setPrDescription(desc)
    }).catch(() => {
      setPrDescription(null)
    })
  }, [sessionId, prNumber, sessionDirectory])

  // Fetch PR comments (both issue-level and review-level) from GitHub
  const fetchComments = useCallback(async (loadMore = false) => {
    if (!prNumber || !sessionDirectory) return

    setPrCommentsLoading(true)
    try {
      const issuePage = loadMore ? issueCommentsPageRef.current + 1 : 1
      const perPage = 20

      const [issueComments, reviewComments] = await Promise.all([
        window.gh.prIssueComments(sessionDirectory, prNumber, issuePage, perPage),
        window.gh.prComments(sessionDirectory, prNumber),
      ])

      const normalizedIssue: NormalizedComment[] = issueComments.map(c => ({
        id: c.id,
        body: c.body,
        author: c.author,
        createdAt: c.createdAt,
        url: c.url,
        type: 'issue' as const,
      }))

      const normalizedReview: NormalizedComment[] = reviewComments.map(c => ({
        id: c.id,
        body: c.body,
        author: c.author,
        createdAt: c.createdAt,
        url: c.url,
        type: 'review' as const,
        path: c.path,
        line: c.line,
        inReplyToId: c.inReplyToId,
      }))

      const merged = [...normalizedIssue, ...normalizedReview]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      if (loadMore) {
        issueCommentsPageRef.current = issuePage
        setPrGitHubComments(prev => {
          const existingIds = new Set(prev.map(c => c.id))
          const newComments = merged.filter(c => !existingIds.has(c.id))
          return [...prev, ...newComments].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        })
      } else {
        issueCommentsPageRef.current = 1
        setPrGitHubComments(merged)
      }

      setPrCommentsHasMore(issueComments.length >= perPage)
    } catch {
      // Non-fatal
    } finally {
      setPrCommentsLoading(false)
    }
  }, [prNumber, sessionDirectory])

  useEffect(() => {
    if (prNumber && sessionDirectory) {
      void fetchComments(false)
    } else {
      setPrGitHubComments([])
    }
  }, [sessionId, prNumber, sessionDirectory, fetchComments])

  const loadOlderComments = useCallback(() => {
    void fetchComments(true)
  }, [fetchComments])

  return {
    prDescription,
    prGitHubComments,
    prCommentsLoading,
    prCommentsHasMore,
    loadOlderComments,
    resetGitHubPrData,
  }
}
