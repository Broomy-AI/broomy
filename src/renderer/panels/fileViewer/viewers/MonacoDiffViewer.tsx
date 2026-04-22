/**
 * Monaco Diff Editor wrapper for side-by-side or inline file comparison.
 *
 * Renders a read-only Monaco DiffEditor with original and modified content,
 * automatic language detection from the file extension, configurable side-by-side
 * or inline layout, and scroll-to-line support that positions the modified editor
 * at the requested line on mount and when the scrollToLine prop changes.
 */
import { useEffect, useRef } from 'react'
import { DiffEditor, loader } from '@monaco-editor/react'
import * as monacoEditor from 'monaco-editor'
import { useMonacoComments } from '../hooks/useMonacoComments'

// Configure Monaco to use locally bundled version instead of CDN
loader.config({ monaco: monacoEditor })

interface MonacoDiffViewerProps {
  filePath: string
  originalContent: string
  modifiedContent: string
  language?: string
  sideBySide?: boolean
  scrollToLine?: number
  reviewContext?: { sessionDirectory: string; commentsFilePath: string }
  onEditorReady?: (actions: import('./types').EditorActions | null) => void
}

// Map file extensions to Monaco language IDs
const getLanguageFromPath = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
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
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    lua: 'lua',
    swift: 'swift',
    dart: 'dart',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    toml: 'ini',
    ini: 'ini',
    txt: 'plaintext',
    log: 'plaintext',
  }
  return languageMap[ext] || 'plaintext'
}

export default function MonacoDiffViewer({
  filePath,
  originalContent,
  modifiedContent,
  language,
  sideBySide = true,
  scrollToLine,
  reviewContext,
  onEditorReady,
}: MonacoDiffViewerProps) {
  const detectedLanguage = language || getLanguageFromPath(filePath)
  const diffEditorRef = useRef<monacoEditor.editor.IStandaloneDiffEditor | null>(null)
  const modifiedEditorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null)

  const {
    commentLine,
    setCommentLine,
    commentText,
    setCommentText,
    handleAddComment,
  } = useMonacoComments({
    filePath,
    reviewContext,
    editorRef: modifiedEditorRef,
  })

  const handleDiffEditorMount = (editor: monacoEditor.editor.IStandaloneDiffEditor) => {
    diffEditorRef.current = editor
    const modifiedEditor = editor.getModifiedEditor()
    modifiedEditorRef.current = modifiedEditor

    // Monaco's diff editor internally sets wordWrapOverride1: 'off' on the
    // original editor, which takes precedence over wordWrap: 'on'.
    // Use wordWrapOverride2 to override that internal override.
    // Only needed in side-by-side mode; in inline mode the original editor
    // is hidden and forcing wrap on it creates oversized hatched zones.
    if (sideBySide) {
      editor.getOriginalEditor().updateOptions({ wordWrapOverride2: 'on' })
    }

    // Enable glyph margin for comment clicks when review context is present
    if (reviewContext) {
      modifiedEditor.updateOptions({ glyphMargin: true })
      modifiedEditor.onMouseDown((e) => {
        if (e.target.type === monacoEditor.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
          const lineNumber = e.target.position.lineNumber
          if (lineNumber) {
            setCommentLine(lineNumber)
          }
        }
      })
    }

    if (scrollToLine) {
      // Wait for diff computation to finish before scrolling, since
      // hideUnchangedRegions collapses regions asynchronously and would
      // invalidate any scroll position set before that completes.
      const disposable = editor.onDidUpdateDiff(() => {
        disposable.dispose()
        modifiedEditor.revealLineInCenter(scrollToLine)
        modifiedEditor.setPosition({ lineNumber: scrollToLine, column: 1 })
      })
    }

    // Notify parent of available editor actions
    onEditorReady?.({
      showOutline: () => {
        modifiedEditor.focus()
        modifiedEditor.trigger('keyboard', 'editor.action.quickOutline', {})
      },
      showFind: () => {
        modifiedEditor.focus()
        modifiedEditor.trigger('keyboard', 'actions.find', {})
      },
    })
  }

  useEffect(() => {
    if (scrollToLine && diffEditorRef.current) {
      // When scrollToLine changes on an already-mounted editor, the diff is
      // already computed so we can scroll directly after a layout frame.
      requestAnimationFrame(() => {
        if (!diffEditorRef.current) return
        const modifiedEditor = diffEditorRef.current.getModifiedEditor()
        modifiedEditor.revealLineInCenter(scrollToLine)
        modifiedEditor.setPosition({ lineNumber: scrollToLine, column: 1 })
      })
    }
  }, [scrollToLine, filePath])

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
                  void handleAddComment()
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
      {/* Diff Editor */}
      <div className="flex-1 min-h-0">
        <DiffEditor
          key={`${filePath}:${sideBySide ? 'sbs' : 'inline'}`}
          height="100%"
          language={detectedLanguage}
          original={originalContent}
          modified={modifiedContent}
          theme="vs-dark"
          onMount={handleDiffEditorMount}
          keepCurrentOriginalModel={false}
          keepCurrentModifiedModel={false}
          options={{
            readOnly: true,
            wordWrap: 'on',
            renderSideBySide: sideBySide,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            glyphMargin: !!reviewContext,
            // Show unchanged regions collapsed by default with expand option
            hideUnchangedRegions: {
              enabled: true,
              revealLineCount: 3,
              minimumLineCount: 5,
              contextLineCount: 3,
            },
            // Enable inline diff decorations
            renderIndicators: true,
            renderMarginRevertIcon: false,
            // Improve diff algorithm
            ignoreTrimWhitespace: false,
          }}
        />
      </div>
    </div>
  )
}
