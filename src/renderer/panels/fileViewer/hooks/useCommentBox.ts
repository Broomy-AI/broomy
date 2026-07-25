/**
 * Manages a single "comment box" Monaco view zone positioned under a given
 * line. Reserves vertical space via a view zone and exposes its DOM node so a
 * React portal can render the InlineCommentBox into it. Monaco keeps the zone
 * positioned correctly across scroll and layout.
 */
import { useCallback, useRef, useState } from 'react'
import type * as monaco from 'monaco-editor'

const BOX_HEIGHT_PX = 96

export function useCommentBox(
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>,
) {
  const [boxLine, setBoxLine] = useState<number | null>(null)
  const [boxNode, setBoxNode] = useState<HTMLDivElement | null>(null)
  const zoneIdRef = useRef<string | null>(null)

  const closeBox = useCallback(() => {
    const editor = editorRef.current
    if (editor && zoneIdRef.current) {
      editor.changeViewZones((accessor) => {
        if (zoneIdRef.current) accessor.removeZone(zoneIdRef.current)
      })
    }
    zoneIdRef.current = null
    setBoxNode(null)
    setBoxLine(null)
  }, [editorRef])

  const openBox = useCallback((line: number) => {
    const editor = editorRef.current
    if (!editor) return
    // Remove any existing zone first.
    if (zoneIdRef.current) {
      editor.changeViewZones((accessor) => {
        if (zoneIdRef.current) accessor.removeZone(zoneIdRef.current)
      })
      zoneIdRef.current = null
    }
    const domNode = document.createElement('div')
    editor.changeViewZones((accessor) => {
      zoneIdRef.current = accessor.addZone({
        afterLineNumber: line,
        heightInPx: BOX_HEIGHT_PX,
        domNode,
      })
    })
    setBoxNode(domNode)
    setBoxLine(line)
  }, [editorRef])

  return { boxLine, boxNode, openBox, closeBox }
}
