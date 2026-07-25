/**
 * Docked, collapsible/resizable list of accumulated review comments, pinned to
 * the bottom of the explorer across all tabs. Each row navigates to its file
 * and line; rows can be resolved (removed). "Submit" sends every pending
 * comment to the agent as one numbered feedback block, then clears the list.
 */
import { useEffect, useRef, useState } from 'react'
import { useCommentsStore } from '../../store/comments'
import { formatCommentsForAgent, toRelativePath } from '../../store/commentsFormat'
import { sendAgentPrompt } from '../../shared/utils/focusHelpers'

interface CommentsDockProps {
  directory: string
  agentPtyId?: string
  onNavigate: (file: string, line: number) => void
}

const MIN_HEIGHT = 80
const MAX_HEIGHT = 420
const HEIGHT_KEY = 'broomy.commentsDock.height'

export default function CommentsDock({ directory, agentPtyId, onNavigate }: CommentsDockProps) {
  const comments = useCommentsStore((s) => s.commentsByDir[directory] ?? [])
  const loadComments = useCommentsStore((s) => s.loadComments)
  const resolveComment = useCommentsStore((s) => s.resolveComment)
  const updateComment = useCommentsStore((s) => s.updateComment)
  const clearComments = useCommentsStore((s) => s.clearComments)
  const loaded = useCommentsStore((s) => s.commentsByDir[directory] !== undefined)
  const lastTouched = useCommentsStore((s) => s.lastTouched)

  // The comment currently being edited inline, and its draft text.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  // The comment to briefly highlight after it was just added/edited.
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(() => {
    const saved = Number(localStorage.getItem(HEIGHT_KEY))
    return saved >= MIN_HEIGHT && saved <= MAX_HEIGHT ? saved : 160
  })
  const draggingRef = useRef(false)

  useEffect(() => {
    if (!loaded) void loadComments(directory)
  }, [loaded, directory, loadComments])

  // When a comment is added or edited, reveal it: expand the dock if collapsed,
  // scroll the row into view, and highlight it briefly — even if it was below
  // the fold under other comments.
  useEffect(() => {
    if (!lastTouched) return
    const id = lastTouched.id
    const dirComments = useCommentsStore.getState().commentsByDir[directory] ?? []
    if (!dirComments.some((c) => c.id === id)) return
    setCollapsed(false)
    setHighlightedId(id)
    const raf = requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-comment-id="${id}"]`)?.scrollIntoView({ block: 'nearest' })
    })
    const timer = setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1600)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [lastTouched, directory])

  // Drag-to-resize: dragging the top handle changes height (grows upward).
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      const fromBottom = window.innerHeight - e.clientY
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, fromBottom))
      setHeight(next)
    }
    const onUp = () => {
      if (draggingRef.current) localStorage.setItem(HEIGHT_KEY, String(height))
      draggingRef.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [height])

  const handleSubmit = async () => {
    if (!agentPtyId || comments.length === 0) return
    await sendAgentPrompt(agentPtyId, formatCommentsForAgent(comments, directory))
    clearComments(directory)
  }

  return (
    <div className="flex-shrink-0 border-t border-border bg-bg-secondary">
      {/* Resize handle (only when expanded) */}
      {!collapsed && (
        <div
          onMouseDown={() => { draggingRef.current = true }}
          className="h-1 w-full cursor-row-resize hover:bg-accent/60"
        />
      )}
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-tertiary"
      >
        <span>Comments{comments.length > 0 ? ` (${comments.length})` : ''}</span>
        <span className="text-text-secondary">{collapsed ? '▲' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className="flex flex-col" style={{ height }}>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {comments.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-text-secondary">
                No comments yet. Hover a line in a file and click + to add one.
              </div>
            ) : (
              comments.map((c) => (
                <div
                  key={c.id}
                  data-comment-id={c.id}
                  className={`group border-b border-border px-3 py-1.5 text-xs transition-colors duration-500 ${highlightedId === c.id ? 'bg-accent/20' : ''}`}
                >
                  {editingId === c.id ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-accent">{toRelativePath(c.file, directory)}:{c.line}</span>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && editText.trim()) {
                            updateComment(directory, c.id, editText)
                            setEditingId(null)
                          } else if (e.key === 'Escape') {
                            setEditingId(null)
                          }
                        }}
                        rows={2}
                        autoFocus
                        aria-label="Edit comment"
                        className="w-full resize-y rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded px-2 py-0.5 text-text-secondary hover:text-text-primary"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => { updateComment(directory, c.id, editText); setEditingId(null) }}
                          disabled={!editText.trim()}
                          className="rounded bg-accent px-2 py-0.5 text-on-accent hover:bg-accent/80 disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() => onNavigate(c.file, c.line)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="text-accent">{toRelativePath(c.file, directory)}:{c.line}</span>
                        <span className="ml-1 text-text-secondary truncate"> — {c.body}</span>
                      </button>
                      <button
                        onClick={() => { setEditingId(c.id); setEditText(c.body) }}
                        aria-label="Edit comment"
                        className="opacity-0 transition-opacity group-hover:opacity-100 text-text-secondary hover:text-text-primary"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => resolveComment(directory, c.id)}
                        aria-label="Resolve comment"
                        className="opacity-0 transition-opacity group-hover:opacity-100 text-text-secondary hover:text-text-primary"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="flex-shrink-0 border-t border-border p-2">
            <button
              onClick={handleSubmit}
              disabled={comments.length === 0 || !agentPtyId}
              title={!agentPtyId ? 'The agent is not running' : undefined}
              className="w-full rounded bg-accent px-2 py-1 text-xs text-on-accent transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              Submit {comments.length} comment{comments.length === 1 ? '' : 's'} to agent
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
