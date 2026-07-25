/**
 * GitHub-style "add comment" affordance that appears over the line-number
 * gutter of the hovered line — without widening the gutter (no glyph margin).
 *
 * `attach(editor, monacoNs)` wires the editor's mouse/scroll events and exposes
 * `plus`, the on-screen position of the "+" button, which the viewer renders as
 * an overlay inside the editor. Clicking it opens the comment box on that line.
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
  // The editor's own DOM node, used as the portal host for the "+" button so
  // `left: 0` lands on this editor's gutter — correct for both a standalone
  // editor and the modified (right) pane of a side-by-side diff editor.
  const [hostNode, setHostNode] = useState<HTMLElement | null>(null)
  const disposablesRef = useRef<monaco.IDisposable[]>([])
  const lastLineRef = useRef<number | null>(null)

  const attach = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor, monacoNs: typeof monaco) => {
      setHostNode(editor.getDomNode() ?? null)
      const positionFor = (line: number): PlusPosition => ({
        line,
        top: editor.getTopForLineNumber(line) - editor.getScrollTop(),
        height: editor.getOption(monacoNs.editor.EditorOption.lineHeight),
        width: editor.getLayoutInfo().contentLeft,
      })

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
          setPlus((prev) =>
            prev ? { ...prev, top: editor.getTopForLineNumber(prev.line) - editor.getScrollTop() } : null,
          )
        }),
      )
    },
    [],
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

  return { plus, hostNode, attach, hide }
}
