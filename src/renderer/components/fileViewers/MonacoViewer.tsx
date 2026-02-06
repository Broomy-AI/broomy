import { useRef, useEffect } from 'react'
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

function MonacoViewerComponent({ filePath, content, onSave, onDirtyChange, targetLine }: FileViewerComponentProps) {
  const language = getLanguageFromPath(filePath)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const originalContentRef = useRef(content)

  // Update original content when file changes
  useEffect(() => {
    originalContentRef.current = content
    onDirtyChange?.(false, content)
  }, [content, filePath])

  // Scroll to target line when specified
  useEffect(() => {
    if (targetLine && editorRef.current) {
      editorRef.current.revealLineInCenter(targetLine)
      editorRef.current.setPosition({ lineNumber: targetLine, column: 1 })
    }
  }, [targetLine, filePath])

  const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
    editorRef.current = editor

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
  }

  const handleEditorChange = (value: string | undefined) => {
    const newContent = value ?? ''
    const isDirty = newContent !== originalContentRef.current
    onDirtyChange?.(isDirty, newContent)
  }

  return (
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
      }}
    />
  )
}

// Check if content appears to be text (exported for use by FileViewer)
export function isTextContent(content: string): boolean {
  if (!content || content.length === 0) return true
  // Check for null bytes which indicate binary content
  if (content.includes('\0')) return false
  // Check if most characters are printable
  const printableRatio = content.split('').filter((char) => {
    const code = char.charCodeAt(0)
    return (code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13 || (code >= 160 && code <= 255)
  }).length / content.length
  return printableRatio > 0.85
}

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
