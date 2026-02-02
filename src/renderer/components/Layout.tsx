import { ReactNode, useEffect, useState, useCallback, useRef } from 'react'
import ErrorIndicator from './ErrorIndicator'
import type { LayoutSizes, FileViewerPosition } from '../store/sessions'

// Detect if we're on Mac for keyboard shortcut display
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

interface LayoutProps {
  sidebar: ReactNode
  agentTerminal: ReactNode
  userTerminal: ReactNode
  explorer: ReactNode | null
  fileViewer: ReactNode | null
  settingsPanel: ReactNode | null
  showSidebar: boolean
  showExplorer: boolean
  showFileViewer: boolean
  showAgentTerminal: boolean
  showUserTerminal: boolean
  showSettings: boolean
  fileViewerPosition: FileViewerPosition
  sidebarWidth: number
  layoutSizes: LayoutSizes
  errorMessage?: string | null // Show this instead of panels if set
  onSidebarWidthChange: (width: number) => void
  onLayoutSizeChange: (key: keyof LayoutSizes, value: number) => void
  onToggleSidebar: () => void
  onToggleExplorer: () => void
  onToggleFileViewer: () => void
  onToggleAgentTerminal: () => void
  onToggleUserTerminal: () => void
  onToggleSettings: () => void
}

// Keyboard shortcut helper
const formatShortcut = (key: string) => {
  const modifier = isMac ? '⌘' : 'Ctrl+'
  return `${modifier}${key}`
}

type DividerType = 'sidebar' | 'explorer' | 'fileViewer' | 'userTerminal' | null

export default function Layout({
  sidebar,
  agentTerminal,
  userTerminal,
  explorer,
  fileViewer,
  settingsPanel,
  showSidebar,
  showExplorer,
  showFileViewer,
  showAgentTerminal,
  showUserTerminal,
  showSettings,
  fileViewerPosition,
  sidebarWidth,
  layoutSizes,
  errorMessage,
  onSidebarWidthChange,
  onLayoutSizeChange,
  onToggleSidebar,
  onToggleExplorer,
  onToggleFileViewer,
  onToggleAgentTerminal,
  onToggleUserTerminal,
  onToggleSettings,
}: LayoutProps) {
  const [draggingDivider, setDraggingDivider] = useState<DividerType>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mainContentRef = useRef<HTMLDivElement>(null)

  // Handle drag for resizing panels
  const handleMouseDown = useCallback((divider: DividerType) => (e: React.MouseEvent) => {
    e.preventDefault()
    setDraggingDivider(divider)
  }, [])

  useEffect(() => {
    if (!draggingDivider) return

    const handleMouseMove = (e: MouseEvent) => {
      const mainRect = mainContentRef.current?.getBoundingClientRect()
      const centerRect = containerRef.current?.getBoundingClientRect()

      switch (draggingDivider) {
        case 'sidebar': {
          if (!mainRect) return
          const newWidth = e.clientX - mainRect.left
          onSidebarWidthChange(Math.max(150, Math.min(newWidth, 400)))
          break
        }
        case 'explorer': {
          if (!mainRect) return
          const offset = showSidebar ? sidebarWidth : 0
          const newWidth = e.clientX - mainRect.left - offset
          onLayoutSizeChange('explorerWidth', Math.max(150, Math.min(newWidth, 500)))
          break
        }
        case 'fileViewer': {
          if (!centerRect) return
          if (fileViewerPosition === 'top') {
            const newHeight = e.clientY - centerRect.top
            const maxHeight = centerRect.height - 100
            onLayoutSizeChange('fileViewerSize', Math.max(100, Math.min(newHeight, maxHeight)))
          } else {
            const newWidth = e.clientX - centerRect.left
            const maxWidth = centerRect.width - 200
            onLayoutSizeChange('fileViewerSize', Math.max(200, Math.min(newWidth, maxWidth)))
          }
          break
        }
        case 'userTerminal': {
          if (!centerRect) return
          const newHeight = centerRect.bottom - e.clientY
          onLayoutSizeChange('userTerminalHeight', Math.max(100, Math.min(newHeight, 500)))
          break
        }
      }
    }

    const handleMouseUp = () => {
      setDraggingDivider(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingDivider, fileViewerPosition, sidebarWidth, showSidebar, onSidebarWidthChange, onLayoutSizeChange])

  // Handle panel toggle by key
  const handleToggleByKey = useCallback((key: string) => {
    switch (key) {
      case '1':
        onToggleSidebar()
        break
      case '2':
        onToggleExplorer()
        break
      case '3':
        onToggleFileViewer()
        break
      case '4':
        onToggleAgentTerminal()
        break
      case '5':
        onToggleUserTerminal()
        break
      case '6':
        onToggleSettings()
        break
    }
  }, [onToggleSidebar, onToggleExplorer, onToggleFileViewer, onToggleAgentTerminal, onToggleUserTerminal, onToggleSettings])

  // Keyboard shortcuts - use capture phase to intercept before terminal gets them
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        handleToggleByKey(e.key)
      }
    }

    // Also listen for custom events from Terminal (xterm may block normal event bubbling)
    const handleCustomToggle = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>
      handleToggleByKey(customEvent.detail.key)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('app:toggle-panel', handleCustomToggle)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('app:toggle-panel', handleCustomToggle)
    }
  }, [handleToggleByKey])

  // Divider component - wide hit area, thin visual line
  const Divider = ({ type, direction }: { type: DividerType; direction: 'horizontal' | 'vertical' }) => (
    <div
      onMouseDown={handleMouseDown(type)}
      className={`flex-shrink-0 group relative ${
        direction === 'vertical'
          ? 'w-0 cursor-col-resize'
          : 'h-0 cursor-row-resize'
      }`}
    >
      {/* Invisible wide hit area */}
      <div className={`absolute ${
        direction === 'vertical'
          ? 'w-4 h-full -left-2 top-0'
          : 'h-4 w-full -top-2 left-0'
      }`} />
      {/* Thin visible line */}
      <div className={`absolute transition-colors ${
        draggingDivider === type ? 'bg-accent' : 'bg-border group-hover:bg-accent/50'
      } ${direction === 'vertical' ? 'w-px h-full left-0 top-0' : 'h-px w-full top-0 left-0'}`} />
    </div>
  )

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Title bar / toolbar - draggable region */}
      <div
        className="h-10 flex items-center justify-between px-4 bg-bg-secondary border-b border-border"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 pl-16">
          <span className="text-sm font-medium text-text-primary">Agent Manager</span>
        </div>
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={onToggleSidebar}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              showSidebar
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
            title={`Sessions (${formatShortcut('1')})`}
          >
            Sessions
          </button>
          <button
            onClick={onToggleExplorer}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              showExplorer
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
            title={`File Explorer (${formatShortcut('2')})`}
          >
            Explorer
          </button>
          <button
            onClick={onToggleFileViewer}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              showFileViewer
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
            title={`File Viewer (${formatShortcut('3')})`}
          >
            File
          </button>
          <button
            onClick={onToggleAgentTerminal}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              showAgentTerminal
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
            title={`Agent Terminal (${formatShortcut('4')})`}
          >
            Agent
          </button>
          <button
            onClick={onToggleUserTerminal}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              showUserTerminal
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
            title={`User Terminal (${formatShortcut('5')})`}
          >
            Terminal
          </button>
          <ErrorIndicator />
          <button
            onClick={onToggleSettings}
            className={`p-1.5 rounded transition-colors ${
              showSettings
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
            title={`Settings (${formatShortcut('6')})`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div ref={mainContentRef} className="flex-1 flex min-h-0">
        {/* Sidebar */}
        {showSidebar && (
          <>
            <div
              className="flex-shrink-0 bg-bg-secondary overflow-y-auto"
              style={{ width: sidebarWidth }}
            >
              {sidebar}
            </div>
            <Divider type="sidebar" direction="vertical" />
          </>
        )}

        {/* Center + Right panels */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Main row: terminals + side panels */}
          <div className="flex-1 flex min-h-0">
            {/* Show error message instead of panels if set */}
            {errorMessage ? (
              <div className="flex-1 flex items-center justify-center bg-bg-primary text-text-secondary">
                <div className="text-center">
                  <p className="text-red-400">{errorMessage}</p>
                </div>
              </div>
            ) : (
              <>
                {/* Left side panels (Explorer) */}
                {explorer && (
                  <>
                    <div
                      className="flex-shrink-0 bg-bg-secondary overflow-y-auto"
                      style={{ width: layoutSizes.explorerWidth }}
                    >
                      {explorer}
                    </div>
                    <Divider type="explorer" direction="vertical" />
                  </>
                )}

                {/* Center: file viewer + terminals or settings */}
                <div ref={containerRef} className={`flex-1 min-w-0 ${fileViewerPosition === 'left' && fileViewer ? 'flex' : 'flex flex-col'}`}>
                  {settingsPanel ? (
                <div className="flex-1 min-w-0 bg-bg-secondary overflow-y-auto">
                  {settingsPanel}
                </div>
              ) : fileViewerPosition === 'left' ? (
                /* Left position: file viewer on left, terminals on right */
                <>
                  {/* File viewer - left side */}
                  {fileViewer && (
                    <div
                      className="flex-shrink-0 bg-bg-secondary min-h-0"
                      style={{
                        width: (showAgentTerminal || showUserTerminal) ? layoutSizes.fileViewerSize : undefined,
                        flex: (showAgentTerminal || showUserTerminal) ? undefined : 1,
                      }}
                    >
                      {fileViewer}
                    </div>
                  )}

                  {/* Draggable divider (vertical) */}
                  {fileViewer && (showAgentTerminal || showUserTerminal) && (
                    <Divider type="fileViewer" direction="vertical" />
                  )}

                  {/* Terminals container - right side */}
                  {(showAgentTerminal || showUserTerminal) && (
                    <div className="flex-1 flex flex-col min-w-0">
                      {/* Agent terminal */}
                      {showAgentTerminal && (
                        <div className={`flex-1 min-w-0 bg-bg-primary ${showUserTerminal ? 'border-b border-border' : ''}`}>
                          {agentTerminal}
                        </div>
                      )}

                      {/* User terminal divider */}
                      {showAgentTerminal && showUserTerminal && (
                        <Divider type="userTerminal" direction="horizontal" />
                      )}

                      {/* User terminal */}
                      {showUserTerminal && (
                        <div
                          className={`bg-bg-primary ${showAgentTerminal ? 'flex-shrink-0' : 'flex-1'}`}
                          style={showAgentTerminal ? { height: layoutSizes.userTerminalHeight } : undefined}
                        >
                          {userTerminal}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show placeholder if nothing visible */}
                  {!showAgentTerminal && !showUserTerminal && !fileViewer && (
                    <div className="flex-1 flex items-center justify-center bg-bg-primary text-text-secondary">
                      <div className="text-center">
                        <p>No panels visible</p>
                        <p className="text-sm mt-2">
                          Press {formatShortcut('4')} for Agent or {formatShortcut('5')} for Terminal
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Top position: file viewer on top, terminals below */
                <>
                  {/* File viewer - top */}
                  {fileViewer && (
                    <div
                      className="flex-shrink-0 bg-bg-secondary min-h-0"
                      style={{
                        height: (showAgentTerminal || showUserTerminal) ? layoutSizes.fileViewerSize : undefined,
                        flex: (showAgentTerminal || showUserTerminal) ? undefined : 1,
                      }}
                    >
                      {fileViewer}
                    </div>
                  )}

                  {/* Draggable divider (horizontal) */}
                  {fileViewer && (showAgentTerminal || showUserTerminal) && (
                    <Divider type="fileViewer" direction="horizontal" />
                  )}

                  {/* Agent terminal */}
                  {showAgentTerminal && (
                    <div className={`flex-1 min-w-0 bg-bg-primary ${showUserTerminal ? 'border-b border-border' : ''}`}>
                      {agentTerminal}
                    </div>
                  )}

                  {/* User terminal divider */}
                  {showAgentTerminal && showUserTerminal && (
                    <Divider type="userTerminal" direction="horizontal" />
                  )}

                  {/* User terminal */}
                  {showUserTerminal && (
                    <div
                      className={`bg-bg-primary ${showAgentTerminal ? 'flex-shrink-0' : 'flex-1'}`}
                      style={showAgentTerminal ? { height: layoutSizes.userTerminalHeight } : undefined}
                    >
                      {userTerminal}
                    </div>
                  )}

                  {/* Show placeholder if no panels are visible */}
                  {!showFileViewer && !showAgentTerminal && !showUserTerminal && (
                    <div className="flex-1 flex items-center justify-center bg-bg-primary text-text-secondary">
                      <div className="text-center">
                        <p>No panels visible</p>
                        <p className="text-sm mt-2">
                          Press {formatShortcut('4')} for Agent or {formatShortcut('5')} for Terminal
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
