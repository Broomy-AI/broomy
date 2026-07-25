/**
 * The "add comment" affordance that appears over the line-number gutter of the
 * hovered line — a small comment-bubble icon. Rendered as an absolutely-
 * positioned overlay inside the editor (which must be `position: relative`);
 * clicking it opens the comment box on that line. Its opaque background covers
 * the line number underneath.
 */
import type { PlusPosition } from '../hooks/useCommentPlus'

interface CommentPlusButtonProps {
  plus: PlusPosition
  onClick: () => void
}

export default function CommentPlusButton({ plus, onClick }: CommentPlusButtonProps) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={`Comment on line ${plus.line}`}
      title="Comment on this line to send it to the agent"
      className="absolute z-10 flex items-center justify-center rounded bg-accent text-on-accent hover:bg-accent/80"
      style={{ top: plus.top, left: 0, width: plus.width, height: plus.height }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  )
}
