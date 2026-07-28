/**
 * Manages a single "comment box" Monaco view zone positioned under a given
 * line. A view zone reserves vertical space (pushing following lines down) and
 * exposes its DOM node so a React portal can render the InlineCommentBox into
 * it.
 *
 * Two things make view-zone content actually usable:
 *  - The zone's DOM node is given a z-index above Monaco's `.view-lines`
 *    layer, which otherwise stacks on top and swallows every pointer event
 *    (so the textarea/buttons would be unclickable).
 *  - The zone height is kept in sync with the rendered box height via a
 *    ResizeObserver, so the box never overflows onto the following line.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type * as monaco from 'monaco-editor'
import type { Comment } from '../../../store/comments'

const INITIAL_HEIGHT_PX = 110

export function useCommentBox(
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>,
) {
  const [boxLine, setBoxLine] = useState<number | null>(null)
  const [boxNode, setBoxNode] = useState<HTMLDivElement | null>(null)
  // Non-null when the box is editing an existing comment (vs. adding a new one).
  const [editingComment, setEditingComment] = useState<Comment | null>(null)
  const zoneRef = useRef<{ id: string; viewZone: monaco.editor.IViewZone } | null>(null)

  const removeZone = useCallback(() => {
    const editor = editorRef.current
    const current = zoneRef.current
    if (editor && current) {
      editor.changeViewZones((accessor) => accessor.removeZone(current.id))
    }
    zoneRef.current = null
  }, [editorRef])

  const closeBox = useCallback(() => {
    removeZone()
    setBoxNode(null)
    setBoxLine(null)
    setEditingComment(null)
  }, [removeZone])

  const openAt = useCallback((line: number) => {
    const editor = editorRef.current
    if (!editor) return
    removeZone()

    const domNode = document.createElement('div')
    // Raise the zone above Monaco's `.view-lines` so the box is clickable —
    // otherwise `.view-lines` intercepts pointer events on view-zone content.
    domNode.style.zIndex = '4'
    domNode.style.position = 'relative'

    const viewZone: monaco.editor.IViewZone = {
      afterLineNumber: line,
      heightInPx: INITIAL_HEIGHT_PX,
      domNode,
    }
    editor.changeViewZones((accessor) => {
      const id = accessor.addZone(viewZone)
      zoneRef.current = { id, viewZone }
    })
    setBoxNode(domNode)
    setBoxLine(line)
  }, [editorRef, removeZone])

  // Open the box to add a new comment on `line`.
  const openBox = useCallback((line: number) => {
    setEditingComment(null)
    openAt(line)
  }, [openAt])

  // Open the box to edit an existing comment (pre-filled), on its line.
  const openEditBox = useCallback((comment: Comment) => {
    setEditingComment(comment)
    openAt(comment.line)
  }, [openAt])

  // Keep the view zone exactly as tall as the rendered box (including the box's
  // own margins), so following lines are pushed down by the right amount and
  // nothing overlaps.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !boxNode) return

    const measure = () => {
      const child = boxNode.firstElementChild as HTMLElement | null
      if (!child) return
      const rect = child.getBoundingClientRect()
      const style = getComputedStyle(child)
      const height = Math.ceil(rect.height + parseFloat(style.marginTop) + parseFloat(style.marginBottom))
      const current = zoneRef.current
      if (height > 0 && current && current.viewZone.heightInPx !== height) {
        current.viewZone.heightInPx = height
        editor.changeViewZones((accessor) => accessor.layoutZone(current.id))
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(boxNode)
    return () => observer.disconnect()
  }, [boxNode, editorRef])

  return { boxLine, boxNode, editingComment, openBox, openEditBox, closeBox }
}
