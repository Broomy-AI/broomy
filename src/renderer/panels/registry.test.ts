import { describe, it, expect, beforeEach } from 'vitest'
import { PanelRegistry } from './registry'
import type { PanelDefinition, PanelPosition } from './types'

function makePanel(overrides: Partial<PanelDefinition> & { id: string }): PanelDefinition {
  return {
    name: overrides.id,
    icon: null,
    position: 'center-main' as PanelPosition,
    defaultVisible: false,
    defaultInToolbar: false,
    ...overrides,
  }
}

describe('PanelRegistry', () => {
  let registry: PanelRegistry

  beforeEach(() => {
    registry = new PanelRegistry()
  })

  it('starts empty', () => {
    expect(registry.size()).toBe(0)
    expect(registry.getAll()).toEqual([])
  })

  it('registers a panel', () => {
    const panel = makePanel({ id: 'test' })
    registry.register(panel)
    expect(registry.size()).toBe(1)
    expect(registry.get('test')).toBe(panel)
  })

  it('registerAll registers multiple panels', () => {
    const panels = [makePanel({ id: 'a' }), makePanel({ id: 'b' })]
    registry.registerAll(panels)
    expect(registry.size()).toBe(2)
  })

  it('get returns undefined for missing panel', () => {
    expect(registry.get('missing')).toBeUndefined()
  })

  it('getAll returns all panels', () => {
    registry.register(makePanel({ id: 'a' }))
    registry.register(makePanel({ id: 'b' }))
    expect(registry.getAll()).toHaveLength(2)
  })

  it('getByPosition filters by single position', () => {
    registry.register(makePanel({ id: 'left1', position: 'left' }))
    registry.register(makePanel({ id: 'center1', position: 'center-main' }))
    const leftPanels = registry.getByPosition('left')
    expect(leftPanels).toHaveLength(1)
    expect(leftPanels[0].id).toBe('left1')
  })

  it('getByPosition matches panels with array positions', () => {
    registry.register(makePanel({ id: 'multi', position: ['left', 'center-top'] }))
    expect(registry.getByPosition('left')).toHaveLength(1)
    expect(registry.getByPosition('center-top')).toHaveLength(1)
    expect(registry.getByPosition('center-main')).toHaveLength(0)
  })

  it('getDefaultVisible returns panels with defaultVisible true', () => {
    registry.register(makePanel({ id: 'visible', defaultVisible: true }))
    registry.register(makePanel({ id: 'hidden', defaultVisible: false }))
    expect(registry.getDefaultVisible()).toEqual(['visible'])
  })

  it('getDefaultToolbarPanels returns panels with defaultInToolbar true', () => {
    registry.register(makePanel({ id: 'toolbar', defaultInToolbar: true }))
    registry.register(makePanel({ id: 'noToolbar', defaultInToolbar: false }))
    expect(registry.getDefaultToolbarPanels()).toEqual(['toolbar'])
  })

  it('has returns true for registered panels', () => {
    registry.register(makePanel({ id: 'exists' }))
    expect(registry.has('exists')).toBe(true)
    expect(registry.has('nope')).toBe(false)
  })

  it('overwrites panel with same id', () => {
    registry.register(makePanel({ id: 'dup', name: 'first' }))
    registry.register(makePanel({ id: 'dup', name: 'second' }))
    expect(registry.size()).toBe(1)
    expect(registry.get('dup')!.name).toBe('second')
  })
})
