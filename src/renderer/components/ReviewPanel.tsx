import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReviewData, PendingComment, CodeLocation, ReviewHistory, ReviewComparison, RequestedChange } from '../types/review'
import type { Session } from '../store/sessions'
import type { ManagedRepo } from '../../preload/index'
import { buildReviewPrompt } from '../utils/reviewPromptBuilder'

interface ReviewPanelProps {
  session: Session
  repo?: ManagedRepo
  onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void
}

function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-text-primary hover:bg-bg-tertiary/50 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform text-text-secondary ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>{title}</span>
        {count !== undefined && count > 0 && (
          <span className="ml-auto px-1.5 py-0.5 text-xs rounded-full bg-bg-tertiary text-text-secondary">
            {count}
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

function LocationLink({
  location,
  onClick,
}: {
  location: CodeLocation
  directory: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs text-accent hover:text-accent/80 font-mono truncate block transition-colors"
      title={`${location.file}:${location.startLine}`}
    >
      {location.file}:{location.startLine}
      {location.endLine && location.endLine !== location.startLine ? `-${location.endLine}` : ''}
    </button>
  )
}

function SeverityBadge({ severity }: { severity: 'info' | 'warning' | 'concern' }) {
  const colors = {
    info: 'bg-blue-500/20 text-blue-400',
    warning: 'bg-yellow-500/20 text-yellow-400',
    concern: 'bg-red-500/20 text-red-400',
  }
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${colors[severity]}`}>
      {severity}
    </span>
  )
}

function ChangeStatusBadge({ status }: { status: 'addressed' | 'not-addressed' | 'partially-addressed' }) {
  const colors = {
    'addressed': 'bg-green-500/20 text-green-400',
    'not-addressed': 'bg-red-500/20 text-red-400',
    'partially-addressed': 'bg-yellow-500/20 text-yellow-400',
  }
  const labels = {
    'addressed': 'Addressed',
    'not-addressed': 'Not addressed',
    'partially-addressed': 'Partial',
  }
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${colors[status]}`}>
      {labels[status]}
    </span>
  )
}

// Modal for gitignore confirmation
function GitignoreModal({
  onAddToGitignore,
  onContinueWithout,
  onCancel,
}: {
  onAddToGitignore: () => void
  onContinueWithout: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="bg-bg-secondary rounded-lg shadow-xl border border-border w-full max-w-md mx-4 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium text-text-primary mb-2">Add .broomy to .gitignore?</h3>
        <p className="text-sm text-text-secondary mb-4">
          The <code className="font-mono bg-bg-tertiary px-1 rounded">.broomy</code> folder stores review data.
          It's recommended to add it to your <code className="font-mono bg-bg-tertiary px-1 rounded">.gitignore</code>
          so review artifacts aren't committed.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onContinueWithout}
            className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors"
          >
            Continue without
          </button>
          <button
            onClick={onAddToGitignore}
            className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/80 transition-colors"
          >
            Add to .gitignore
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ReviewPanel({ session, repo, onSelectFile }: ReviewPanelProps) {
  // Use a ref to track the current session ID and reset state when it changes
  const currentSessionRef = useRef<string>(session.id)

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
  const broomyDir = `${session.directory}/.broomy`
  const reviewFilePath = `${broomyDir}/review.json`
  const commentsFilePath = `${broomyDir}/comments.json`
  const historyFilePath = `${broomyDir}/review-history.json`
  const promptFilePath = `${broomyDir}/review-prompt.md`

  // Reset state when session changes
  useEffect(() => {
    if (currentSessionRef.current !== session.id) {
      currentSessionRef.current = session.id
      setReviewData(null)
      setComments([])
      setComparison(null)
      setWaitingForAgent(false)
      setError(null)
      setPushResult(null)
      setMergeBase('')
    }
  }, [session.id])

  // Compute merge-base for correct PR diffs
  useEffect(() => {
    if (!session.directory) return
    const baseBranch = session.prBaseBranch || undefined
    window.git.branchChanges(session.directory, baseBranch).then((result) => {
      setMergeBase(result.mergeBase)
    }).catch(() => {
      setMergeBase('')
    })
  }, [session.directory, session.prBaseBranch])

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
    loadData()
  }, [session.id, reviewFilePath, commentsFilePath])

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
    loadComparison()
  }, [reviewData, historyFilePath, broomyDir])

  // Poll for review.json when waiting for agent
  useEffect(() => {
    if (!waitingForAgent) return

    const interval = setInterval(async () => {
      try {
        const exists = await window.fs.exists(reviewFilePath)
        if (exists) {
          const content = await window.fs.readFile(reviewFilePath)
          const data = JSON.parse(content) as ReviewData

          // Add head commit if not present
          if (!data.headCommit) {
            const headCommit = await window.git.headCommit(session.directory)
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
    }, 1000)

    return () => clearInterval(interval)
  }, [waitingForAgent, reviewFilePath, session.directory])

  const updateReviewHistory = async (data: ReviewData) => {
    try {
      let history: ReviewHistory = { reviews: [] }

      const historyExists = await window.fs.exists(historyFilePath)
      if (historyExists) {
        const content = await window.fs.readFile(historyFilePath)
        history = JSON.parse(content) as ReviewHistory
      }

      // Add this review to history if it has a different commit
      const exists = history.reviews.some(r => r.headCommit === data.headCommit)
      if (!exists && data.headCommit) {
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

  const checkGitignore = async (): Promise<boolean> => {
    try {
      const gitignorePath = `${session.directory}/.gitignore`
      const exists = await window.fs.exists(gitignorePath)
      if (!exists) return false

      const content = await window.fs.readFile(gitignorePath)
      const lines = content.split('\n').map(l => l.trim())
      return lines.some(line => line === '.broomy' || line === '.broomy/' || line === '/.broomy' || line === '/.broomy/')
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
            previousRequestedChanges = history.reviews[0].requestedChanges || []
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

  const handleGitignoreAdd = async () => {
    await addToGitignore()
    if (pendingGenerate) {
      await proceedWithGeneration()
    }
  }

  const handleGitignoreContinue = async () => {
    if (pendingGenerate) {
      await proceedWithGeneration()
    } else {
      setShowGitignoreModal(false)
    }
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
      const relativePath = (file: string) => file.replace(session.directory + '/', '')

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

  const unpushedCount = comments.filter(c => !c.pushed).length

  return (
    <div className="h-full flex flex-col bg-bg-secondary overflow-hidden">
      {/* Gitignore Modal */}
      {showGitignoreModal && (
        <GitignoreModal
          onAddToGitignore={handleGitignoreAdd}
          onContinueWithout={handleGitignoreContinue}
          onCancel={() => {
            setShowGitignoreModal(false)
            setPendingGenerate(false)
          }}
        />
      )}

      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-medium text-text-primary truncate flex-1">
            {session.prTitle || 'Review'}
          </h3>
          {session.prUrl && (
            <button
              onClick={handleOpenPrUrl}
              className="text-xs text-accent hover:text-accent/80 flex-shrink-0 transition-colors"
              title="Open PR on GitHub"
            >
              #{session.prNumber}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateReview}
            disabled={waitingForAgent || !session.agentPtyId}
            className="flex-1 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {waitingForAgent ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Waiting for agent...
              </span>
            ) : reviewData ? 'Regenerate Review' : 'Generate Review'}
          </button>
          {comments.length > 0 && session.prNumber && (
            <button
              onClick={handlePushComments}
              disabled={pushing || unpushedCount === 0}
              className="py-1.5 px-2 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent disabled:opacity-50 transition-colors"
              title="Push comments to GitHub as draft review"
            >
              {pushing ? 'Pushing...' : `Push (${unpushedCount})`}
            </button>
          )}
        </div>
        {error && (
          <div className="text-xs text-red-400 mt-1">{error}</div>
        )}
        {pushResult && (
          <div className="text-xs text-green-400 mt-1">{pushResult}</div>
        )}
      </div>

      {/* Review content */}
      <div className="flex-1 overflow-y-auto">
        {!reviewData && !waitingForAgent && (
          <div className="flex items-center justify-center h-full text-text-primary text-sm px-4 text-center">
            <div>
              <p className="mb-2">Click "Generate Review" to get an AI-generated structured review of this PR.</p>
              <p className="text-xs text-text-secondary">The review data will be stored in <code className="font-mono bg-bg-tertiary px-1 rounded">.broomy/</code> so your agent can reference it.</p>
            </div>
          </div>
        )}

        {waitingForAgent && !reviewData && (
          <div className="flex items-center justify-center h-full text-text-primary px-4">
            <div className="text-center max-w-xs">
              <div className="text-sm mb-3">
                Review instructions have been pasted into your agent terminal.
              </div>
              <div className="text-sm text-text-secondary mb-4">
                Press <kbd className="px-1.5 py-0.5 rounded bg-bg-tertiary border border-border font-mono text-xs">Enter</kbd> in the agent terminal to start the review.
              </div>
              <div className="text-xs text-text-secondary">
                The review will appear here once your agent writes it to <code className="font-mono bg-bg-tertiary px-1 rounded">.broomy/review.json</code>
              </div>
            </div>
          </div>
        )}

        {reviewData && (
          <>
            {/* Changes Since Last Review */}
            {comparison && comparison.requestedChangeStatus.length > 0 && (
              <CollapsibleSection title="Changes Since Last Review" count={comparison.requestedChangeStatus.length} defaultOpen={true}>
                <div className="space-y-2">
                  <div className="text-sm text-text-primary mb-2">
                    Status of previously requested changes:
                  </div>
                  {comparison.requestedChangeStatus.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <ChangeStatusBadge status={item.status} />
                      <div className="flex-1">
                        <div className="text-text-primary">{item.change.description}</div>
                        {item.notes && (
                          <div className="text-xs text-text-secondary mt-0.5">{item.notes}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {comparison.newCommitsSince.length > 0 && (
                    <div className="text-xs text-text-secondary mt-2 pt-2 border-t border-border">
                      {comparison.newCommitsSince.length} new commit{comparison.newCommitsSince.length !== 1 ? 's' : ''} since last review
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            )}

            {/* Overview */}
            <CollapsibleSection title="Overview" defaultOpen={true}>
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-medium text-text-secondary mb-1">Purpose</div>
                  <div className="text-sm text-text-primary leading-relaxed">{reviewData.overview.purpose}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-text-secondary mb-1">Approach</div>
                  <div className="text-sm text-text-primary leading-relaxed">{reviewData.overview.approach}</div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Change Patterns */}
            <CollapsibleSection title="Change Patterns" count={reviewData.changePatterns.length}>
              <div className="space-y-3">
                {reviewData.changePatterns.map((pattern) => (
                  <div key={pattern.id} className="text-sm">
                    <div className="font-medium text-text-primary">{pattern.title}</div>
                    <div className="text-text-secondary mt-0.5 leading-relaxed">{pattern.description}</div>
                    {pattern.locations.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {pattern.locations.map((loc, i) => (
                          <LocationLink
                            key={i}
                            location={loc}
                            directory={session.directory}
                            onClick={() => handleClickLocation(loc)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Potential Issues */}
            {reviewData.potentialIssues.length > 0 && (
              <CollapsibleSection title="Potential Issues" count={reviewData.potentialIssues.length}>
                <div className="space-y-3">
                  {reviewData.potentialIssues.map((issue) => (
                    <div key={issue.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={issue.severity} />
                        <span className="font-medium text-text-primary">{issue.title}</span>
                      </div>
                      <div className="text-text-secondary mt-0.5 leading-relaxed">{issue.description}</div>
                      {issue.locations.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {issue.locations.map((loc, i) => (
                            <LocationLink
                              key={i}
                              location={loc}
                              directory={session.directory}
                              onClick={() => handleClickLocation(loc)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Design Decisions */}
            {reviewData.designDecisions.length > 0 && (
              <CollapsibleSection title="Design Decisions" count={reviewData.designDecisions.length}>
                <div className="space-y-3">
                  {reviewData.designDecisions.map((decision) => (
                    <div key={decision.id} className="text-sm">
                      <div className="font-medium text-text-primary">{decision.title}</div>
                      <div className="text-text-secondary mt-0.5 leading-relaxed">{decision.description}</div>
                      {decision.alternatives && decision.alternatives.length > 0 && (
                        <div className="text-xs text-text-secondary mt-1">
                          <span className="font-medium">Alternatives: </span>
                          {decision.alternatives.join(', ')}
                        </div>
                      )}
                      {decision.locations.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {decision.locations.map((loc, i) => (
                            <LocationLink
                              key={i}
                              location={loc}
                              directory={session.directory}
                              onClick={() => handleClickLocation(loc)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}
          </>
        )}

        {/* Pending Comments */}
        {comments.length > 0 && (
          <CollapsibleSection title="Pending Comments" count={unpushedCount}>
            <div className="space-y-2">
              {comments.map((comment) => (
                <div key={comment.id} className="rounded border border-border bg-bg-primary p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={() => handleClickLocation({
                        file: comment.file,
                        startLine: comment.line,
                      })}
                      className="text-xs text-accent hover:text-accent/80 font-mono truncate transition-colors"
                    >
                      {comment.file.split('/').pop()}:{comment.line}
                    </button>
                    {comment.pushed && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-green-500/20 text-green-400">pushed</span>
                    )}
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="ml-auto text-text-secondary hover:text-red-400 transition-colors"
                      title="Delete comment"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18" />
                        <path d="M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-xs text-text-primary">{comment.body}</div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  )
}
