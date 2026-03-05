/**
 * Main application layout with a toolbar, sidebar, and drag-to-resize panel regions.
 *
 * Renders a title bar with configurable toolbar buttons (mapped from the panel registry),
 * then a horizontal arrangement of sidebar, explorer, and a center area that
 * stacks the file viewer and terminals. Each boundary between panels is a draggable divider
 * that updates persisted layout sizes via mouse events. Keyboard shortcuts (Cmd+1-6) toggle
 * panels, and Ctrl+Tab cycles focus between visible panels.
 */
import { ReactNode, useEffect, useState, useCallback, useMemo } from 'react'
import type { LayoutSizes, FileViewerPosition } from '../store/sessions'
import { usePanelContext, PANEL_IDS } from '../panels'
import type { PanelDefinition } from '../panels'
import { useDividerResize } from '../hooks/useDividerResize'
import { useLayoutClamp } from '../hooks/useLayoutClamp'
import { useLayoutKeyboard } from '../hooks/useLayoutKeyboard'
import LayoutToolbar from './LayoutToolbar'
import LayoutContentArea from './LayoutContentArea'
import PanelErrorBoundary from './PanelErrorBoundary'
import { Divider } from './Divider'

function FlashOverlay({ panelId, flashedPanel }: { panelId: string; flashedPanel: string | null }) {
  return flashedPanel === panelId ? (
    <div className="absolute inset-0 bg-white/10 pointer-events-none z-10" />
  ) : null
}

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
  topBanner?: ReactNode
  title?: string
  profileChip?: ReactNode
  // Callbacks
  onSidebarWidthChange: (width: number) => void
  onLayoutSizeChange: (key: keyof LayoutSizes, value: number) => void
  onTogglePanel: (panelId: string) => void
  onToggleGlobalPanel: (panelId: string) => void
  onOpenPanelPicker?: () => void
  onMenuButtonClick?: () => void
  onSearchFiles?: () => void
  onNewSession?: () => void
  onNextSession?: () => void
  onPrevSession?: () => void
  onFocusSessionList?: () => void
  onFocusSessionSearch?: () => void
  onArchiveSession?: () => void
  onToggleSettings?: () => void
  onShowShortcuts?: () => void
  onNextTerminalTab?: () => void
  onPrevTerminalTab?: () => void
  onExplorerTab?: (filter: string) => void
  platform?: string
}

export default function Layout({
  panels,
  panelVisibility,
  globalPanelVisibility,
  fileViewerPosition,
  sidebarWidth,
  layoutSizes,
  errorMessage,
  topBanner,
  title,
  profileChip,
  onSidebarWidthChange,
  onLayoutSizeChange,
  onTogglePanel,
  onToggleGlobalPanel,
  onOpenPanelPicker,
  onMenuButtonClick,
  onSearchFiles,
  onNewSession,
  onNextSession,
  onPrevSession,
  onFocusSessionList,
  onFocusSessionSearch,
  onArchiveSession,
  onToggleSettings,
  onShowShortcuts,
  onNextTerminalTab, onPrevTerminalTab,
  onExplorerTab, platform = 'darwin',
}: LayoutProps) {
  const [isDev, setIsDev] = useState(false)
  const { registry, toolbarPanels, getShortcutKey } = usePanelContext()
  useEffect(() => { void window.app.isDev().then(setIsDev) }, [])

  const isPanelVisible = useCallback((panelId: string): boolean => {
    const panel = registry.get(panelId)
    if (!panel) return false
    const vis = panel.isGlobal ? globalPanelVisibility : panelVisibility
    return vis[panelId] ?? panel.defaultVisible
  }, [registry, panelVisibility, globalPanelVisibility])
  const showSidebar = isPanelVisible(PANEL_IDS.SIDEBAR)
  const showExplorer = isPanelVisible(PANEL_IDS.EXPLORER)
  const showFileViewer = isPanelVisible(PANEL_IDS.FILE_VIEWER)
  const showAgent = isPanelVisible(PANEL_IDS.AGENT)
  const showSettings = isPanelVisible(PANEL_IDS.SETTINGS)
  const showTutorial = isPanelVisible(PANEL_IDS.TUTORIAL)
  const handleToggle = useCallback((panelId: string) => {
    const panel = registry.get(panelId)
    if (!panel) return
    ;(panel.isGlobal ? onToggleGlobalPanel : onTogglePanel)(panelId)
  }, [registry, onTogglePanel, onToggleGlobalPanel])
  const { draggingDivider, containerRef, mainContentRef, handleMouseDown } = useDividerResize({
    fileViewerPosition,
    sidebarWidth,
    showSidebar,
    showExplorer,
    showTutorial,
    explorerWidth: layoutSizes.explorerWidth,
    tutorialWidth: layoutSizes.tutorialPanelWidth,
    onSidebarWidthChange,
    onLayoutSizeChange,
  })

  useLayoutClamp({
    mainContentRef,
    showSidebar,
    showExplorer,
    showTutorial,
    sidebarWidth,
    layoutSizes,
    onSidebarWidthChange,
    onLayoutSizeChange,
  })

  const { flashedPanel } = useLayoutKeyboard({
    toolbarPanels,
    isPanelVisible,
    panels,
    handleToggle,
    onSearchFiles,
    onNewSession,
    onNextSession,
    onPrevSession,
    onFocusSessionList,
    onFocusSessionSearch,
    onArchiveSession,
    onToggleSettings,
    onShowShortcuts,
    onNextTerminalTab,
    onPrevTerminalTab,
    onExplorerTab,
  })
  const toolbarPanelInfo = useMemo(() => toolbarPanels
    .map(id => {
      const panel = registry.get(id)
      if (!panel) return null
      return { ...panel, shortcutKey: getShortcutKey(id), isVisible: isPanelVisible(id) }
    })
    .filter((p): p is PanelDefinition & { shortcutKey: string | null; isVisible: boolean } => p !== null),
  [registry, toolbarPanels, getShortcutKey, isPanelVisible])

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Title bar / toolbar */}
      <LayoutToolbar
        title={title}
        isDev={isDev}
        platform={platform}
        profileChip={profileChip}
        toolbarPanelInfo={toolbarPanelInfo}
        onToggle={handleToggle}
        onOpenPanelPicker={onOpenPanelPicker}
        onMenuButtonClick={onMenuButtonClick}
        settingsPanelId={PANEL_IDS.SETTINGS}
      />

      {topBanner}

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
              <FlashOverlay flashedPanel={flashedPanel} panelId={PANEL_IDS.SIDEBAR} />
              <PanelErrorBoundary name="Sidebar">
                {panels[PANEL_IDS.SIDEBAR]}
              </PanelErrorBoundary>
            </div>
            <Divider type="sidebar" direction="vertical" draggingDivider={draggingDivider} onMouseDown={handleMouseDown} />
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
                  <FlashOverlay flashedPanel={flashedPanel} panelId={PANEL_IDS.EXPLORER} />
                  <PanelErrorBoundary name="Explorer">
                    {panels[PANEL_IDS.EXPLORER]}
                  </PanelErrorBoundary>
                </div>
                <Divider type="explorer" direction="vertical" draggingDivider={draggingDivider} onMouseDown={handleMouseDown} />
              </>
            )}

            {/* Center content area */}
            <LayoutContentArea
              containerRef={containerRef}
              showSettings={showSettings}
              showFileViewer={showFileViewer}
              showAgent={showAgent}
              fileViewerPosition={fileViewerPosition}
              layoutSizes={layoutSizes}
              errorMessage={errorMessage}
              settingsPanel={panels[PANEL_IDS.SETTINGS]}
              fileViewer={panels[PANEL_IDS.FILE_VIEWER]}
              terminal={panels.terminal}
              flashedPanel={flashedPanel}
              draggingDivider={draggingDivider}
              onMouseDown={handleMouseDown}
            />

            {/* Tutorial panel (right side) - hidden when error */}
            {!errorMessage && showTutorial && panels[PANEL_IDS.TUTORIAL] && (
              <>
                <Divider type="tutorial" direction="vertical" draggingDivider={draggingDivider} onMouseDown={handleMouseDown} />
                <div
                  data-panel-id={PANEL_IDS.TUTORIAL}
                  tabIndex={-1}
                  className="relative flex-shrink-0 bg-bg-secondary overflow-y-auto outline-none"
                  style={{ width: layoutSizes.tutorialPanelWidth }}
                >
                  <FlashOverlay flashedPanel={flashedPanel} panelId={PANEL_IDS.TUTORIAL} />
                  <PanelErrorBoundary name="Tutorial">
                    {panels[PANEL_IDS.TUTORIAL]}
                  </PanelErrorBoundary>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
