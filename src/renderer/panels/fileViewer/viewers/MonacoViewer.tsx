/**
 * Monaco Editor-based file viewer and editor for text files.
 *
 * Configures Monaco workers for Vite, maps file extensions to language IDs, and renders
 * a full Monaco editor instance with a dark theme, read-write editing, Cmd+S save support,
 * scroll-to-line navigation, search-text highlighting via decorations, go-to-definition
 * with Cmd+Click, and an outline/symbol quick-open dialog. Registers as the lowest-priority
 * fallback viewer, accepting any file with a known text extension or text-like content.
 */
import { useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Editor, { loader, Monaco } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import type { FileViewerPlugin, FileViewerComponentProps } from './types'
import { getFileExtension } from './types'
import { useMonacoComments } from '../hooks/useMonacoComments'
import { useCommentBox } from '../hooks/useCommentBox'
import InlineCommentBox from '../components/InlineCommentBox'
import { useSettingsStore } from '../../../store/settings'
import { MONACO_THEMES } from '../../../shared/theme/monacoTheme'

// Configure Monaco workers for Vite
;(window as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
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

const KNOWN_TEXT_FILENAMES = ['makefile', 'dockerfile', 'gemfile', 'rakefile', 'procfile']

/** Check if a file path has a known text extension or filename */
export function hasKnownTextExtension(filePath: string): boolean {
  const ext = getFileExtension(filePath)
  if (TEXT_EXTENSIONS.includes(ext)) return true
  const fileName = filePath.split('/').pop()?.toLowerCase() || ''
  return KNOWN_TEXT_FILENAMES.includes(fileName)
}

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

/** Scroll to a line and highlight search text in the editor */
function scrollAndHighlight(
  editor: monaco.editor.IStandaloneCodeEditor,
  line: number | undefined,
  highlight: string | undefined,
  decorationsRef: React.MutableRefObject<monaco.editor.IEditorDecorationsCollection | null>,
) {
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
          options: { className: 'searchHighlight', isWholeLine: false }
        }])
      }
    }
  }
}

function MonacoViewerComponent({ filePath, content, onSave, onDirtyChange, scrollToLine, searchHighlight, commentsContext, onEditorReady, onOpenFile }: FileViewerComponentProps) {
  // One source for both editors: Monaco's setTheme is global, so they cannot disagree.
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme)
  const editorFontSize = useSettingsStore((s) => s.appearance.editorFontSize)
  const language = getLanguageFromPath(filePath)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const originalContentRef = useRef(content)
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const scrollToLineRef = useRef(scrollToLine)
  const searchHighlightRef = useRef(searchHighlight)
  const onOpenFileRef = useRef(onOpenFile)
  onOpenFileRef.current = onOpenFile
  // Refs for callbacks used inside Monaco's editor.addCommand. addCommand is
  // registered once on mount and the @monaco-editor/react Editor reuses the
  // same instance across files, so a direct closure capture would go stale
  // whenever the parent re-issues handleSave (e.g., after filePath changes).
  const onSaveRef = useRef(onSave)
  const onDirtyChangeRef = useRef(onDirtyChange)
  onSaveRef.current = onSave
  onDirtyChangeRef.current = onDirtyChange

  const { addCommentAt } = useMonacoComments({ filePath, commentsContext, editorRef })
  const { boxLine, boxNode, openBox, closeBox } = useCommentBox(editorRef)

  // Keep refs in sync
  scrollToLineRef.current = scrollToLine
  searchHighlightRef.current = searchHighlight

  // Dirty detection baseline. Sync it to the parent's `content` prop on every
  // render BEFORE child effects fire, so the wrapper's setValue-driven onChange
  // (which is normally suppressed, but if it fires for any reason) compares
  // against the latest parent content. We later overwrite this ref with
  // editor.getValue() once Monaco has the content — Monaco may normalize
  // content (line endings, BOM stripping, etc.) so its actual value can differ
  // from the prop, and a stale-prop baseline would then consistently flag the
  // file as dirty even when the user has not edited it.
  if (originalContentRef.current !== content) {
    originalContentRef.current = content
  }

  // After parent updates content (file load, watcher reload, save), let Monaco
  // process the new value, then reset the dirty baseline to whatever Monaco
  // actually has in the editor. This is the core defense against false-positive
  // dirty detection: regardless of any normalization Monaco applies (CRLF↔LF,
  // BOM, trailing-newline behavior), getValue() === getValue() so the file
  // shows as clean until the user actually types.
  useEffect(() => {
    const editor = editorRef.current
    if (editor) {
      originalContentRef.current = editor.getValue()
    }
    onDirtyChange?.(false, content)
  }, [content, filePath])

  const applyScrollAndHighlight = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    scrollAndHighlight(editor, scrollToLineRef.current, searchHighlightRef.current, decorationsRef)
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
    // Anchor the dirty-detection baseline to Monaco's actual editor value, not
    // the content prop. Monaco may normalize the content (line endings, BOM,
    // etc.); using its post-normalization value as the baseline guarantees the
    // first onChange after mount can only fire as dirty if the user has
    // genuinely edited the text.
    originalContentRef.current = editor.getValue()
    // Apply pending scroll/highlight now that the editor is ready
    if (scrollToLineRef.current) {
      // Monaco editor is ready at onMount, but give it a moment for layout
      setTimeout(() => applyScrollAndHighlight(editor), 150)
    }

    // Add Cmd/Ctrl+S save handler
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      const editorContent = editor.getValue()
      const save = onSaveRef.current
      if (save && editorContent !== originalContentRef.current) {
        void save(editorContent).then((saved) => {
          // Only reset dirty state if the save actually went through
          // (it may be aborted if the file changed on disk)
          if (saved) {
            originalContentRef.current = editorContent
            onDirtyChangeRef.current?.(false, editorContent)
          }
        })
      }
    })

    // Comment gutter: hover shows an "add comment" affordance; click opens the box.
    if (commentsContext) {
      const hoverDecorations = editor.createDecorationsCollection([])
      editor.onMouseMove((e) => {
        const line = e.target.position?.lineNumber
        if (line && e.target.type === monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
          hoverDecorations.set([{
            range: new monacoInstance.Range(line, 1, line, 1),
            options: { glyphMarginClassName: 'add-comment-glyph', glyphMarginHoverMessage: { value: 'Add comment' } },
          }])
        } else {
          hoverDecorations.clear()
        }
      })
      editor.onMouseLeave(() => hoverDecorations.clear())
      editor.onMouseDown((e) => {
        if (e.target.type === monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
          const lineNumber = e.target.position?.lineNumber
          if (lineNumber) openBox(lineNumber)
        }
      })
    }

    // Notify parent of available editor actions
    onEditorReady?.({
      showOutline: () => {
        editor.focus()
        editor.trigger('keyboard', 'editor.action.quickOutline', {})
      },
      showFind: () => {
        editor.focus()
        editor.trigger('keyboard', 'actions.find', {})
      },
    })
  }

  // Register editor opener for cmd-click go-to-definition across files.
  // Navigation is deferred with queueMicrotask so the React state update
  // (which swaps the Monaco model) happens after Monaco finishes its
  // internal mouse-event / focus pipeline — otherwise Monaco throws when
  // it tries to fire events on a model that was replaced mid-click.
  useEffect(() => {
    const disposable = monaco.editor.registerEditorOpener({
      openCodeEditor(_source, resource, selectionOrPosition) {
        const targetPath = resource.path
        if (targetPath && onOpenFileRef.current) {
          const line = selectionOrPosition
            ? ('startLineNumber' in selectionOrPosition ? selectionOrPosition.startLineNumber : selectionOrPosition.lineNumber)
            : undefined
          const callback = onOpenFileRef.current
          queueMicrotask(() => callback(targetPath, line))
          return true
        }
        return false
      }
    })
    return () => disposable.dispose()
  }, [])

  // Cleanup: notify parent that editor actions are gone
  useEffect(() => {
    return () => {
      onEditorReady?.(null)
    }
  }, [])

  const handleEditorChange = (value: string | undefined) => {
    const newContent = value ?? ''
    const isDirty = newContent !== originalContentRef.current
    onDirtyChange?.(isDirty, newContent)
  }

  return (
    <div className="h-full flex flex-col">
      {boxNode && boxLine !== null && createPortal(
        <InlineCommentBox
          line={boxLine}
          quotedText={editorRef.current?.getModel()?.getLineContent(boxLine) ?? ''}
          onAdd={(body) => { addCommentAt(boxLine, body); closeBox() }}
          onCancel={closeBox}
        />,
        boxNode,
      )}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          path={filePath}
          language={language}
          value={content}
          theme={MONACO_THEMES[resolvedTheme]}
          onMount={handleEditorDidMount}
          onChange={handleEditorChange}
          options={{
            readOnly: !onSave,
            minimap: { enabled: false },
            fontSize: editorFontSize,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            glyphMargin: !!commentsContext,
          }}
        />
      </div>
      {/* Add CSS for review comment decorations */}
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

// Re-export from utility module for backwards compatibility
export { isTextContent } from '../../../shared/utils/textDetection'

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
    if (hasKnownTextExtension(filePath)) return true
    // For unknown extensions, we'll check content in FileViewer
    // Return true here and let FileViewer filter based on content
    return true
  },
  priority: 1, // Lowest priority - used as fallback
  component: MonacoViewerComponent,
}
