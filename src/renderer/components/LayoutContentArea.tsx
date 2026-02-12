import { ReactNode, RefObject } from 'react'
import type { LayoutSizes, FileViewerPosition } from '../store/sessions'
import { PANEL_IDS } from '../panels'
import type { DividerType } from '../hooks/useDividerResize'

// Detect if we're on Mac for keyboard shortcut display
const isMac = navigator.userAgent.includes('Mac')

const formatShortcut = (key: string) => {
  const modifier = isMac ? '\u2318' : 'Ctrl+'
  return `${modifier}${key}`
}

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

function getFileViewerStyle(fileViewerPosition: FileViewerPosition, terminalsVisible: boolean, fileViewerSize: number): React.CSSProperties {
  if (fileViewerPosition === 'left') {
    return { width: terminalsVisible ? fileViewerSize : undefined, flex: terminalsVisible ? undefined : 1 }
  }
  return { height: terminalsVisible ? fileViewerSize : undefined, flex: terminalsVisible ? undefined : 1 }
}

interface TerminalsPanelProps {
  showAgentTerminal: boolean
  showUserTerminal: boolean
  agentTerminal: ReactNode
  userTerminal: ReactNode
  flashedPanel: string | null
  draggingDivider: DividerType
  handleMouseDown: (type: DividerType) => (e: React.MouseEvent) => void
  userTerminalHeight: number
}

function TerminalsPanel({
  showAgentTerminal,
  showUserTerminal,
  agentTerminal,
  userTerminal,
  flashedPanel,
  draggingDivider,
  handleMouseDown,
  userTerminalHeight,
}: TerminalsPanelProps) {
  const terminalsVisible = showAgentTerminal || showUserTerminal
  return (
    <div className={`flex flex-col min-w-0 min-h-0 ${terminalsVisible ? 'flex-1' : 'hidden'}`}>
      <div
        data-panel-id={PANEL_IDS.AGENT_TERMINAL}
        tabIndex={-1}
        className={`relative min-w-0 min-h-0 bg-bg-primary outline-none ${showAgentTerminal ? 'flex-1' : 'hidden'}`}
      >
        <FlashOverlay panelId={PANEL_IDS.AGENT_TERMINAL} flashedPanel={flashedPanel} />
        {agentTerminal}
      </div>

      {showAgentTerminal && showUserTerminal && (
        <Divider type="userTerminal" direction="horizontal" draggingDivider={draggingDivider} handleMouseDown={handleMouseDown} />
      )}

      <div
        data-panel-id={PANEL_IDS.USER_TERMINAL}
        tabIndex={-1}
        className={`relative bg-bg-primary outline-none ${showAgentTerminal ? 'flex-shrink-0' : 'flex-1'} ${!showUserTerminal ? 'hidden' : ''}`}
        style={showAgentTerminal && showUserTerminal ? { height: userTerminalHeight } : undefined}
      >
        <FlashOverlay panelId={PANEL_IDS.USER_TERMINAL} flashedPanel={flashedPanel} />
        {userTerminal}
      </div>
    </div>
  )
}

interface LayoutContentAreaProps {
  containerRef: RefObject<HTMLDivElement>
  showSettings: boolean
  showFileViewer: boolean
  showAgentTerminal: boolean
  showUserTerminal: boolean
  fileViewerPosition: FileViewerPosition
  layoutSizes: LayoutSizes
  errorMessage?: string | null
  settingsPanel: ReactNode
  fileViewer: ReactNode
  agentTerminal: ReactNode
  userTerminal: ReactNode
  flashedPanel: string | null
  draggingDivider: DividerType
  handleMouseDown: (type: DividerType) => (e: React.MouseEvent) => void
}

export default function LayoutContentArea({
  containerRef,
  showSettings,
  showFileViewer,
  showAgentTerminal,
  showUserTerminal,
  fileViewerPosition,
  layoutSizes,
  errorMessage,
  settingsPanel,
  fileViewer,
  agentTerminal,
  userTerminal,
  flashedPanel,
  draggingDivider,
  handleMouseDown,
}: LayoutContentAreaProps) {
  const terminalsVisible = showAgentTerminal || showUserTerminal
  const flexDirection = getContentFlexDirection(showSettings, settingsPanel, fileViewerPosition, showFileViewer, fileViewer)

  return (
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
      <div className={`flex-1 min-w-0 min-h-0 flex ${flexDirection}`}>
        {/* File viewer */}
        {showFileViewer && fileViewer && (
          <div
            data-panel-id={PANEL_IDS.FILE_VIEWER}
            tabIndex={-1}
            className="relative flex-shrink-0 bg-bg-secondary min-h-0 outline-none"
            style={getFileViewerStyle(fileViewerPosition, terminalsVisible, layoutSizes.fileViewerSize)}
          >
            <FlashOverlay panelId={PANEL_IDS.FILE_VIEWER} flashedPanel={flashedPanel} />
            {fileViewer}
          </div>
        )}

        {/* Draggable divider between file viewer and terminals */}
        {showFileViewer && fileViewer && terminalsVisible && (
          <Divider type="fileViewer" direction={fileViewerPosition === 'left' ? 'vertical' : 'horizontal'} draggingDivider={draggingDivider} handleMouseDown={handleMouseDown} />
        )}

        <TerminalsPanel
          showAgentTerminal={showAgentTerminal}
          showUserTerminal={showUserTerminal}
          agentTerminal={agentTerminal}
          userTerminal={userTerminal}
          flashedPanel={flashedPanel}
          draggingDivider={draggingDivider}
          handleMouseDown={handleMouseDown}
          userTerminalHeight={layoutSizes.userTerminalHeight}
        />

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
  )
}
