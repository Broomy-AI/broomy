/**
 * Bridges the Monaco editor to the comments store: loads a session's comments,
 * renders glyph-margin markers for existing comments on the open file, and
 * exposes an add helper that captures the quoted line text at creation time.
 */
import { useEffect, useCallback, useRef } from 'react'
import * as monaco from 'monaco-editor'
import { useCommentsStore, type Comment } from '../../../store/comments'

export interface CommentsContext {
  sessionDirectory: string
  commentsFilePath: string
}

interface UseMonacoCommentsParams {
  filePath: string
  commentsContext?: CommentsContext
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>
}

interface UseMonacoCommentsResult {
  existingComments: Comment[]
  addCommentAt: (line: number, body: string) => void
}

export function useMonacoComments({ filePath, commentsContext, editorRef }: UseMonacoCommentsParams): UseMonacoCommentsResult {
  const dir = commentsContext?.sessionDirectory
  const loadComments = useCommentsStore((s) => s.loadComments)
  const addComment = useCommentsStore((s) => s.addComment)
  const allForDir = useCommentsStore((s) => (dir ? s.commentsByDir[dir] : undefined))
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)

  // Load this session's comments once the dir is known / changes.
  useEffect(() => {
    if (dir && allForDir === undefined) void loadComments(dir)
  }, [dir, allForDir, loadComments])

  const existingComments = (allForDir ?? []).filter((c) => c.file === filePath)

  // Render markers for existing comments on the current file.
  useEffect(() => {
    if (!editorRef.current || !commentsContext) return
    const editor = editorRef.current
    if (!editor.getModel()) return
    const decorations: monaco.editor.IModelDeltaDecoration[] = existingComments.map((c) => ({
      range: new monaco.Range(c.line, 1, c.line, 1),
      options: {
        isWholeLine: true,
        glyphMarginClassName: 'review-comment-glyph',
        glyphMarginHoverMessage: { value: c.body },
        className: 'review-comment-line',
      },
    }))
    decorationsRef.current?.clear()
    decorationsRef.current = editor.createDecorationsCollection(decorations)
  }, [existingComments, commentsContext, editorRef])

  const addCommentAt = useCallback((line: number, body: string) => {
    if (!dir || !body.trim()) return
    const model = editorRef.current?.getModel()
    const quotedText = model ? model.getLineContent(line) : ''
    addComment(dir, { file: filePath, line, quotedText, body })
  }, [dir, filePath, addComment, editorRef])

  return { existingComments, addCommentAt }
}
