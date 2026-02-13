import { useState, useEffect, useCallback, useRef } from 'react'
import * as monaco from 'monaco-editor'

interface PendingComment {
  id: string
  file: string
  line: number
  body: string
  createdAt: string
  pushed?: boolean
}

interface ReviewContext {
  sessionDirectory: string
  commentsFilePath: string
}

interface UseMonacoCommentsParams {
  filePath: string
  reviewContext?: ReviewContext
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>
}

interface UseMonacoCommentsResult {
  commentLine: number | null
  setCommentLine: React.Dispatch<React.SetStateAction<number | null>>
  commentText: string
  setCommentText: React.Dispatch<React.SetStateAction<string>>
  existingComments: PendingComment[]
  handleAddComment: () => Promise<void>
}

export function useMonacoComments({ filePath, reviewContext, editorRef }: UseMonacoCommentsParams): UseMonacoCommentsResult {
  const [commentLine, setCommentLine] = useState<number | null>(null)
  const [commentText, setCommentText] = useState('')
  const [existingComments, setExistingComments] = useState<PendingComment[]>([])
  const commentDecorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)

  // Load existing comments for this file
  useEffect(() => {
    if (!reviewContext) return
    const loadComments = async () => {
      try {
        const exists = await window.fs.exists(reviewContext.commentsFilePath)
        if (exists) {
          const data = await window.fs.readFile(reviewContext.commentsFilePath)
          const allComments: PendingComment[] = JSON.parse(data)
          setExistingComments(allComments.filter(c => c.file === filePath))
        }
      } catch {
        // No comments yet
      }
    }
    void loadComments()
  }, [filePath, reviewContext?.commentsFilePath])

  // Update comment decorations when comments change
  useEffect(() => {
    if (!editorRef.current || !reviewContext) return
    const editor = editorRef.current
    const model = editor.getModel()
    if (!model) return

    const decorations: monaco.editor.IModelDeltaDecoration[] = existingComments.map(c => ({
      range: new monaco.Range(c.line, 1, c.line, 1),
      options: {
        isWholeLine: true,
        glyphMarginClassName: 'review-comment-glyph',
        glyphMarginHoverMessage: { value: c.body },
        className: 'review-comment-line',
      },
    }))

    if (commentDecorationsRef.current) {
      commentDecorationsRef.current.clear()
    }
    commentDecorationsRef.current = editor.createDecorationsCollection(decorations)
  }, [existingComments, reviewContext])

  const handleAddComment = useCallback(async () => {
    if (!reviewContext || commentLine === null || !commentText.trim()) return

    const newComment: PendingComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      file: filePath,
      line: commentLine,
      body: commentText.trim(),
      createdAt: new Date().toISOString(),
    }

    try {
      // Load all existing comments
      let allComments: PendingComment[] = []
      try {
        const exists = await window.fs.exists(reviewContext.commentsFilePath)
        if (exists) {
          const data = await window.fs.readFile(reviewContext.commentsFilePath)
          allComments = JSON.parse(data)
        }
      } catch {
        // Start fresh
      }

      allComments.push(newComment)

      // Ensure directory exists
      const dir = reviewContext.commentsFilePath.replace('/comments.json', '')
      await window.fs.mkdir(dir)
      await window.fs.writeFile(reviewContext.commentsFilePath, JSON.stringify(allComments, null, 2))

      // Update local state
      setExistingComments(prev => [...prev, newComment])
      setCommentLine(null)
      setCommentText('')
    } catch {
      // Comment save failed
    }
  }, [reviewContext, commentLine, commentText, filePath])

  return {
    commentLine,
    setCommentLine,
    commentText,
    setCommentText,
    existingComments,
    handleAddComment,
  }
}
