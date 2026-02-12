/**
 * Panel registry implementation backed by a Map.
 *
 * Provides registration and lookup for panel definitions. Panels can be queried
 * by ID, by layout position, or by default state (visible, in-toolbar). A global
 * singleton instance is exported for use across the application.
 */
import { PanelDefinition, PanelPosition } from './types'

export class PanelRegistry {
  private panels = new Map<string, PanelDefinition>()

  register(panel: PanelDefinition): void {
    this.panels.set(panel.id, panel)
  }

  registerAll(panels: PanelDefinition[]): void {
    for (const panel of panels) {
      this.register(panel)
    }
  }

  get(id: string): PanelDefinition | undefined {
    return this.panels.get(id)
  }

  getAll(): PanelDefinition[] {
    return Array.from(this.panels.values())
  }

  getByPosition(position: PanelPosition): PanelDefinition[] {
    return this.getAll().filter(panel => {
      if (Array.isArray(panel.position)) {
        return panel.position.includes(position)
      }
      return panel.position === position
    })
  }

  getDefaultVisible(): string[] {
    return this.getAll()
      .filter(panel => panel.defaultVisible)
      .map(panel => panel.id)
  }

  getDefaultToolbarPanels(): string[] {
    return this.getAll()
      .filter(panel => panel.defaultInToolbar)
      .map(panel => panel.id)
  }

  has(id: string): boolean {
    return this.panels.has(id)
  }

  size(): number {
    return this.panels.size
  }
}

// Global singleton registry
export const panelRegistry = new PanelRegistry()
