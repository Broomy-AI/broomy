/**
 * React context provider and hooks for the panel system.
 *
 * Initializes the global panel registry with built-in panels on import, then
 * exposes the registry, toolbar panel order, and keyboard shortcut mappings
 * through React context. Provides hooks for reading panel visibility (respecting
 * global vs per-session scope), creating toggle callbacks, and querying toolbar
 * panel metadata. This is the primary interface components use to interact with
 * the panel system.
 */
import { createContext, useContext, useCallback, useMemo, ReactNode } from 'react'
import { PanelDefinition, PANEL_IDS, DEFAULT_TOOLBAR_PANELS, MAX_SHORTCUT_PANELS } from './types'
import { panelRegistry } from './registry'
import { BUILTIN_PANELS } from './builtinPanels'

// Initialize registry with built-in panels
panelRegistry.registerAll(BUILTIN_PANELS)

interface PanelContextValue {
  registry: typeof panelRegistry
  toolbarPanels: string[]
  setToolbarPanels: (panels: string[]) => void
  getShortcutKey: (panelId: string) => string | null
}

const PanelContext = createContext<PanelContextValue | null>(null)

interface PanelProviderProps {
  children: ReactNode
  toolbarPanels: string[]
  onToolbarPanelsChange: (panels: string[]) => void
}

export function PanelProvider({ children, toolbarPanels, onToolbarPanelsChange }: PanelProviderProps) {
  const getShortcutKey = useCallback((panelId: string): string | null => {
    const index = toolbarPanels.indexOf(panelId)
    if (index === -1 || index >= MAX_SHORTCUT_PANELS) {
      return null
    }
    return String(index + 1)
  }, [toolbarPanels])

  const value = useMemo(() => ({
    registry: panelRegistry,
    toolbarPanels,
    setToolbarPanels: onToolbarPanelsChange,
    getShortcutKey,
  }), [toolbarPanels, onToolbarPanelsChange, getShortcutKey])

  return (
    <PanelContext.Provider value={value}>
      {children}
    </PanelContext.Provider>
  )
}

// Hook to access panel registry
export function usePanelRegistry() {
  const context = useContext(PanelContext)
  if (!context) {
    throw new Error('usePanelRegistry must be used within a PanelProvider')
  }
  return context.registry
}

// Hook to access panel context
export function usePanelContext() {
  const context = useContext(PanelContext)
  if (!context) {
    throw new Error('usePanelContext must be used within a PanelProvider')
  }
  return context
}

// Hook to get panel visibility state
export function usePanelVisibility(
  panelId: string,
  panelVisibility: Record<string, boolean>,
  globalPanelVisibility: Record<string, boolean>
): boolean {
  const registry = usePanelRegistry()
  const panel = registry.get(panelId)

  if (!panel) return false

  // Global panels use global state
  if (panel.isGlobal) {
    return globalPanelVisibility[panelId] ?? panel.defaultVisible
  }

  // Per-session panels use session state
  return panelVisibility[panelId] ?? panel.defaultVisible
}

// Hook to create toggle function for a panel
export function usePanelToggle(
  panelId: string,
  onToggle: (panelId: string) => void,
  onGlobalToggle: (panelId: string) => void
): () => void {
  const registry = usePanelRegistry()
  const panel = registry.get(panelId)

  return useCallback(() => {
    if (!panel) return
    if (panel.isGlobal) {
      onGlobalToggle(panelId)
    } else {
      onToggle(panelId)
    }
  }, [panel, panelId, onToggle, onGlobalToggle])
}

// Hook to get toolbar panel info
export function useToolbarPanels() {
  const context = usePanelContext()
  const { registry, toolbarPanels, getShortcutKey } = context

  return useMemo(() => {
    return toolbarPanels
      .map(id => {
        const panel = registry.get(id)
        if (!panel) return null
        return {
          ...panel,
          shortcutKey: getShortcutKey(id),
        }
      })
      .filter((p): p is PanelDefinition & { shortcutKey: string | null } => p !== null)
  }, [registry, toolbarPanels, getShortcutKey])
}

// Export panel IDs for convenience
export { PANEL_IDS, DEFAULT_TOOLBAR_PANELS, MAX_SHORTCUT_PANELS }
