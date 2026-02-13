import type { PrComment } from './types'
import type { NavigationTarget } from '../../utils/fileNavigation'

interface SCCommentsViewProps {
  directory: string
  prComments: PrComment[]
  isCommentsLoading: boolean
  replyText: Record<number, string | undefined>
  setReplyText: React.Dispatch<React.SetStateAction<Record<number, string | undefined>>>
  isSubmittingReply: number | null
  onReplyToComment: (commentId: number) => void
  onFileSelect?: (target: NavigationTarget) => void
}

export function SCCommentsView({
  directory,
  prComments,
  isCommentsLoading,
  replyText,
  setReplyText,
  isSubmittingReply,
  onReplyToComment,
  onFileSelect,
}: SCCommentsViewProps) {
  if (isCommentsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">Loading comments...</div>
    )
  }

  if (prComments.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
        No review comments
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto text-sm">
      {prComments.filter(c => !c.inReplyToId).map((comment) => {
        const replies = prComments.filter(c => c.inReplyToId === comment.id)
        return (
          <div key={comment.id} className="border-b border-border">
            <div
              className="px-3 py-2 hover:bg-bg-tertiary cursor-pointer"
              onClick={() => {
                if (onFileSelect && comment.path) {
                  onFileSelect({ filePath: `${directory}/${comment.path}`, openInDiffMode: true, scrollToLine: comment.line ?? undefined })
                }
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-text-primary">{comment.author}</span>
                <span className="text-xs text-text-secondary">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="text-xs text-accent mb-1">
                {comment.path}{comment.line ? `:${comment.line}` : ''}
              </div>
              <div className="text-xs text-text-primary whitespace-pre-wrap">
                {comment.body}
              </div>
            </div>
            {/* Replies */}
            {replies.map(reply => (
              <div key={reply.id} className="px-3 py-2 pl-6 bg-bg-secondary/50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-text-primary">{reply.author}</span>
                  <span className="text-xs text-text-secondary">
                    {new Date(reply.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-xs text-text-primary whitespace-pre-wrap">
                  {reply.body}
                </div>
              </div>
            ))}
            {/* Reply input */}
            <div className="px-3 py-2 pl-6 bg-bg-tertiary/30">
              <textarea
                value={replyText[comment.id] || ''}
                onChange={(e) => setReplyText(prev => ({ ...prev, [comment.id]: e.target.value }))}
                placeholder="Write a reply..."
                className="w-full bg-bg-tertiary border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent resize-none"
                rows={2}
              />
              <button
                onClick={() => onReplyToComment(comment.id)}
                disabled={isSubmittingReply === comment.id || !replyText[comment.id]?.trim()}
                className="mt-1 px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
              >
                {isSubmittingReply === comment.id ? 'Sending...' : 'Reply'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
