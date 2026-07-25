/**
 * The GitHub-style "+" affordance that appears over the line-number gutter of
 * the hovered line. Rendered as an absolutely-positioned overlay inside the
 * editor (which must be `position: relative`); clicking it opens the comment
 * box on that line. Its opaque background covers the line number underneath.
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
      title="Add comment"
      className="absolute z-10 flex items-center justify-center rounded bg-accent text-on-accent text-xs font-bold leading-none hover:bg-accent/80"
      style={{ top: plus.top, left: 0, width: plus.width, height: plus.height }}
    >
      +
    </button>
  )
}
