/**
 * The clamp derives what to RENDER. It must never write to the store, because the
 * store is what gets persisted — and a clamp is a response to a tight viewport, not
 * a layout the user asked for.
 */
import { describe, it, expect } from 'vitest'
import { clampLayout } from './useLayoutClamp'
import {
  SIDEBAR_MIN,
  EXPLORER_MIN,
  TUTORIAL_MIN,
  AGENT_MIN_WIDTH,
} from './useDividerResize'
import type { LayoutSizes } from '../../store/sessions'

const layoutSizes: LayoutSizes = {
  explorerWidth: 250,
  fileViewerSize: 300,
  userTerminalHeight: 192,
  diffPanelWidth: 320,
  tutorialPanelWidth: 300,
}

const base = {
  showSidebar: true,
  showExplorer: true,
  showTutorial: true,
  sidebarWidth: 200,
  layoutSizes,
}

describe('clampLayout', () => {
  it('leaves everything alone when there is room', () => {
    const result = clampLayout(4000, base)
    expect(result.sidebarWidth).toBe(200)
    expect(result.layoutSizes).toEqual(layoutSizes)
  })

  it('returns the input untouched for a zero-width container', () => {
    // Happens on first paint, before the ResizeObserver has measured anything.
    expect(clampLayout(0, base)).toEqual({ sidebarWidth: 200, layoutSizes })
  })

  it('shrinks the tutorial panel first', () => {
    const result = clampLayout(900, base)
    expect(result.layoutSizes.tutorialPanelWidth).toBeLessThan(300)
    expect(result.layoutSizes.explorerWidth).toBe(250)
    expect(result.sidebarWidth).toBe(200)
  })

  it('shrinks the explorer once the tutorial is at its minimum', () => {
    const result = clampLayout(700, base)
    expect(result.layoutSizes.tutorialPanelWidth).toBe(TUTORIAL_MIN)
    expect(result.layoutSizes.explorerWidth).toBeLessThan(250)
  })

  it('shrinks the sidebar last, and never below its minimum', () => {
    const result = clampLayout(300, base)
    expect(result.layoutSizes.tutorialPanelWidth).toBe(TUTORIAL_MIN)
    expect(result.layoutSizes.explorerWidth).toBe(EXPLORER_MIN)
    expect(result.sidebarWidth).toBeGreaterThanOrEqual(SIDEBAR_MIN)
  })

  it('ignores hidden panels', () => {
    const result = clampLayout(600, { ...base, showExplorer: false, showTutorial: false })
    expect(result.layoutSizes.explorerWidth).toBe(250)
    expect(result.layoutSizes.tutorialPanelWidth).toBe(300)
  })

  it('keeps the agent terminal at its minimum whenever it can', () => {
    const result = clampLayout(1000, base)
    const used =
      result.sidebarWidth + result.layoutSizes.explorerWidth + result.layoutSizes.tutorialPanelWidth + 18
    expect(1000 - used).toBeGreaterThanOrEqual(AGENT_MIN_WIDTH - 1)
  })

  /**
   * The regression this whole refactor exists for.
   *
   * Zooming to 200% halves the logical viewport, which fires the clamp. If a clamped
   * width could reach the store it would be persisted, and zooming back to 100% would
   * leave the sidebar permanently narrower than the user set it.
   *
   * Because clampLayout is pure, "the store is untouched" is not something to trust —
   * it is structurally impossible. Shrinking and re-expanding must round-trip exactly.
   */
  it('is fully reversible — no clamped width can leak into what the user chose', () => {
    const zoomedIn = clampLayout(500, base) // viewport halved
    expect(zoomedIn.sidebarWidth).toBeLessThan(base.sidebarWidth)

    // The canonical input is unchanged, so restoring the viewport restores the layout.
    const zoomedBack = clampLayout(4000, base)
    expect(zoomedBack.sidebarWidth).toBe(200)
    expect(zoomedBack.layoutSizes).toEqual(layoutSizes)
    expect(base.layoutSizes).toEqual(layoutSizes) // and the input was never mutated
  })
})
