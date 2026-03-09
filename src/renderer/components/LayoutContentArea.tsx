/**
 * Main content area layout that arranges panels, dividers, and the terminal region.
 */
import { ReactNode, RefObject } from 'react'
import type { LayoutSizes, FileViewerPosition } from '../store/sessions'
import { PANEL_IDS } from '../panels'
import type { DividerType } from '../hooks/useDividerResize'
import PanelErrorBoundary from './PanelErrorBoundary'
import { Divider } from './Divider'

function FlashOverlay({ panelId, flashedPanel }: { panelId: string; flashedPanel: string | null }) {
  return flashedPanel === panelId ? (
    <div className="absolute inset-0 bg-white/10 pointer-events-none z-10" />
  ) : null
}

function getContentFlexDirection(showSettings: boolean, settingsPanel: ReactNode, fileViewerPosition: FileViewerPosition, showFileViewer: boolean, fileViewer: ReactNode): string {
  if (showSettings && settingsPanel) return 'hidden'
  if (fileViewerPosition === 'left' && showFileViewer && fileViewer) return 'flex-row'
  return 'flex-col'
}

function getFileViewerStyle(fileViewerPosition: FileViewerPosition, fileViewerSize: number): React.CSSProperties {
  if (fileViewerPosition === 'left') {
    return { width: fileViewerSize }
  }
  return { height: fileViewerSize }
}

interface LayoutContentAreaProps {
  containerRef: RefObject<HTMLDivElement>
  showSettings: boolean
  showFileViewer: boolean
  showAgent: boolean
  fileViewerPosition: FileViewerPosition
  layoutSizes: LayoutSizes
  errorMessage?: string | null
  settingsPanel: ReactNode
  fileViewer: ReactNode
  terminal: ReactNode
  flashedPanel: string | null
  draggingDivider: DividerType
  onMouseDown: (type: DividerType) => (e: React.MouseEvent) => void
}

export default function LayoutContentArea({
  containerRef,
  showSettings,
  showFileViewer,
  showAgent,
  fileViewerPosition,
  layoutSizes,
  errorMessage,
  settingsPanel,
  fileViewer,
  terminal,
  flashedPanel,
  draggingDivider,
  onMouseDown,
}: LayoutContentAreaProps) {
  const flexDirection = getContentFlexDirection(showSettings, settingsPanel, fileViewerPosition, showFileViewer, fileViewer)

  return (
    <div ref={containerRef} className={`flex-1 min-w-0 flex flex-col ${errorMessage ? 'hidden' : ''}`}>
      {/* Settings panel - uses hidden/visible instead of ternary to avoid unmounting terminals */}
      <div
        data-panel-id={PANEL_IDS.SETTINGS}
        tabIndex={-1}
        className={`min-w-0 bg-bg-secondary overflow-y-auto outline-none ${showSettings && settingsPanel ? 'flex-1' : 'hidden'}`}
      >
        <PanelErrorBoundary name="Settings">
          {settingsPanel}
        </PanelErrorBoundary>
      </div>

      {/* Regular content - hidden when settings active, never unmounted */}
      <div className={`flex-1 min-w-0 min-h-0 flex ${flexDirection}`}>
        {/* File viewer - uses hidden/visible instead of ternary to preserve per-session state */}
        <div
          data-panel-id={PANEL_IDS.FILE_VIEWER}
          tabIndex={-1}
          className={`relative bg-bg-secondary min-h-0 outline-none ${showFileViewer && fileViewer ? '' : 'hidden'} ${showAgent ? 'flex-shrink-0' : 'flex-1'} ${draggingDivider ? 'pointer-events-none' : ''}`}
          style={showFileViewer && fileViewer && showAgent ? getFileViewerStyle(fileViewerPosition, layoutSizes.fileViewerSize) : undefined}
        >
          <FlashOverlay panelId={PANEL_IDS.FILE_VIEWER} flashedPanel={flashedPanel} />
          <PanelErrorBoundary name="File Viewer">
            {fileViewer}
          </PanelErrorBoundary>
        </div>

        {/* Draggable divider between file viewer and terminal */}
        <div className={showFileViewer && fileViewer && showAgent ? 'flex relative z-10' : 'hidden'}>
          <Divider type="fileViewer" direction={fileViewerPosition === 'left' ? 'vertical' : 'horizontal'} draggingDivider={draggingDivider} onMouseDown={onMouseDown} />
        </div>

        {/* Combined terminal area — hidden when agent panel toggled off */}
        <div
          data-panel-id="terminal"
          tabIndex={-1}
          className={`relative flex-1 min-w-0 min-h-0 bg-bg-primary outline-none ${showAgent ? '' : 'hidden'}`}
        >
          <PanelErrorBoundary name="Terminal">
            {terminal}
          </PanelErrorBoundary>
        </div>
      </div>
    </div>
  )
}
