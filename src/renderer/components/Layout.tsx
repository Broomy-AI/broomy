/**
 * Main application layout with a toolbar, sidebar, and drag-to-resize panel regions.
 *
 * Renders a title bar with configurable toolbar buttons (mapped from the panel registry),
 * then a horizontal arrangement of sidebar, explorer, review panel, and a center area that
 * stacks the file viewer and terminals. Each boundary between panels is a draggable divider
 * that updates persisted layout sizes via mouse events. Keyboard shortcuts (Cmd+1-6) toggle
 * panels, and Ctrl+Tab cycles focus between visible panels.
 */
import { ReactNode, useEffect, useState, useCallback, useMemo } from 'react'
import type { LayoutSizes, FileViewerPosition } from '../store/sessions'
import { usePanelContext, PANEL_IDS } from '../panels'
import type { PanelDefinition } from '../panels'
import { useDividerResize } from '../hooks/useDividerResize'
import type { DividerType } from '../hooks/useDividerResize'
import { useLayoutKeyboard } from '../hooks/useLayoutKeyboard'
import LayoutToolbar from './LayoutToolbar'
import LayoutContentArea from './LayoutContentArea'

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
    void window.app.isDev().then(setIsDev)
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

  // Brief flash overlay shown when cycling panels with Ctrl+Tab
  const FlashOverlay = ({ panelId }: { panelId: string }) =>
    flashedPanel === panelId ? (
      <div className="absolute inset-0 bg-white/10 pointer-events-none z-10" />
    ) : null

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Title bar / toolbar */}
      <LayoutToolbar
        title={title}
        isDev={isDev}
        profileChip={profileChip}
        toolbarPanelInfo={toolbarPanelInfo}
        onToggle={handleToggle}
        onOpenPanelPicker={onOpenPanelPicker}
        settingsPanelId={PANEL_IDS.SETTINGS}
      />

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
              {panels[PANEL_IDS.SIDEBAR]}
            </div>
            <Divider type="sidebar" direction="vertical" />
          </>
        )}

        {/* Center + Right panels */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Main row: terminals + side panels */}
          <div className="flex-1 flex min-h-0">
            {/* Error message */}
            {errorMessage && (
              <div className="flex-1 flex items-center justify-center bg-bg-primary text-text-secondary">
                <div className="text-center">
                  <p className="text-red-400">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Left side panels (Explorer) - hidden when error */}
            {!errorMessage && showExplorer && panels[PANEL_IDS.EXPLORER] && (
              <>
                <div
                  data-panel-id={PANEL_IDS.EXPLORER}
                  tabIndex={-1}
                  className="relative flex-shrink-0 bg-bg-secondary overflow-hidden outline-none"
                  style={{ width: layoutSizes.explorerWidth }}
                >
                  <FlashOverlay panelId={PANEL_IDS.EXPLORER} />
                  {panels[PANEL_IDS.EXPLORER]}
                </div>
                <Divider type="explorer" direction="vertical" />
              </>
            )}

            {/* Review panel - hidden when error */}
            {!errorMessage && showReview && panels[PANEL_IDS.REVIEW] && (
              <>
                <div
                  data-panel-id={PANEL_IDS.REVIEW}
                  tabIndex={-1}
                  className="relative flex-shrink-0 bg-bg-secondary overflow-y-auto outline-none"
                  style={{ width: layoutSizes.reviewPanelWidth }}
                >
                  <FlashOverlay panelId={PANEL_IDS.REVIEW} />
                  {panels[PANEL_IDS.REVIEW]}
                </div>
                <Divider type="review" direction="vertical" />
              </>
            )}

            {/* Center content area */}
            <LayoutContentArea
              containerRef={containerRef}
              showSettings={showSettings}
              showFileViewer={showFileViewer}
              showAgentTerminal={showAgentTerminal}
              showUserTerminal={showUserTerminal}
              fileViewerPosition={fileViewerPosition}
              layoutSizes={layoutSizes}
              errorMessage={errorMessage}
              settingsPanel={panels[PANEL_IDS.SETTINGS]}
              fileViewer={panels[PANEL_IDS.FILE_VIEWER]}
              agentTerminal={panels[PANEL_IDS.AGENT_TERMINAL]}
              userTerminal={panels[PANEL_IDS.USER_TERMINAL]}
              flashedPanel={flashedPanel}
              draggingDivider={draggingDivider}
              handleMouseDown={handleMouseDown}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
