/**
 * File viewer plugin that renders URLs in an Electron webview.
 * Handles paths starting with "https://" and displays them in an embedded browser
 * with navigation controls and in-page find (Cmd+F).
 */
import { useRef, useCallback, useState, useEffect } from 'react'
import type { FileViewerPlugin, FileViewerComponentProps } from './types'
import FindBar from './FindBar'

function WebviewViewerComponent({ filePath, onEditorReady }: FileViewerComponentProps) {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const findInputRef = useRef<HTMLInputElement | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [currentUrl, setCurrentUrl] = useState(filePath)
  const [showFindBar, setShowFindBar] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findResult, setFindResult] = useState<{ activeMatch: number; matches: number } | null>(null)

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleNavigation = () => {
      setCanGoBack(webview.canGoBack())
      setCanGoForward(webview.canGoForward())
      setCurrentUrl(webview.getURL())
    }

    const handleDomReady = () => {
      const hash = new URL(webview.getURL()).hash
      if (!hash) return
      const id = CSS.escape(hash.slice(1))
      void webview.executeJavaScript(`(function(){
        var id=${JSON.stringify(id)};
        function t(){var e=document.getElementById(id);if(e){e.scrollIntoView({block:'start'});return true}return false}
        if(t())return;
        var o=new MutationObserver(function(){if(t())o.disconnect()});
        o.observe(document.body,{childList:true,subtree:true});
        setTimeout(function(){o.disconnect()},15000);
      })()`)
    }

    const handleFoundInPage = (e: Electron.FoundInPageEvent) => {
      setFindResult({ activeMatch: e.result.activeMatchOrdinal, matches: e.result.matches })
    }

    webview.addEventListener('did-navigate', handleNavigation)
    webview.addEventListener('did-navigate-in-page', handleNavigation)
    webview.addEventListener('dom-ready', handleDomReady)
    webview.addEventListener('found-in-page', handleFoundInPage)

    return () => {
      webview.removeEventListener('did-navigate', handleNavigation)
      webview.removeEventListener('did-navigate-in-page', handleNavigation)
      webview.removeEventListener('dom-ready', handleDomReady)
      webview.removeEventListener('found-in-page', handleFoundInPage)
    }
  }, [])

  // Expose find action via EditorActions
  const openFindBar = useCallback(() => {
    setShowFindBar(true)
    requestAnimationFrame(() => findInputRef.current?.focus())
  }, [])

  useEffect(() => {
    onEditorReady?.({
      showOutline: () => { /* no outline for webview */ },
      showFind: openFindBar,
    })
    return () => { onEditorReady?.(null) }
  }, [onEditorReady, openFindBar])

  // Handle Cmd+F within the webview's parent container
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        e.stopPropagation()
        openFindBar()
      }
    }
    const container = webviewRef.current?.parentElement?.parentElement
    container?.addEventListener('keydown', handleKeyDown, true)
    return () => container?.removeEventListener('keydown', handleKeyDown, true)
  }, [openFindBar])

  // Handle Cmd+F when the webview itself has focus. Keyboard events inside
  // a <webview> don't propagate to the embedder DOM, so the main process
  // intercepts them via before-input-event and forwards as a CustomEvent.
  useEffect(() => {
    const handler = () => openFindBar()
    window.addEventListener('webview:find-in-page', handler)
    return () => window.removeEventListener('webview:find-in-page', handler)
  }, [openFindBar])

  // Run findInPage when query changes
  const findActiveRef = useRef(false)
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return
    if (findQuery) {
      findActiveRef.current = true
      webview.findInPage(findQuery)
    } else if (findActiveRef.current) {
      findActiveRef.current = false
      webview.stopFindInPage('clearSelection')
      setFindResult(null)
    }
  }, [findQuery])

  const closeFindBar = useCallback(() => {
    setShowFindBar(false)
    setFindQuery('')
    setFindResult(null)
    webviewRef.current?.stopFindInPage('clearSelection')
  }, [])

  const findNext = useCallback(() => {
    if (findQuery) webviewRef.current?.findInPage(findQuery, { findNext: true })
  }, [findQuery])

  const findPrevious = useCallback(() => {
    if (findQuery) webviewRef.current?.findInPage(findQuery, { forward: false, findNext: true })
  }, [findQuery])

  return (
    <div className="h-full flex flex-col">
      {/* Navigation bar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-bg-tertiary border-b border-border flex-shrink-0">
        <button
          onClick={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
          className="p-1 rounded text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
          title="Go back"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => webviewRef.current?.goForward()}
          disabled={!canGoForward}
          className="p-1 rounded text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
          title="Go forward"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={() => webviewRef.current?.reload()}
          className="p-1 rounded text-text-secondary hover:text-text-primary transition-colors"
          title="Reload"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <div className="flex-1 mx-1 px-2 py-0.5 text-xs text-text-secondary bg-bg-secondary rounded truncate font-mono">
          {currentUrl}
        </div>
        <button
          onClick={openFindBar}
          className="p-1 rounded text-text-secondary hover:text-text-primary transition-colors"
          title="Find in page (Cmd+F)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <button
          onClick={() => void window.shell.openExternal(currentUrl)}
          className="p-1 rounded text-text-secondary hover:text-text-primary transition-colors"
          title="Open in browser"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>

      {/* Find bar */}
      {showFindBar && (
        <FindBar
          inputRef={findInputRef}
          query={findQuery}
          onQueryChange={setFindQuery}
          onNext={findNext}
          onPrevious={findPrevious}
          onClose={closeFindBar}
          matchInfo={findResult ? { active: findResult.activeMatch, total: findResult.matches } : null}
        />
      )}

      {/* Webview */}
      <div className="flex-1 min-h-0">
        <webview
          ref={webviewRef as React.Ref<Electron.WebviewTag>}
          src={filePath}
          className="w-full h-full"
          // @ts-expect-error allowpopups is a string attribute in the DOM but typed as boolean in Electron
          allowpopups="true"
        />
      </div>
    </div>
  )
}

export const WebviewViewer: FileViewerPlugin = {
  id: 'webview',
  name: 'Web Page',
  canHandle: (filePath: string) => filePath.startsWith('https://'),
  priority: 100,
  component: WebviewViewerComponent,
}
