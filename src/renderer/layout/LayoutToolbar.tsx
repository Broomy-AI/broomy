/**
 * Top toolbar with panel toggle buttons, error indicator, and version display.
 */
import { ReactNode } from 'react'
import VersionIndicator from './VersionIndicator'
import type { PanelDefinition } from '../panels'

// Detect platform for keyboard shortcut display
const isMac = navigator.userAgent.includes('Mac')

// Keyboard shortcut helper
const formatShortcut = (key: string) => {
  const modifier = isMac ? '\u2318' : 'Ctrl+'
  return `${modifier}${key}`
}

interface ToolbarPanelInfo extends PanelDefinition {
  shortcutKey: string | null
  isVisible: boolean
}

interface LayoutToolbarProps {
  title?: string
  isDev: boolean
  platform: string
  profileChip?: ReactNode
  toolbarPanelInfo: ToolbarPanelInfo[]
  onToggle: (panelId: string) => void
  onOpenPanelPicker?: () => void
  onMenuButtonClick?: () => void
  settingsPanelId: string
}

export default function LayoutToolbar({
  title,
  isDev,
  platform,
  profileChip,
  toolbarPanelInfo,
  onToggle,
  onOpenPanelPicker,
  onMenuButtonClick,
  settingsPanelId,
}: LayoutToolbarProps) {
  const isLinuxPlatform = platform === 'linux'
  return (
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
          <span
            className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
            title={`Build: ${__BUILD_COMMIT__} (${__BUILD_TIME__})`}
          >
            DEV {__BUILD_COMMIT__}
          </span>
        )}
        {profileChip}
      </div>
      <div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag', ...(platform === 'win32' ? { paddingRight: 138 } : {}) } as React.CSSProperties}
      >
        {toolbarPanelInfo.map(panel => {
          const isIconOnly = panel.id === settingsPanelId || panel.id === 'tutorial'
          return (
            <button
              key={panel.id}
              onClick={() => onToggle(panel.id)}
              className={`${isIconOnly ? 'p-1.5' : 'px-3 py-1 text-xs'} rounded transition-colors ${
                panel.isVisible
                  ? 'bg-accent text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
              title={`${panel.name}${panel.shortcutKey ? ` (${formatShortcut(panel.shortcutKey)})` : ''}`}
            >
              {isIconOnly ? panel.icon : panel.name}
            </button>
          )
        })}

        <VersionIndicator />

        {onMenuButtonClick && (
          <button
            onClick={onMenuButtonClick}
            className="p-1.5 rounded transition-colors bg-bg-tertiary text-text-secondary hover:text-text-primary"
            title="Menu"
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
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
        )}

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

        {isLinuxPlatform && (
          <div className="flex items-center ml-1 gap-0.5" data-testid="linux-window-controls">
            <button
              onClick={() => window.windowControls.minimize()}
              className="p-1.5 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
              title="Minimize"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="2" y1="6" x2="10" y2="6" />
              </svg>
            </button>
            <button
              onClick={() => window.windowControls.maximize()}
              className="p-1.5 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
              title="Maximize"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="8" height="8" rx="1" />
              </svg>
            </button>
            <button
              onClick={() => window.windowControls.close()}
              className="p-1.5 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-red-500/20"
              title="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="2" y1="2" x2="10" y2="10" />
                <line x1="10" y1="2" x2="2" y2="10" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
