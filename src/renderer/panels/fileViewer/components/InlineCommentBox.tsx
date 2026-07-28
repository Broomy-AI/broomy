/**
 * React comment input rendered (via portal) into a Monaco view zone directly
 * under the line being commented on. GitHub-style: shows the quoted line, a
 * textarea, and Add / Cancel. Cmd/Ctrl+Enter submits, Escape cancels.
 */
import { useState } from 'react'

interface InlineCommentBoxProps {
  line: number
  quotedText: string
  onAdd: (body: string) => void
  onCancel: () => void
  /** Pre-filled text when editing an existing comment. */
  initialBody?: string
  /** Submit button label — "Add" for new, "Save" when editing. */
  submitLabel?: string
}

export default function InlineCommentBox({ line, quotedText, onAdd, onCancel, initialBody = '', submitLabel = 'Add' }: InlineCommentBoxProps) {
  const [body, setBody] = useState(initialBody)
  const canAdd = body.trim().length > 0
  return (
    <div className="mx-3 my-1 rounded border border-border bg-bg-secondary p-2 shadow-sm">
      <div className="mb-1 text-xs text-text-secondary truncate">
        Line {line}: <span className="font-mono">{quotedText.trim()}</span>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canAdd) onAdd(body)
          else if (e.key === 'Escape') onCancel()
        }}
        placeholder="Add a comment..."
        rows={2}
        autoFocus
        className="w-full resize-y rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
      />
      <div className="mt-1 flex justify-end gap-2">
        <button
          onClick={onCancel}
          aria-label="Cancel comment"
          className="rounded px-2 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          onClick={() => onAdd(body)}
          disabled={!canAdd}
          aria-label="Add comment"
          className="rounded bg-accent px-2 py-1 text-xs text-on-accent transition-colors hover:bg-accent/80 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
