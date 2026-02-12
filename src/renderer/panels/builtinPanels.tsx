/**
 * Built-in panel definitions for all seven standard Broomy panels.
 *
 * Each panel is defined with its ID, display name, inline SVG icon, layout
 * position(s), default visibility, toolbar inclusion, and resize constraints.
 * The BUILTIN_PANELS array is registered into the global panel registry at
 * application startup. Icon components are also exported for reuse elsewhere.
 */
import { PanelDefinition, PANEL_IDS } from './types'

// Icon components
const SessionsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
)

const FolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
)

const FileIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
)

const ReviewIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M9 15l2 2 4-4" />
  </svg>
)

const TerminalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
)

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const BUILTIN_PANELS: PanelDefinition[] = [
  {
    id: PANEL_IDS.SIDEBAR,
    name: 'Sessions',
    icon: <SessionsIcon />,
    position: 'sidebar',
    defaultVisible: true,
    defaultInToolbar: true,
    isGlobal: true,
  },
  {
    id: PANEL_IDS.EXPLORER,
    name: 'Explorer',
    icon: <FolderIcon />,
    position: 'left',
    defaultVisible: false,
    defaultInToolbar: true,
    resizable: true,
    minSize: 150,
    maxSize: 500,
  },
  {
    id: PANEL_IDS.FILE_VIEWER,
    name: 'File',
    icon: <FileIcon />,
    position: ['center-top', 'center-left'],
    defaultVisible: false,
    defaultInToolbar: true,
    resizable: true,
  },
  {
    id: PANEL_IDS.REVIEW,
    name: 'Review',
    icon: <ReviewIcon />,
    position: 'center-left',
    defaultVisible: false,
    defaultInToolbar: true,
    resizable: true,
    minSize: 250,
    maxSize: 600,
  },
  {
    id: PANEL_IDS.AGENT_TERMINAL,
    name: 'Agent',
    icon: <TerminalIcon />,
    position: 'center-main',
    defaultVisible: true,
    defaultInToolbar: true,
  },
  {
    id: PANEL_IDS.USER_TERMINAL,
    name: 'Terminal',
    icon: <TerminalIcon />,
    position: 'center-bottom',
    defaultVisible: false,
    defaultInToolbar: true,
    resizable: true,
    minSize: 100,
    maxSize: 500,
  },
  {
    id: PANEL_IDS.SETTINGS,
    name: 'Settings',
    icon: <SettingsIcon />,
    position: 'overlay',
    defaultVisible: false,
    defaultInToolbar: true,
    isGlobal: true,
  },
]

// Export icon components for reuse
export const PanelIcons = {
  sessions: SessionsIcon,
  folder: FolderIcon,
  file: FileIcon,
  review: ReviewIcon,
  terminal: TerminalIcon,
  settings: SettingsIcon,
}
