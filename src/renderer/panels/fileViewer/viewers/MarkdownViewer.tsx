/**
 * Markdown preview viewer using react-markdown with GitHub Flavored Markdown support.
 *
 * Renders markdown content with dark-theme-styled custom components for headings,
 * links, code blocks, blockquotes, tables, images, and lists. Uses remark-gfm for
 * tables, strikethrough, and other GFM extensions. Registered at higher priority than
 * Monaco for .md/.markdown/.mdx files so preview is the default view.
 */
import { useRef, useState, useCallback, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FileViewerPlugin, FileViewerComponentProps } from './types'
import { matchesExtensions } from './types'
import { createMarkdownComponents } from '../../../shared/utils/markdownComponents'
import FindBar from './FindBar'

const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdx']
const markdownComponents = createMarkdownComponents('default')

/** Walk all text nodes under `root` and return ranges matching `query` (case-insensitive). */
function findTextRanges(root: HTMLElement, query: string): Range[] {
  const ranges: Range[] = []
  const lower = query.toLowerCase()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    const text = (node.textContent || '').toLowerCase()
    let start = 0
    let idx: number
    while ((idx = text.indexOf(lower, start)) !== -1) {
      const range = document.createRange()
      range.setStart(node, idx)
      range.setEnd(node, idx + query.length)
      ranges.push(range)
      start = idx + 1
    }
  }
  return ranges
}

function MarkdownViewerComponent({ content, onEditorReady }: FileViewerComponentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const findInputRef = useRef<HTMLInputElement | null>(null)
  const [showFindBar, setShowFindBar] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [activeMatch, setActiveMatch] = useState(0)
  const highlightRef = useRef<Highlight | null>(null)
  const rangesRef = useRef<Range[]>([])

  const openFindBar = useCallback(() => {
    setShowFindBar(true)
    requestAnimationFrame(() => findInputRef.current?.focus())
  }, [])

  // Expose find action via EditorActions
  useEffect(() => {
    onEditorReady?.({
      showOutline: () => { /* no outline for markdown */ },
      showFind: openFindBar,
    })
    return () => { onEditorReady?.(null) }
  }, [onEditorReady, openFindBar])

  // Handle Cmd+F within the container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        e.stopPropagation()
        openFindBar()
      }
    }
    el.addEventListener('keydown', handleKeyDown, true)
    return () => el.removeEventListener('keydown', handleKeyDown, true)
  }, [openFindBar])

  // Highlight matches using CSS Custom Highlight API
  useEffect(() => {
    const container = containerRef.current
    if (!container || !findQuery) {
      if (highlightRef.current) {
        CSS.highlights.delete('broomy-find')
        CSS.highlights.delete('broomy-find-active')
      }
      rangesRef.current = []
      setMatchCount(0)
      setActiveMatch(0)
      return
    }

    const ranges = findTextRanges(container, findQuery)
    rangesRef.current = ranges
    setMatchCount(ranges.length)
    setActiveMatch(ranges.length > 0 ? 1 : 0)

    const highlight = new Highlight(...ranges)
    CSS.highlights.set('broomy-find', highlight)
    highlightRef.current = highlight

    if (ranges.length > 0) {
      CSS.highlights.set('broomy-find-active', new Highlight(ranges[0]))
      ranges[0].startContainer.parentElement?.scrollIntoView({ block: 'center' })
    }

    return () => {
      CSS.highlights.delete('broomy-find')
      CSS.highlights.delete('broomy-find-active')
    }
  }, [findQuery, content])

  const navigateMatch = useCallback((direction: 1 | -1) => {
    const ranges = rangesRef.current
    if (ranges.length === 0) return
    const newIndex = ((activeMatch - 1 + direction + ranges.length) % ranges.length)
    setActiveMatch(newIndex + 1)
    CSS.highlights.set('broomy-find-active', new Highlight(ranges[newIndex]))
    ranges[newIndex].startContainer.parentElement?.scrollIntoView({ block: 'center' })
  }, [activeMatch])

  const closeFindBar = useCallback(() => {
    setShowFindBar(false)
    setFindQuery('')
  }, [])

  return (
    <div ref={containerRef} className="h-full flex flex-col" tabIndex={-1}>
      {showFindBar && (
        <FindBar
          inputRef={findInputRef}
          query={findQuery}
          onQueryChange={setFindQuery}
          onNext={() => navigateMatch(1)}
          onPrevious={() => navigateMatch(-1)}
          onClose={closeFindBar}
          matchInfo={findQuery ? { active: activeMatch, total: matchCount } : null}
        />
      )}

      <div className="flex-1 overflow-auto p-4 bg-bg-primary">
        <div className="max-w-3xl mx-auto prose prose-invert prose-sm">
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {content}
          </Markdown>
        </div>
      </div>

      <style>{`
        ::highlight(broomy-find) {
          background-color: rgb(var(--color-warning-base) / 0.3);
          color: inherit;
        }
        ::highlight(broomy-find-active) {
          background-color: rgb(var(--color-warning-base) / 0.7);
          color: inherit;
        }
      `}</style>
    </div>
  )
}

export const MarkdownViewer: FileViewerPlugin = {
  id: 'markdown',
  name: 'Preview',
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  canHandle: (filePath: string) => matchesExtensions(filePath, MARKDOWN_EXTENSIONS),
  priority: 50, // Higher than Monaco for markdown files
  component: MarkdownViewerComponent,
}
