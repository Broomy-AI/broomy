/**
 * Persistent marker shown over the line-number gutter of a line that already
 * has a comment. Rendered as an absolutely-positioned overlay inside the editor
 * (portaled into its DOM node); clicking it re-opens the comment box to edit.
 * Styled distinctly from the hover "add" affordance (filled/warning tint) so a
 * commented line reads as "has a comment", not "add a comment".
 */
import type { PlusPosition } from '../hooks/useCommentPlus'

interface CommentMarkerButtonProps {
  pos: PlusPosition
  onClick: () => void
}

export default function CommentMarkerButton({ pos, onClick }: CommentMarkerButtonProps) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={`Edit comment on line ${pos.line}`}
      title="Edit your comment on this line"
      className="absolute z-10 flex items-center justify-center rounded bg-warning-base text-on-solid hover:opacity-90"
      style={{ top: pos.top, left: 0, width: pos.width, height: pos.height }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  )
}
