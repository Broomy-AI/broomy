/**
 * File viewer plugin that renders URLs in an Electron webview.
 * Handles paths starting with "https://" and displays them in an embedded browser
 * with navigation controls.
 */
import { useRef, useCallback, useState, useEffect } from 'react'
import type { FileViewerPlugin, FileViewerComponentProps } from './types'

function WebviewViewerComponent({ filePath }: FileViewerComponentProps) {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [currentUrl, setCurrentUrl] = useState(filePath)

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleNavigation = () => {
      setCanGoBack(webview.canGoBack())
      setCanGoForward(webview.canGoForward())
      setCurrentUrl(webview.getURL())
    }

    // When a page finishes loading with a hash fragment, retry scrolling to the
    // target element. GitHub lazily loads PR diffs so the anchor element may not
    // exist when the page first renders.
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

    webview.addEventListener('did-navigate', handleNavigation)
    webview.addEventListener('did-navigate-in-page', handleNavigation)
    webview.addEventListener('dom-ready', handleDomReady)

    return () => {
      webview.removeEventListener('did-navigate', handleNavigation)
      webview.removeEventListener('did-navigate-in-page', handleNavigation)
      webview.removeEventListener('dom-ready', handleDomReady)
    }
  }, [])

  const handleBack = useCallback(() => {
    webviewRef.current?.goBack()
  }, [])

  const handleForward = useCallback(() => {
    webviewRef.current?.goForward()
  }, [])

  const handleReload = useCallback(() => {
    webviewRef.current?.reload()
  }, [])

  const handleOpenExternal = useCallback(() => {
    void window.shell.openExternal(currentUrl)
  }, [currentUrl])

  return (
    <div className="h-full flex flex-col">
      {/* Navigation bar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-bg-tertiary border-b border-border flex-shrink-0">
        <button
          onClick={handleBack}
          disabled={!canGoBack}
          className="p-1 rounded text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
          title="Go back"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={handleForward}
          disabled={!canGoForward}
          className="p-1 rounded text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
          title="Go forward"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={handleReload}
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
          onClick={handleOpenExternal}
          className="p-1 rounded text-text-secondary hover:text-text-primary transition-colors"
          title="Open in browser"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>

      {/* Webview */}
      <div className="flex-1 min-h-0">
        <webview
          ref={webviewRef as React.Ref<Electron.WebviewTag>}
          src={filePath}
          className="w-full h-full"
          /* @ts-expect-error - webview attributes are not in React types */
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
