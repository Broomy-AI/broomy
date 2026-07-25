/**
 * Gutter overlay affordances for comments, positioned over the line-number
 * column without widening the gutter (no glyph margin).
 *
 * `attach(editor, monacoNs)` wires the editor's mouse/scroll events. The hook
 * exposes:
 *  - `plus`: the on-screen position of the hover "add comment" button (shown
 *    only when the mouse is over the line-number gutter).
 *  - `positionFor(line)`: the current on-screen gutter position for any line
 *    (used to place persistent markers on lines that already have comments), or
 *    null when the editor isn't ready or the line is scrolled out of view.
 *  - `scrollRev`: bumps on scroll/layout so callers re-render persistent
 *    markers at their new positions.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type * as monaco from 'monaco-editor'

export interface PlusPosition {
  line: number
  /** Top offset (px) relative to the editor's top edge. */
  top: number
  /** Line height (px) — the button matches one line. */
  height: number
  /** Gutter width (px) — the button spans the line-number column. */
  width: number
}

export function useCommentPlus() {
  const [plus, setPlus] = useState<PlusPosition | null>(null)
  // The editor's own DOM node, used as the portal host so `left: 0` lands on
  // this editor's gutter — correct for both a standalone editor and the
  // modified (right) pane of a side-by-side diff editor.
  const [hostNode, setHostNode] = useState<HTMLElement | null>(null)
  // Bumps on scroll/layout so callers reposition persistent markers.
  const [scrollRev, setScrollRev] = useState(0)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monaco | null>(null)
  const disposablesRef = useRef<monaco.IDisposable[]>([])
  const lastLineRef = useRef<number | null>(null)

  // Current gutter position for a line, or null if the editor isn't ready or
  // the line is scrolled out of the viewport.
  const positionFor = useCallback((line: number): PlusPosition | null => {
    const editor = editorRef.current
    const monacoNs = monacoRef.current
    if (!editor || !monacoNs) return null
    const layout = editor.getLayoutInfo()
    const top = editor.getTopForLineNumber(line) - editor.getScrollTop()
    if (top < 0 || top >= layout.height) return null
    return {
      line,
      top,
      height: editor.getOption(monacoNs.editor.EditorOption.lineHeight),
      width: layout.contentLeft,
    }
  }, [])

  const attach = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor, monacoNs: typeof monaco) => {
      editorRef.current = editor
      monacoRef.current = monacoNs
      setHostNode(editor.getDomNode() ?? null)

      disposablesRef.current.push(
        editor.onMouseMove((e) => {
          // When the mouse is over our own overlay button, Monaco can't hit-test
          // through it and reports UNKNOWN with no position. Keep the current
          // state in that case — hiding here is exactly what caused the flicker
          // (hide → button gone → gutter re-detected → show → …).
          if (e.target.type === monacoNs.editor.MouseTargetType.UNKNOWN) return

          // Only show the affordance over the gutter (the line-number column,
          // width = layoutInfo.contentLeft) — never over the code text. A
          // coordinate test covers the whole gutter reliably.
          const domNode = editor.getDomNode()
          const line = e.target.position?.lineNumber ?? null
          const contentLeft = editor.getLayoutInfo().contentLeft
          const relX = domNode ? e.event.browserEvent.clientX - domNode.getBoundingClientRect().left : Infinity
          const shown = line !== null && relX >= 0 && relX < contentLeft ? line : null
          if (shown === lastLineRef.current) return
          lastLineRef.current = shown
          setPlus(shown ? positionFor(shown) : null)
        }),
        editor.onMouseLeave(() => {
          lastLineRef.current = null
          setPlus(null)
        }),
        editor.onDidScrollChange(() => {
          setScrollRev((r) => r + 1)
          setPlus((prev) => (prev ? positionFor(prev.line) : null))
        }),
      )
    },
    [positionFor],
  )

  const hide = useCallback(() => {
    lastLineRef.current = null
    setPlus(null)
  }, [])

  useEffect(() => {
    const disposables = disposablesRef.current
    return () => {
      disposables.forEach((d) => d.dispose())
      disposables.length = 0
    }
  }, [])

  return { plus, hostNode, scrollRev, positionFor, attach, hide }
}
