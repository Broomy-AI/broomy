/**
 * File viewer plugin for rendering HTML files using Electron's webview tag.
 */
import { useState } from 'react'
import type { FileViewerPlugin, FileViewerComponentProps } from './types'
import { matchesExtensions } from './types'

function HtmlViewerComponent({ filePath }: FileViewerComponentProps) {
  const [showSource, setShowSource] = useState(false)

  if (showSource) {
    // Fall through to Monaco by returning null — the parent will pick the next viewer
    // Instead, we toggle state and let the parent know via a custom mechanism
    // For simplicity, we render a message directing to use the viewer switcher
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        <div className="text-center">
          <p>Use the viewer switcher in the toolbar to view source.</p>
          <button
            onClick={() => setShowSource(false)}
            className="mt-2 px-3 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors"
          >
            Back to Preview
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border bg-bg-secondary flex-shrink-0">
        <span className="text-xs text-text-secondary flex-1 truncate font-mono">
          {filePath.split('/').pop()}
        </span>
        <button
          onClick={() => setShowSource(true)}
          className="px-2 py-0.5 text-xs rounded bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
          title="View page source"
        >
          Source
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <webview
          src={`file://${filePath}`}
          className="w-full h-full"
          nodeintegration={false}
        />
      </div>
    </div>
  )
}

export const HtmlViewer: FileViewerPlugin = {
  id: 'html-viewer',
  name: 'HTML Preview',
  canHandle: (filePath: string) => matchesExtensions(filePath, ['html', 'htm']),
  priority: 50,
  component: HtmlViewerComponent,
}
