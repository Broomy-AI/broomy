import { ReactNode } from 'react'
import ErrorIndicator from './ErrorIndicator'
import type { PanelDefinition } from '../panels'

// Detect if we're on Mac for keyboard shortcut display
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
  profileChip?: ReactNode
  toolbarPanelInfo: ToolbarPanelInfo[]
  onToggle: (panelId: string) => void
  onOpenPanelPicker?: () => void
  settingsPanelId: string
}

export default function LayoutToolbar({
  title,
  isDev,
  profileChip,
  toolbarPanelInfo,
  onToggle,
  onOpenPanelPicker,
  settingsPanelId,
}: LayoutToolbarProps) {
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
        {toolbarPanelInfo.map(panel => {
          const isSettings = panel.id === settingsPanelId
          return (
            <button
              key={panel.id}
              onClick={() => onToggle(panel.id)}
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
        })}

        <ErrorIndicator />

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
  )
}
