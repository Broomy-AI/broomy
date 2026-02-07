import { useState, useEffect, useCallback } from 'react'
import type { ReviewData, PendingComment, CodeLocation } from '../types/review'
import type { Session } from '../store/sessions'
import type { ManagedRepo } from '../../preload/index'

interface ReviewPanelProps {
  session: Session
  repo?: ManagedRepo
  onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void
}

function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
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
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="uppercase tracking-wider">{title}</span>
        {count !== undefined && count > 0 && (
          <span className="ml-auto px-1.5 py-0.5 text-[10px] rounded-full bg-bg-tertiary text-text-secondary">
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

export default function ReviewPanel({ session, repo, onSelectFile }: ReviewPanelProps) {
  const [reviewData, setReviewData] = useState<ReviewData | null>(null)
  const [comments, setComments] = useState<PendingComment[]>([])
  const [generating, setGenerating] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Agent writes to .broomy-review/ in repo; we move results to /tmp
  const repoReviewDir = `${session.directory}/.broomy-review`
  const repoReviewFilePath = `${repoReviewDir}/review.json`
  const tmpDir = `/tmp/broomy-review-${session.id}`
  const tmpReviewFilePath = `${tmpDir}/review.json`
  const commentsFilePath = `${tmpDir}/comments.json`

  // Load review data and comments from tmp dir on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const exists = await window.fs.exists(tmpReviewFilePath)
        if (exists) {
          const content = await window.fs.readFile(tmpReviewFilePath)
          const data = JSON.parse(content) as ReviewData
          setReviewData(data)
        }
      } catch {
        // No review data yet
      }

      try {
        const exists = await window.fs.exists(commentsFilePath)
        if (exists) {
          const content = await window.fs.readFile(commentsFilePath)
          setComments(JSON.parse(content))
        }
      } catch {
        // No comments yet
      }
    }
    loadData()
  }, [session.id, tmpReviewFilePath, commentsFilePath])

  // Poll for review.json in repo when generating, then move to tmp
  useEffect(() => {
    if (!generating) return

    const interval = setInterval(async () => {
      try {
        const exists = await window.fs.exists(repoReviewFilePath)
        if (exists) {
          const content = await window.fs.readFile(repoReviewFilePath)
          const data = JSON.parse(content) as ReviewData
          // Save to tmp dir
          await window.fs.mkdir(tmpDir)
          await window.fs.writeFile(tmpReviewFilePath, content)
          // Clean up .broomer-review/ from repo
          try {
            await window.fs.rm(repoReviewDir)
          } catch {
            // Non-fatal: cleanup failure doesn't affect functionality
          }
          setReviewData(data)
          setGenerating(false)
        }
      } catch {
        // File may not exist yet or be partially written
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [generating, repoReviewFilePath, tmpDir, tmpReviewFilePath, repoReviewDir])

  const handleGenerateReview = useCallback(async () => {
    if (!session.agentPtyId) {
      setError('No agent terminal found. Wait for the agent to start.')
      return
    }

    setGenerating(true)
    setError(null)

    try {
      // Create .broomy-review/ in repo for agent to write to
      await window.fs.mkdir(repoReviewDir)

      // Ensure tmp dir exists for comments
      await window.fs.mkdir(tmpDir)

      // Build the review prompt
      const reviewInstructions = repo?.reviewInstructions || ''
      const prompt = buildReviewPrompt(session, reviewInstructions)

      // Write the prompt file
      await window.fs.writeFile(`${repoReviewDir}/prompt.md`, prompt)

      // Send command to agent terminal (user must press enter to confirm)
      await window.pty.write(session.agentPtyId, 'Please read and follow the instructions in .broomy-review/prompt.md')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGenerating(false)
    }
  }, [session, repo, repoReviewDir, tmpDir])

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
    const baseBranch = session.prBaseBranch || 'main'
    onSelectFile(fullPath, true, location.startLine, baseBranch)
  }, [session.directory, session.prBaseBranch, onSelectFile])

  const unpushedCount = comments.filter(c => !c.pushed).length

  return (
    <div className="h-full flex flex-col bg-bg-secondary overflow-hidden">
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
            disabled={generating || !session.agentPtyId}
            className="flex-1 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
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
        {!reviewData && !generating && (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm px-4 text-center">
            Click "Generate Review" to get an AI-generated structured review of this PR.
          </div>
        )}

        {generating && !reviewData && (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            <div className="text-center">
              <svg className="animate-spin w-6 h-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing PR diff...
            </div>
          </div>
        )}

        {reviewData && (
          <>
            {/* Overview */}
            <CollapsibleSection title="Overview">
              <div className="space-y-2">
                <div>
                  <div className="text-xs font-medium text-text-secondary mb-0.5">Purpose</div>
                  <div className="text-sm text-text-primary">{reviewData.overview.purpose}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-text-secondary mb-0.5">Approach</div>
                  <div className="text-sm text-text-primary">{reviewData.overview.approach}</div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Change Patterns */}
            <CollapsibleSection title="Change Patterns" count={reviewData.changePatterns.length}>
              <div className="space-y-3">
                {reviewData.changePatterns.map((pattern) => (
                  <div key={pattern.id} className="text-sm">
                    <div className="font-medium text-text-primary">{pattern.title}</div>
                    <div className="text-text-secondary text-xs mt-0.5">{pattern.description}</div>
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
                      <div className="text-text-secondary text-xs mt-0.5">{issue.description}</div>
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
                      <div className="text-text-secondary text-xs mt-0.5">{decision.description}</div>
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

// Build the review generation prompt
function buildReviewPrompt(session: Session, reviewInstructions: string): string {
  const schema = `{
  "version": 1,
  "generatedAt": "<ISO 8601 timestamp>",
  "prNumber": ${session.prNumber || 'null'},
  "prTitle": ${session.prTitle ? JSON.stringify(session.prTitle) : 'null'},
  "overview": {
    "purpose": "<1-2 sentence summary of what this PR does>",
    "approach": "<1-2 sentence summary of how it achieves it>"
  },
  "changePatterns": [
    {
      "id": "<unique id>",
      "title": "<pattern name>",
      "description": "<what this group of changes does>",
      "locations": [{ "file": "<relative path>", "startLine": <number>, "endLine": <number> }]
    }
  ],
  "potentialIssues": [
    {
      "id": "<unique id>",
      "severity": "info|warning|concern",
      "title": "<issue title>",
      "description": "<explanation>",
      "locations": [{ "file": "<relative path>", "startLine": <number>, "endLine": <number> }]
    }
  ],
  "designDecisions": [
    {
      "id": "<unique id>",
      "title": "<decision>",
      "description": "<explanation of the choice>",
      "alternatives": ["<alternative approach 1>"],
      "locations": [{ "file": "<relative path>", "startLine": <number>, "endLine": <number> }]
    }
  ]
}`

  const baseBranch = session.prBaseBranch || 'main'

  let prompt = `# PR Review Analysis

You are reviewing a pull request. Analyze the diff and produce a structured review.

## Instructions

1. Run \`git diff ${baseBranch}...HEAD\` to see the full diff
2. Examine the changed files to understand the context
3. Produce a structured JSON review and write it to \`.broomy-review/review.json\`

## Output Format

Write the following JSON to \`.broomy-review/review.json\`:

\`\`\`json
${schema}
\`\`\`

## Guidelines

- **Change Patterns**: Group related changes together. Don't just list every file - identify logical groups.
- **Potential Issues**: Only flag real concerns. Use severity levels:
  - \`info\`: Observations, suggestions, style preferences
  - \`warning\`: Potential bugs, edge cases, missing error handling
  - \`concern\`: Likely bugs, security issues, data loss risks
- **Design Decisions**: Note significant architectural choices, not trivial ones.
- Keep descriptions concise but informative.
- Use relative file paths from the repo root.
- Include specific line numbers where relevant.
`

  if (reviewInstructions) {
    prompt += `
## Additional Review Focus

${reviewInstructions}
`
  }

  prompt += `
## Action

Please analyze the PR now and write the result to \`.broomy-review/review.json\`.
`

  return prompt
}
