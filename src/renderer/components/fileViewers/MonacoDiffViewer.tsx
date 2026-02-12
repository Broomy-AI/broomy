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

// Configure Monaco to use locally bundled version instead of CDN
loader.config({ monaco: monacoEditor })

interface MonacoDiffViewerProps {
  filePath: string
  originalContent: string
  modifiedContent: string
  language?: string
  sideBySide?: boolean
  scrollToLine?: number
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
  scrollToLine
}: MonacoDiffViewerProps) {
  const detectedLanguage = language || getLanguageFromPath(filePath)
  const diffEditorRef = useRef<monacoEditor.editor.IStandaloneDiffEditor | null>(null)

  const handleDiffEditorMount = (editor: monacoEditor.editor.IStandaloneDiffEditor) => {
    diffEditorRef.current = editor
    if (scrollToLine) {
      const modifiedEditor = editor.getModifiedEditor()
      modifiedEditor.revealLineInCenter(scrollToLine)
      modifiedEditor.setPosition({ lineNumber: scrollToLine, column: 1 })
    }
  }

  useEffect(() => {
    if (scrollToLine && diffEditorRef.current) {
      const modifiedEditor = diffEditorRef.current.getModifiedEditor()
      modifiedEditor.revealLineInCenter(scrollToLine)
      modifiedEditor.setPosition({ lineNumber: scrollToLine, column: 1 })
    }
  }, [scrollToLine, filePath])

  return (
    <div className="h-full flex flex-col">
      {/* Diff Editor */}
      <div className="flex-1 min-h-0">
        <DiffEditor
          key={sideBySide ? 'side-by-side' : 'inline'}
          height="100%"
          language={detectedLanguage}
          original={originalContent}
          modified={modifiedContent}
          theme="vs-dark"
          onMount={handleDiffEditorMount}
          options={{
            readOnly: true,
            renderSideBySide: sideBySide,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
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
