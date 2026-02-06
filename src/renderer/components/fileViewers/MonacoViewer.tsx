import { useRef, useEffect, useState, useCallback } from 'react'
import Editor, { loader, Monaco } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import type { FileViewerPlugin, FileViewerComponentProps } from './types'
import { getFileExtension } from './types'

// Configure Monaco workers for Vite
window.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') {
      return new jsonWorker()
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker()
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker()
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker()
    }
    return new editorWorker()
  }
}

// Configure Monaco to use locally bundled version instead of CDN
loader.config({ monaco })

// Text file extensions that Monaco can handle
const TEXT_EXTENSIONS = [
  // Programming languages
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'scala',
  'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hxx',
  'cs', 'fs', 'fsx',
  'php', 'pl', 'pm', 'lua', 'r',
  'swift', 'dart', 'elm', 'clj', 'cljs',
  'ex', 'exs', 'erl', 'hrl',
  // Web
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'vue', 'svelte', 'astro',
  // Data/Config
  'json', 'yaml', 'yml', 'toml', 'ini', 'cfg',
  'xml', 'xsl', 'xslt', 'svg',
  'env', 'properties',
  // Shell/Scripts
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  // Docs
  'txt', 'log', 'md', 'markdown', 'rst', 'adoc',
  // Other
  'sql', 'graphql', 'gql',
  'dockerfile', 'makefile', 'cmake',
  'gitignore', 'gitattributes', 'editorconfig',
  'lock', 'sum',
]

// Map file extensions to Monaco language IDs
const getLanguageFromPath = (filePath: string): string => {
  const ext = getFileExtension(filePath)
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    html: 'html',
    htm: 'html',
    xml: 'xml',
    xsl: 'xml',
    xslt: 'xml',
    svg: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    scala: 'scala',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'c',
    hpp: 'cpp',
    hxx: 'cpp',
    cs: 'csharp',
    fs: 'fsharp',
    fsx: 'fsharp',
    php: 'php',
    pl: 'perl',
    pm: 'perl',
    lua: 'lua',
    r: 'r',
    swift: 'swift',
    dart: 'dart',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    ps1: 'powershell',
    bat: 'bat',
    cmd: 'bat',
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    cmake: 'cmake',
    toml: 'ini',
    ini: 'ini',
    cfg: 'ini',
    env: 'ini',
    properties: 'ini',
    txt: 'plaintext',
    log: 'plaintext',
  }
  return languageMap[ext] || 'plaintext'
}

interface PendingComment {
  id: string
  file: string
  line: number
  body: string
  createdAt: string
  pushed?: boolean
}

function MonacoViewerComponent({ filePath, content, onSave, onDirtyChange, scrollToLine, searchHighlight, reviewContext }: FileViewerComponentProps) {
  const language = getLanguageFromPath(filePath)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const originalContentRef = useRef(content)
  const [commentLine, setCommentLine] = useState<number | null>(null)
  const [commentText, setCommentText] = useState('')
  const [existingComments, setExistingComments] = useState<PendingComment[]>([])
  const commentDecorationsRef = useRef<string[]>([])
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const scrollToLineRef = useRef(scrollToLine)
  const searchHighlightRef = useRef(searchHighlight)

  // Keep refs in sync
  scrollToLineRef.current = scrollToLine
  searchHighlightRef.current = searchHighlight

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
    loadComments()
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

    commentDecorationsRef.current = editor.deltaDecorations(commentDecorationsRef.current, decorations)
  }, [existingComments, reviewContext])

  // Update original content when file changes
  useEffect(() => {
    originalContentRef.current = content
    onDirtyChange?.(false, content)
  }, [content, filePath])

  const handleAddComment = useCallback(async () => {
    if (!reviewContext || commentLine === null || !commentText.trim()) return

    const newComment: PendingComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

  // Shared function to scroll and highlight
  const applyScrollAndHighlight = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    const line = scrollToLineRef.current
    const highlight = searchHighlightRef.current
    if (!line) return

    editor.revealLineInCenter(line)

    if (highlight) {
      const model = editor.getModel()
      if (model) {
        const lineContent = model.getLineContent(line)
        const matchIndex = lineContent.toLowerCase().indexOf(highlight.toLowerCase())
        if (matchIndex !== -1) {
          const startColumn = matchIndex + 1
          const endColumn = startColumn + highlight.length
          editor.setSelection(new monaco.Range(line, startColumn, line, endColumn))
          if (decorationsRef.current) {
            decorationsRef.current.clear()
          }
          decorationsRef.current = editor.createDecorationsCollection([{
            range: new monaco.Range(line, startColumn, line, endColumn),
            options: {
              className: 'searchHighlight',
              isWholeLine: false,
            }
          }])
        }
      }
    }
  }, [])

  // Scroll to line and highlight when props change (editor already mounted)
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !scrollToLine) return
    // Delay to let Monaco update its model content after a value change
    const timer = setTimeout(() => applyScrollAndHighlight(editor), 100)
    return () => clearTimeout(timer)
  }, [scrollToLine, searchHighlight, content, applyScrollAndHighlight])

  const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
    editorRef.current = editor
    // Apply pending scroll/highlight now that the editor is ready
    if (scrollToLineRef.current) {
      // Monaco editor is ready at onMount, but give it a moment for layout
      setTimeout(() => applyScrollAndHighlight(editor), 150)
    }

    // Add Cmd/Ctrl+S save handler
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      const editorContent = editor.getValue()
      if (onSave && editorContent !== originalContentRef.current) {
        onSave(editorContent).then(() => {
          originalContentRef.current = editorContent
          onDirtyChange?.(false, editorContent)
        })
      }
    })

    // Add glyph margin click handler for review comments
    if (reviewContext) {
      editor.onMouseDown((e) => {
        if (e.target.type === monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
          const lineNumber = e.target.position?.lineNumber
          if (lineNumber) {
            setCommentLine(lineNumber)
            setCommentText('')
          }
        }
      })
    }
  }

  const handleEditorChange = (value: string | undefined) => {
    const newContent = value ?? ''
    const isDirty = newContent !== originalContentRef.current
    onDirtyChange?.(isDirty, newContent)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Inline comment input */}
      {reviewContext && commentLine !== null && (
        <div className="flex-shrink-0 px-3 py-2 bg-bg-secondary border-b border-border">
          <div className="text-xs text-text-secondary mb-1">Comment on line {commentLine}:</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && commentText.trim()) {
                  handleAddComment()
                } else if (e.key === 'Escape') {
                  setCommentLine(null)
                }
              }}
              placeholder="Type your comment..."
              className="flex-1 px-2 py-1 text-xs rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
              autoFocus
            />
            <button
              onClick={handleAddComment}
              disabled={!commentText.trim()}
              className="px-2 py-1 text-xs rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setCommentLine(null)}
              className="px-2 py-1 text-xs rounded text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={language}
          value={content}
          theme="vs-dark"
          onMount={handleEditorDidMount}
          onChange={handleEditorChange}
          options={{
            readOnly: !onSave,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            glyphMargin: !!reviewContext,
          }}
        />
      </div>
      {/* Add CSS for review comment decorations */}
      {reviewContext && (
        <style>{`
          .review-comment-glyph {
            background-color: #eab308;
            border-radius: 50%;
            width: 8px !important;
            height: 8px !important;
            margin-top: 6px;
            margin-left: 4px;
          }
          .review-comment-line {
            background-color: rgba(234, 179, 8, 0.05);
          }
          .margin-view-overlays .cgmr {
            cursor: pointer;
          }
        `}</style>
      )}
    </div>
  )
}

// Re-export from utility module for backwards compatibility
export { isTextContent } from '../../utils/textDetection'

export const MonacoViewer: FileViewerPlugin = {
  id: 'monaco',
  name: 'Code',
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  canHandle: (filePath: string) => {
    const ext = getFileExtension(filePath)
    // Handle files with known text extensions
    if (TEXT_EXTENSIONS.includes(ext)) return true
    // Handle files without extensions (like Makefile, Dockerfile)
    const fileName = filePath.split('/').pop()?.toLowerCase() || ''
    if (['makefile', 'dockerfile', 'gemfile', 'rakefile', 'procfile'].includes(fileName)) return true
    // For unknown extensions, we'll check content in FileViewer
    // Return true here and let FileViewer filter based on content
    return true
  },
  priority: 1, // Lowest priority - used as fallback
  component: MonacoViewerComponent,
}
