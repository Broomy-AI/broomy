import { ReactNode, useEffect, useState, useCallback, useMemo } from 'react'
import ErrorIndicator from './ErrorIndicator'
import type { LayoutSizes, FileViewerPosition } from '../store/sessions'
import { usePanelContext, PANEL_IDS } from '../panels'
import type { PanelDefinition } from '../panels'
import { useDividerResize } from '../hooks/useDividerResize'
import type { DividerType } from '../hooks/useDividerResize'
import { useLayoutKeyboard } from '../hooks/useLayoutKeyboard'

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
  const [isDev, setIsDev] = useState(false)
  const { registry, toolbarPanels, getShortcutKey } = usePanelContext()

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

  // Drag-to-resize logic
  const { draggingDivider, containerRef, mainContentRef, handleMouseDown } = useDividerResize({
    fileViewerPosition,
    sidebarWidth,
    showSidebar,
    showExplorer,
    layoutSizes,
    onSidebarWidthChange,
    onLayoutSizeChange,
  })

  // Keyboard shortcuts (Cmd+1-6, Ctrl+Tab cycling, focus management)
  const { flashedPanel } = useLayoutKeyboard({
    toolbarPanels,
    isPanelVisible,
    panels,
    handleToggle,
  })

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
          className={`flex items-center gap-2 ${isMac ? 'pl-16' : 'pl-2'}`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="text-sm font-medium text-text-primary" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>{title || 'Broomy'}</span>
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
            {/* Error message - shown as sibling, not ternary, to avoid unmounting terminals */}
            {errorMessage && (
              <div className="flex-1 flex items-center justify-center bg-bg-primary text-text-secondary">
                <div className="text-center">
                  <p className="text-red-400">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Left side panels (Explorer) - hidden when error */}
            {!errorMessage && showExplorer && explorer && (
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

            {/* Review panel - hidden when error */}
            {!errorMessage && showReview && reviewPanel && (
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

            {/* Center: file viewer + terminals + settings
                Always rendered (hidden when error) to keep terminals mounted */}
            <div ref={containerRef} className={`flex-1 min-w-0 flex flex-col ${errorMessage ? 'hidden' : ''}`}>
              {/* Settings panel - uses hidden/visible instead of ternary to avoid unmounting terminals */}
              <div
                data-panel-id={PANEL_IDS.SETTINGS}
                tabIndex={-1}
                className={`min-w-0 bg-bg-secondary overflow-y-auto outline-none ${showSettings && settingsPanel ? 'flex-1' : 'hidden'}`}
              >
                {settingsPanel}
              </div>

              {/* Regular content - hidden when settings active, never unmounted */}
              <div className={`flex-1 min-w-0 min-h-0 flex ${
                showSettings && settingsPanel ? 'hidden' :
                fileViewerPosition === 'left' && showFileViewer && fileViewer ? 'flex-row' : 'flex-col'
              }`}>
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
