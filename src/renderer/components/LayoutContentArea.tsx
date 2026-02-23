import { ReactNode, RefObject } from 'react'
import type { LayoutSizes, FileViewerPosition } from '../store/sessions'
import { PANEL_IDS } from '../panels'
import type { DividerType } from '../hooks/useDividerResize'
import PanelErrorBoundary from './PanelErrorBoundary'

interface DividerProps {
  type: NonNullable<DividerType>
  direction: 'horizontal' | 'vertical'
  draggingDivider: DividerType
  handleMouseDown: (type: DividerType) => (e: React.MouseEvent) => void
}

// Divider component - wide hit area, visible line
function Divider({ type, direction, draggingDivider, handleMouseDown }: DividerProps) {
  return (
    <div
      onMouseDown={handleMouseDown(type)}
      className={`flex-shrink-0 group relative ${
        direction === 'vertical'
          ? 'w-px cursor-col-resize'
          : 'h-px cursor-row-resize'
      }`}
    >
      <div className={`absolute z-10 ${
        direction === 'vertical'
          ? 'w-4 h-full -left-2 top-0'
          : 'h-4 w-full -top-2 left-0'
      }`} />
      <div className={`absolute transition-colors ${
        draggingDivider === type ? 'bg-accent' : 'bg-[#4a4a4a] group-hover:bg-accent/70'
      } ${direction === 'vertical' ? 'w-px h-full left-0 top-0' : 'h-px w-full top-0 left-0'}`} />
    </div>
  )
}

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
  fileViewerPosition: FileViewerPosition
  layoutSizes: LayoutSizes
  errorMessage?: string | null
  settingsPanel: ReactNode
  fileViewer: ReactNode
  terminal: ReactNode
  flashedPanel: string | null
  draggingDivider: DividerType
  handleMouseDown: (type: DividerType) => (e: React.MouseEvent) => void
}

export default function LayoutContentArea({
  containerRef,
  showSettings,
  showFileViewer,
  fileViewerPosition,
  layoutSizes,
  errorMessage,
  settingsPanel,
  fileViewer,
  terminal,
  flashedPanel,
  draggingDivider,
  handleMouseDown,
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
        {/* File viewer */}
        {showFileViewer && fileViewer && (
          <div
            data-panel-id={PANEL_IDS.FILE_VIEWER}
            tabIndex={-1}
            className="relative flex-shrink-0 bg-bg-secondary min-h-0 outline-none"
            style={getFileViewerStyle(fileViewerPosition, layoutSizes.fileViewerSize)}
          >
            <FlashOverlay panelId={PANEL_IDS.FILE_VIEWER} flashedPanel={flashedPanel} />
            <PanelErrorBoundary name="File Viewer">
              {fileViewer}
            </PanelErrorBoundary>
          </div>
        )}

        {/* Draggable divider between file viewer and terminal */}
        {showFileViewer && fileViewer && (
          <Divider type="fileViewer" direction={fileViewerPosition === 'left' ? 'vertical' : 'horizontal'} draggingDivider={draggingDivider} handleMouseDown={handleMouseDown} />
        )}

        {/* Combined terminal area — always visible */}
        <div
          data-panel-id="terminal"
          tabIndex={-1}
          className="relative flex-1 min-w-0 min-h-0 bg-bg-primary outline-none"
        >
          <PanelErrorBoundary name="Terminal">
            {terminal}
          </PanelErrorBoundary>
        </div>
      </div>
    </div>
  )
}
