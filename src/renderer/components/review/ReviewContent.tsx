import type { ReviewData, ReviewComparison, PendingComment, CodeLocation } from '../../types/review'
import type { NormalizedComment } from './useReviewData'
import { CollapsibleSection } from './CollapsibleSection'
import { LocationLink, SeverityBadge, ChangeStatusBadge } from './ReviewHelpers'

function SinceLastReviewSection({ data }: { data: NonNullable<ReviewData['changesSinceLastReview']> }) {
  return (
    <CollapsibleSection title="Since Last Review" defaultOpen={true}>
      <div className="space-y-3">
        <div className="text-sm text-text-primary leading-relaxed">{data.summary}</div>
        {data.responsesToComments.length > 0 && (
          <div>
            <div className="text-xs font-medium text-text-secondary mb-1">Responses to Comments</div>
            <div className="space-y-1.5">
              {data.responsesToComments.map((item, i) => (
                <div key={i} className="text-sm rounded border border-border bg-bg-primary p-2">
                  <div className="text-text-secondary text-xs">{item.comment}</div>
                  <div className="text-text-primary mt-0.5">{item.response}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.otherNotableChanges.length > 0 && (
          <div>
            <div className="text-xs font-medium text-text-secondary mb-1">Other Notable Changes</div>
            <ul className="list-disc list-inside text-sm text-text-primary space-y-0.5">
              {data.otherNotableChanges.map((change, i) => (
                <li key={i}>{change}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

function PrCommentsSection({
  prGitHubComments,
  prCommentsLoading,
  prCommentsHasMore,
  onLoadOlderComments,
  onClickLocation,
}: {
  prGitHubComments: NormalizedComment[]
  prCommentsLoading: boolean
  prCommentsHasMore: boolean
  onLoadOlderComments: () => void
  onClickLocation: (location: CodeLocation) => void
}) {
  // Group review comments: top-level threads and their replies
  const topLevel = prGitHubComments.filter(c => c.type === 'issue' || !c.inReplyToId)
  const replies = prGitHubComments.filter(c => c.type === 'review' && c.inReplyToId)
  const replyMap = new Map<number, NormalizedComment[]>()
  for (const reply of replies) {
    const existing = replyMap.get(reply.inReplyToId!) || []
    existing.push(reply)
    replyMap.set(reply.inReplyToId!, existing)
  }

  return (
    <CollapsibleSection title="PR Comments" count={prGitHubComments.length} defaultOpen={false}>
      <div className="space-y-2">
        {topLevel.map(comment => (
          <div key={comment.id}>
            <div className="rounded border border-border bg-bg-primary p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-text-primary">{comment.author}</span>
                <span className="text-[10px] text-text-secondary">{formatRelativeTime(comment.createdAt)}</span>
                {comment.type === 'review' && comment.path && (
                  <button
                    onClick={() => onClickLocation({
                      file: comment.path!,
                      startLine: comment.line || 1,
                    })}
                    className="text-[10px] text-accent hover:text-accent/80 font-mono truncate transition-colors ml-auto"
                  >
                    {comment.path.split('/').pop()}{comment.line ? `:${comment.line}` : ''}
                  </button>
                )}
              </div>
              <div className="text-xs text-text-primary whitespace-pre-wrap">{comment.body}</div>
            </div>
            {/* Threaded replies */}
            {replyMap.get(comment.id)?.map(reply => (
              <div key={reply.id} className="ml-4 mt-1 rounded border border-border/50 bg-bg-primary/50 p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-text-primary">{reply.author}</span>
                  <span className="text-[10px] text-text-secondary">{formatRelativeTime(reply.createdAt)}</span>
                </div>
                <div className="text-xs text-text-primary whitespace-pre-wrap">{reply.body}</div>
              </div>
            ))}
          </div>
        ))}

        {prCommentsLoading && (
          <div className="flex items-center justify-center py-2">
            <svg className="animate-spin w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {prCommentsHasMore && !prCommentsLoading && (
          <button
            onClick={onLoadOlderComments}
            className="w-full py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Show older comments
          </button>
        )}
      </div>
    </CollapsibleSection>
  )
}

interface ReviewContentProps {
  reviewData: ReviewData
  comparison: ReviewComparison | null
  comments: PendingComment[]
  unpushedCount: number
  directory: string
  prDescription: string | null
  prGitHubComments: NormalizedComment[]
  prCommentsLoading: boolean
  prCommentsHasMore: boolean
  onLoadOlderComments: () => void
  onClickLocation: (location: CodeLocation) => void
  onDeleteComment: (commentId: string) => void
}

export function ReviewContent({
  reviewData,
  comparison,
  comments,
  unpushedCount,
  directory,
  prDescription,
  prGitHubComments,
  prCommentsLoading,
  prCommentsHasMore,
  onLoadOlderComments,
  onClickLocation,
  onDeleteComment,
}: ReviewContentProps) {
  return (
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

      {/* Since Last Review (from agent's analysis) */}
      {reviewData.changesSinceLastReview && (
        <SinceLastReviewSection data={reviewData.changesSinceLastReview} />
      )}

      {/* PR Description */}
      {prDescription && (
        <CollapsibleSection title="PR Description" defaultOpen={true}>
          <div className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{prDescription}</div>
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
                      directory={directory}
                      onClick={() => onClickLocation(loc)}
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
                        directory={directory}
                        onClick={() => onClickLocation(loc)}
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
                        directory={directory}
                        onClick={() => onClickLocation(loc)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Pending Comments */}
      {comments.length > 0 && (
        <CollapsibleSection title="Pending Comments" count={unpushedCount}>
          <div className="space-y-2">
            {comments.map((comment) => (
              <div key={comment.id} className="rounded border border-border bg-bg-primary p-2">
                <div className="flex items-center gap-2 mb-1">
                  <button
                    onClick={() => onClickLocation({
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
                    onClick={() => onDeleteComment(comment.id)}
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

      {/* PR Comments from GitHub */}
      {prGitHubComments.length > 0 && (
        <PrCommentsSection
          prGitHubComments={prGitHubComments}
          prCommentsLoading={prCommentsLoading}
          prCommentsHasMore={prCommentsHasMore}
          onLoadOlderComments={onLoadOlderComments}
          onClickLocation={onClickLocation}
        />
      )}
    </>
  )
}
