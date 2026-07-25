/**
 * Monaco Diff Editor wrapper for side-by-side or inline file comparison.
 *
 * Renders a read-only Monaco DiffEditor with original and modified content,
 * automatic language detection from the file extension, configurable side-by-side
 * or inline layout, and scroll-to-line support that positions the modified editor
 * at the requested line on mount and when the scrollToLine prop changes.
 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { DiffEditor, loader } from '@monaco-editor/react'
import * as monacoEditor from 'monaco-editor'
import { useMonacoComments } from '../hooks/useMonacoComments'
import { useCommentBox } from '../hooks/useCommentBox'
import InlineCommentBox from '../components/InlineCommentBox'
import { useSettingsStore } from '../../../store/settings'
import { MONACO_THEMES } from '../../../shared/theme/monacoTheme'

// Configure Monaco to use locally bundled version instead of CDN
loader.config({ monaco: monacoEditor })

interface MonacoDiffViewerProps {
  filePath: string
  originalContent: string
  modifiedContent: string
  language?: string
  sideBySide?: boolean
  scrollToLine?: number
  commentsContext?: { sessionDirectory: string; commentsFilePath: string }
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
  commentsContext,
  onEditorReady,
}: MonacoDiffViewerProps) {
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme)
  const editorFontSize = useSettingsStore((s) => s.appearance.editorFontSize)
  const detectedLanguage = language || getLanguageFromPath(filePath)
  const diffEditorRef = useRef<monacoEditor.editor.IStandaloneDiffEditor | null>(null)
  const modifiedEditorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null)

  const { addCommentAt } = useMonacoComments({ filePath, commentsContext, editorRef: modifiedEditorRef })
  const { boxLine, boxNode, openBox, closeBox } = useCommentBox(modifiedEditorRef)

  const handleDiffEditorMount = (editor: monacoEditor.editor.IStandaloneDiffEditor) => {
    diffEditorRef.current = editor
    const modifiedEditor = editor.getModifiedEditor()
    modifiedEditorRef.current = modifiedEditor
    // Comment gutter: hover shows an "add comment" affordance; click opens the box.
    if (commentsContext) {
      modifiedEditor.updateOptions({ glyphMargin: true })
      const hoverDecorations = modifiedEditor.createDecorationsCollection([])
      modifiedEditor.onMouseMove((e) => {
        const line = e.target.position?.lineNumber
        if (line && e.target.type === monacoEditor.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
          hoverDecorations.set([{
            range: new monacoEditor.Range(line, 1, line, 1),
            options: { glyphMarginClassName: 'add-comment-glyph', glyphMarginHoverMessage: { value: 'Add comment' } },
          }])
        } else {
          hoverDecorations.clear()
        }
      })
      modifiedEditor.onMouseLeave(() => hoverDecorations.clear())
      modifiedEditor.onMouseDown((e) => {
        if (e.target.type === monacoEditor.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
          const lineNumber = e.target.position.lineNumber
          if (lineNumber) openBox(lineNumber)
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
      {boxNode && boxLine !== null && createPortal(
        <InlineCommentBox
          line={boxLine}
          quotedText={modifiedEditorRef.current?.getModel()?.getLineContent(boxLine) ?? ''}
          onAdd={(body) => { addCommentAt(boxLine, body); closeBox() }}
          onCancel={closeBox}
        />,
        boxNode,
      )}
      {/* Diff Editor */}
      <div className="flex-1 min-h-0">
        <DiffEditor
          key={`${filePath}:${sideBySide ? 'sbs' : 'inline'}`}
          height="100%"
          language={detectedLanguage}
          original={originalContent}
          modified={modifiedContent}
          theme={MONACO_THEMES[resolvedTheme]}
          onMount={handleDiffEditorMount}
          keepCurrentOriginalModel={false}
          keepCurrentModifiedModel={false}
          options={{
            readOnly: true,
            wordWrap: 'on',
            // diffWordWrap drives wordWrapOverride1 on both inner editors via
            // Monaco's reactive autorun, so it survives diff recomputations.
            diffWordWrap: 'on',
            renderSideBySide: sideBySide,
            // Honor our explicit sideBySide choice at any width. Otherwise
            // Monaco silently flips to inline mode when the editor is narrower
            // than renderSideBySideInlineBreakpoint (default 900px), and that
            // inline path sets wordWrapOverride2: 'off' on the original editor
            // — which sticks even after the layout grows back, leaving the
            // left pane permanently un-wrapped.
            useInlineViewWhenSpaceIsLimited: false,
            minimap: { enabled: false },
            fontSize: editorFontSize,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            glyphMargin: !!commentsContext,
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
      {commentsContext && (
        <style>{`
          .review-comment-glyph {
            background-color: rgb(var(--color-warning-base));
            border-radius: 50%;
            width: 8px !important;
            height: 8px !important;
            margin-top: 6px;
            margin-left: 4px;
          }
          .review-comment-line {
            /* 0.05 is invisible on a light ground; the token carries the theme. */
            background-color: rgb(var(--color-warning-base) / 0.12);
          }
          .margin-view-overlays .cgmr {
            cursor: pointer;
          }
          .add-comment-glyph {
            color: rgb(var(--color-accent));
            cursor: pointer;
          }
          .add-comment-glyph::before {
            content: '+';
            display: block;
            text-align: center;
            font-weight: 700;
            line-height: 1;
          }
        `}</style>
      )}
    </div>
  )
}
