import { ReactNode } from 'react'

// Panel position types
export type PanelPosition =
  | 'sidebar'      // Left edge, always visible area
  | 'left'         // Left of center content (explorer)
  | 'center-top'   // Above terminals (file viewer in top mode)
  | 'center-left'  // Left of terminals (file viewer in left mode)
  | 'center-main'  // Main terminal area
  | 'center-bottom'// Below main terminal
  | 'overlay'      // Replaces center content (settings)

// Panel definition
export interface PanelDefinition {
  id: string
  name: string
  icon: ReactNode
  position: PanelPosition | PanelPosition[]  // Can support multiple positions
  defaultVisible: boolean
  defaultInToolbar: boolean  // Whether it shows in toolbar by default
  resizable?: boolean
  minSize?: number
  maxSize?: number
  // For panels that need special handling
  isGlobal?: boolean  // Not per-session (like sidebar, settings)
}

// Panel IDs as constants for type safety
export const PANEL_IDS = {
  SIDEBAR: 'sidebar',
  EXPLORER: 'explorer',
  FILE_VIEWER: 'fileViewer',
  REVIEW: 'review',
  AGENT_TERMINAL: 'agentTerminal',
  USER_TERMINAL: 'userTerminal',
  SETTINGS: 'settings',
} as const

export type PanelId = typeof PANEL_IDS[keyof typeof PANEL_IDS]

// Default toolbar order
export const DEFAULT_TOOLBAR_PANELS: string[] = [
  PANEL_IDS.SIDEBAR,
  PANEL_IDS.EXPLORER,
  PANEL_IDS.FILE_VIEWER,
  PANEL_IDS.AGENT_TERMINAL,
  PANEL_IDS.USER_TERMINAL,
  PANEL_IDS.SETTINGS,
]

// Max panels that can have keyboard shortcuts
export const MAX_SHORTCUT_PANELS = 6
