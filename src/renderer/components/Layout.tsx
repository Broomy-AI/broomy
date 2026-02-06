import { ReactNode, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import ErrorIndicator from './ErrorIndicator'
import type { LayoutSizes, FileViewerPosition } from '../store/sessions'
import { usePanelContext, PANEL_IDS, MAX_SHORTCUT_PANELS } from '../panels'
import type { PanelDefinition } from '../panels'

// Detect if we're on Mac for keyboard shortcut display
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

interface LayoutProps {
  // Panel content
  panels: Record<string, ReactNode>
  // Visibility state
  panelVisibility: Record<string, boolean>
  globalPanelVisibility: Record<string, boolean>
  // Layout
  fileViewerPosition: FileViewerPosition
  sidebarWidth: number
  layoutSizes: LayoutSizes
  errorMessage?: string | null
  title?: string
  profileChip?: ReactNode
  // Callbacks
  onSidebarWidthChange: (width: number) => void
  onLayoutSizeChange: (key: keyof LayoutSizes, value: number) => void
  onTogglePanel: (panelId: string) => void
  onToggleGlobalPanel: (panelId: string) => void
  onOpenPanelPicker?: () => void
}

// Keyboard shortcut helper
const formatShortcut = (key: string) => {
  const modifier = isMac ? '⌘' : 'Ctrl+'
  return `${modifier}${key}`
}

type DividerType = 'sidebar' | 'explorer' | 'review' | 'fileViewer' | 'userTerminal' | null

export default function Layout({
  panels,
  panelVisibility,
  globalPanelVisibility,
  fileViewerPosition,
  sidebarWidth,
  layoutSizes,
  errorMessage,
  title,
  profileChip,
  onSidebarWidthChange,
  onLayoutSizeChange,
  onTogglePanel,
  onToggleGlobalPanel,
  onOpenPanelPicker,
}: LayoutProps) {
  const [draggingDivider, setDraggingDivider] = useState<DividerType>(null)
  const [isDev, setIsDev] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const mainContentRef = useRef<HTMLDivElement>(null)
  const { registry, toolbarPanels, getShortcutKey } = usePanelContext()

  const [flashedPanel, setFlashedPanel] = useState<string | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Check if we're in dev mode on mount
  useEffect(() => {
    window.app.isDev().then(setIsDev)
  }, [])

  // Get visibility for a panel, considering global vs session state
  const isPanelVisible = useCallback((panelId: string): boolean => {
    const panel = registry.get(panelId)
    if (!panel) return false
    if (panel.isGlobal) {
      return globalPanelVisibility[panelId] ?? panel.defaultVisible
    }
    return panelVisibility[panelId] ?? panel.defaultVisible
  }, [registry, panelVisibility, globalPanelVisibility])

  // Computed visibility states
  const showSidebar = isPanelVisible(PANEL_IDS.SIDEBAR)
  const showExplorer = isPanelVisible(PANEL_IDS.EXPLORER)
  const showFileViewer = isPanelVisible(PANEL_IDS.FILE_VIEWER)
  const showReview = isPanelVisible(PANEL_IDS.REVIEW)
  const showAgentTerminal = isPanelVisible(PANEL_IDS.AGENT_TERMINAL)
  const showUserTerminal = isPanelVisible(PANEL_IDS.USER_TERMINAL)
  const showSettings = isPanelVisible(PANEL_IDS.SETTINGS)

  // Handle toggle for any panel
  const handleToggle = useCallback((panelId: string) => {
    const panel = registry.get(panelId)
    if (!panel) return
    if (panel.isGlobal) {
      onToggleGlobalPanel(panelId)
    } else {
      onTogglePanel(panelId)
    }
  }, [registry, onTogglePanel, onToggleGlobalPanel])

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
        case 'review': {
          if (!mainRect) return
          let reviewOffset = showSidebar ? sidebarWidth : 0
          if (showExplorer) reviewOffset += layoutSizes.explorerWidth
          const newReviewWidth = e.clientX - mainRect.left - reviewOffset
          onLayoutSizeChange('reviewPanelWidth', Math.max(250, Math.min(newReviewWidth, 600)))
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

  // Panel navigation helpers
  const focusPanel = useCallback((panelId: string) => {
    const container = document.querySelector(`[data-panel-id="${panelId}"]`)
    if (!container) return

    // For terminals: focus the xterm helper textarea
    const xtermTextarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
    if (xtermTextarea) {
      xtermTextarea.focus()
      return
    }

    // For Monaco editor: focus the editor textarea
    const monacoTextarea = container.querySelector('textarea.inputarea') as HTMLTextAreaElement | null
    if (monacoTextarea) {
      monacoTextarea.focus()
      return
    }

    // Fallback: focus any focusable element inside
    const focusable = container.querySelector('input, textarea, button, [tabindex]') as HTMLElement | null
    if (focusable) {
      focusable.focus()
      return
    }

    // Last resort: focus the container itself (needs tabIndex={-1})
    ;(container as HTMLElement).focus()
  }, [])

  const getCurrentPanel = useCallback((): string | null => {
    const activeEl = document.activeElement
    if (!activeEl) return null
    const panelEl = activeEl.closest('[data-panel-id]')
    return panelEl?.getAttribute('data-panel-id') ?? null
  }, [])

  // Track last cycle position so cycling always advances even if focus detection fails
  const lastCyclePanelRef = useRef<string | null>(null)

  // Cycle through visible toolbar panels in order (Ctrl+Tab / Ctrl+Shift+Tab)
  const handleCyclePanel = useCallback((reverse: boolean) => {
    // Get visible toolbar panels in order (skip settings since it replaces content)
    const visiblePanels = toolbarPanels.filter(id => {
      if (!isPanelVisible(id)) return false
      if (id === PANEL_IDS.SETTINGS) return false
      return !!panels[id]
    })

    if (visiblePanels.length === 0) return

    // Try to determine current position: first from activeElement, then from last cycle
    const current = getCurrentPanel() || lastCyclePanelRef.current
    const currentIndex = current ? visiblePanels.indexOf(current) : -1

    let nextIndex: number
    if (currentIndex === -1) {
      nextIndex = reverse ? visiblePanels.length - 1 : 0
    } else if (reverse) {
      nextIndex = (currentIndex - 1 + visiblePanels.length) % visiblePanels.length
    } else {
      nextIndex = (currentIndex + 1) % visiblePanels.length
    }

    const targetPanel = visiblePanels[nextIndex]
    lastCyclePanelRef.current = targetPanel
    focusPanel(targetPanel)

    // Brief flash overlay
    setFlashedPanel(targetPanel)
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = setTimeout(() => setFlashedPanel(null), 250)
  }, [toolbarPanels, isPanelVisible, panels, getCurrentPanel, focusPanel])

  // Handle panel toggle by key (1-6 for toolbar panels)
  const handleToggleByKey = useCallback((key: string) => {
    const index = parseInt(key, 10) - 1
    if (index >= 0 && index < toolbarPanels.length && index < MAX_SHORTCUT_PANELS) {
      const panelId = toolbarPanels[index]
      handleToggle(panelId)
    }
  }, [toolbarPanels, handleToggle])

  // Keyboard shortcuts - use capture phase to intercept before terminal gets them
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Tab cycles panels — handle before textarea check since it's app-wide
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        e.stopImmediatePropagation()
        handleCyclePanel(e.shiftKey)
        return
      }

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
  }, [handleToggleByKey, handleCyclePanel])

  // Get toolbar panels info with visibility status
  const toolbarPanelInfo = useMemo(() => {
    return toolbarPanels
      .map(id => {
        const panel = registry.get(id)
        if (!panel) return null
        return {
          ...panel,
          shortcutKey: getShortcutKey(id),
          isVisible: isPanelVisible(id),
        }
      })
      .filter((p): p is PanelDefinition & { shortcutKey: string | null; isVisible: boolean } => p !== null)
  }, [registry, toolbarPanels, getShortcutKey, isPanelVisible])

  // Divider component - wide hit area, visible line
  const Divider = ({ type, direction }: { type: DividerType; direction: 'horizontal' | 'vertical' }) => (
    <div
      onMouseDown={handleMouseDown(type)}
      className={`flex-shrink-0 group relative ${
        direction === 'vertical'
          ? 'w-px cursor-col-resize'
          : 'h-px cursor-row-resize'
      }`}
    >
      {/* Invisible wide hit area */}
      <div className={`absolute z-10 ${
        direction === 'vertical'
          ? 'w-4 h-full -left-2 top-0'
          : 'h-4 w-full -top-2 left-0'
      }`} />
      {/* Visible line - brighter on hover/drag */}
      <div className={`absolute transition-colors ${
        draggingDivider === type ? 'bg-accent' : 'bg-[#4a4a4a] group-hover:bg-accent/70'
      } ${direction === 'vertical' ? 'w-px h-full left-0 top-0' : 'h-px w-full top-0 left-0'}`} />
    </div>
  )

  // Render a toolbar button for a panel
  const renderToolbarButton = (panel: PanelDefinition & { shortcutKey: string | null; isVisible: boolean }) => {
    const isSettings = panel.id === PANEL_IDS.SETTINGS

    return (
      <button
        key={panel.id}
        onClick={() => handleToggle(panel.id)}
        className={`${isSettings ? 'p-1.5' : 'px-3 py-1 text-xs'} rounded transition-colors ${
          panel.isVisible
            ? 'bg-accent text-white'
            : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
        }`}
        title={`${panel.name}${panel.shortcutKey ? ` (${formatShortcut(panel.shortcutKey)})` : ''}`}
      >
        {isSettings ? panel.icon : panel.name}
      </button>
    )
  }

  // Brief flash overlay shown when cycling panels with Ctrl+Tab
  const FlashOverlay = ({ panelId }: { panelId: string }) =>
    flashedPanel === panelId ? (
      <div className="absolute inset-0 bg-white/10 pointer-events-none z-10" />
    ) : null

  // Get panel content
  const sidebar = panels[PANEL_IDS.SIDEBAR]
  const explorer = panels[PANEL_IDS.EXPLORER]
  const reviewPanel = panels[PANEL_IDS.REVIEW]
  const fileViewer = panels[PANEL_IDS.FILE_VIEWER]
  const agentTerminal = panels[PANEL_IDS.AGENT_TERMINAL]
  const userTerminal = panels[PANEL_IDS.USER_TERMINAL]
  const settingsPanel = panels[PANEL_IDS.SETTINGS]

  // Determine if we should show terminals (considering all visibility states)
  const terminalsVisible = showAgentTerminal || showUserTerminal

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Title bar / toolbar - draggable region */}
      <div
        className="h-10 flex items-center justify-between px-4 bg-bg-secondary border-b border-border"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-2 pl-16"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="text-sm font-medium text-text-primary" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>{title || 'Broomer'}</span>
          {isDev && (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              DEV
            </span>
          )}
          {profileChip}
        </div>
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Render toolbar buttons from toolbarPanels */}
          {toolbarPanelInfo.map(panel => renderToolbarButton(panel))}

          <ErrorIndicator />

          {/* Panel picker overflow menu button */}
          {onOpenPanelPicker && (
            <button
              onClick={onOpenPanelPicker}
              className="p-1.5 rounded transition-colors bg-bg-tertiary text-text-secondary hover:text-text-primary"
              title="Configure panels"
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
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div ref={mainContentRef} className="flex-1 flex min-h-0">
        {/* Sidebar */}
        {showSidebar && (
          <>
            <div
              data-panel-id={PANEL_IDS.SIDEBAR}
              tabIndex={-1}
              className="relative flex-shrink-0 bg-bg-secondary overflow-y-auto outline-none"
              style={{ width: sidebarWidth }}
            >
              <FlashOverlay panelId={PANEL_IDS.SIDEBAR} />
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
                {showExplorer && explorer && (
                  <>
                    <div
                      data-panel-id={PANEL_IDS.EXPLORER}
                      tabIndex={-1}
                      className="relative flex-shrink-0 bg-bg-secondary overflow-y-auto outline-none"
                      style={{ width: layoutSizes.explorerWidth }}
                    >
                      <FlashOverlay panelId={PANEL_IDS.EXPLORER} />
                      {explorer}
                    </div>
                    <Divider type="explorer" direction="vertical" />
                  </>
                )}

                {/* Review panel */}
                {showReview && reviewPanel && (
                  <>
                    <div
                      data-panel-id={PANEL_IDS.REVIEW}
                      tabIndex={-1}
                      className="relative flex-shrink-0 bg-bg-secondary overflow-y-auto outline-none"
                      style={{ width: layoutSizes.reviewPanelWidth ?? 320 }}
                    >
                      <FlashOverlay panelId={PANEL_IDS.REVIEW} />
                      {reviewPanel}
                    </div>
                    <Divider type="review" direction="vertical" />
                  </>
                )}

                {/* Center: file viewer + terminals or settings */}
                <div ref={containerRef} className={`flex-1 min-w-0 flex ${
                  showSettings && settingsPanel ? 'flex-col' :
                  fileViewerPosition === 'left' && showFileViewer && fileViewer ? 'flex-row' : 'flex-col'
                }`}>
                  {showSettings && settingsPanel ? (
                    <div data-panel-id={PANEL_IDS.SETTINGS} tabIndex={-1} className="flex-1 min-w-0 bg-bg-secondary overflow-y-auto outline-none">
                      {settingsPanel}
                    </div>
                  ) : (
                    <>
                      {/* File viewer */}
                      {showFileViewer && fileViewer && (
                        <div
                          data-panel-id={PANEL_IDS.FILE_VIEWER}
                          tabIndex={-1}
                          className="relative flex-shrink-0 bg-bg-secondary min-h-0 outline-none"
                          style={fileViewerPosition === 'left'
                            ? { width: terminalsVisible ? layoutSizes.fileViewerSize : undefined, flex: terminalsVisible ? undefined : 1 }
                            : { height: terminalsVisible ? layoutSizes.fileViewerSize : undefined, flex: terminalsVisible ? undefined : 1 }
                          }
                        >
                          <FlashOverlay panelId={PANEL_IDS.FILE_VIEWER} />
                          {fileViewer}
                        </div>
                      )}

                      {/* Draggable divider between file viewer and terminals */}
                      {showFileViewer && fileViewer && terminalsVisible && (
                        <Divider type="fileViewer" direction={fileViewerPosition === 'left' ? 'vertical' : 'horizontal'} />
                      )}

                      {/* Terminals container - stable DOM position regardless of file viewer position */}
                      <div className={`flex flex-col min-w-0 min-h-0 ${terminalsVisible ? 'flex-1' : 'hidden'}`}>
                        {/* Agent terminal */}
                        <div
                          data-panel-id={PANEL_IDS.AGENT_TERMINAL}
                          tabIndex={-1}
                          className={`relative min-w-0 min-h-0 bg-bg-primary outline-none ${showAgentTerminal ? 'flex-1' : 'hidden'}`}
                        >
                          <FlashOverlay panelId={PANEL_IDS.AGENT_TERMINAL} />
                          {agentTerminal}
                        </div>

                        {/* User terminal divider */}
                        {showAgentTerminal && showUserTerminal && (
                          <Divider type="userTerminal" direction="horizontal" />
                        )}

                        {/* User terminal */}
                        <div
                          data-panel-id={PANEL_IDS.USER_TERMINAL}
                          tabIndex={-1}
                          className={`relative bg-bg-primary outline-none ${showAgentTerminal ? 'flex-shrink-0' : 'flex-1'} ${!showUserTerminal ? 'hidden' : ''}`}
                          style={showAgentTerminal && showUserTerminal ? { height: layoutSizes.userTerminalHeight } : undefined}
                        >
                          <FlashOverlay panelId={PANEL_IDS.USER_TERMINAL} />
                          {userTerminal}
                        </div>
                      </div>

                      {/* Show placeholder if nothing visible */}
                      {!terminalsVisible && !showFileViewer && (
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
