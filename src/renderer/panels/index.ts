/**
 * Barrel export for the panel system.
 *
 * Re-exports all public types, constants, the registry singleton, built-in
 * panel definitions, and React context hooks from a single entry point.
 */

// Types
export type { PanelDefinition, PanelPosition, PanelId } from './types'
export { PANEL_IDS, DEFAULT_TOOLBAR_PANELS, MAX_SHORTCUT_PANELS } from './types'

// Registry
export { PanelRegistry, panelRegistry } from './registry'

// Built-in panels
export { BUILTIN_PANELS, PanelIcons } from './builtinPanels'

// Context and hooks
export {
  PanelProvider,
  usePanelRegistry,
  usePanelContext,
  usePanelVisibility,
  usePanelToggle,
  useToolbarPanels,
} from './PanelContext'
