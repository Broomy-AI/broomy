/**
 * Fits the panels into the available width, so the agent terminal keeps its minimum.
 *
 * This hook DERIVES the widths to render. It does not write to the store, and it
 * never persists anything.
 *
 * That distinction is load-bearing. A clamp is a rendering response to a viewport
 * that got tight — not a layout the user asked for. Writing it back destroys a
 * layout they deliberately dragged, and the interface scale makes that routine
 * rather than rare: zooming to 200% shrinks the LOGICAL viewport, which fires the
 * clamp. If a clamped width reached the store, zooming back to 100% would leave the
 * sidebar permanently narrower, with no way to know why.
 *
 * Merely skipping `debouncedSave` while still writing to the store is NOT enough:
 * the store value IS what gets persisted, so the next unrelated save (switching
 * sessions, toggling a panel) would write the clamped width to disk anyway.
 *
 * So: the store holds what the user chose; this returns what fits on screen.
 */
import { useEffect, useState, RefObject } from 'react'
import type { LayoutSizes } from '../../store/sessions'
import {
  SIDEBAR_MIN,
  EXPLORER_MIN,
  TUTORIAL_MIN,
  AGENT_MIN_WIDTH,
} from './useDividerResize'

/** px — matches the Divider component's hit area. */
const DIVIDER_WIDTH = 6

interface LayoutInput {
  showSidebar: boolean
  showExplorer: boolean
  showTutorial: boolean
  sidebarWidth: number
  layoutSizes: LayoutSizes
}

interface UseLayoutClampParams extends LayoutInput {
  mainContentRef: RefObject<HTMLDivElement>
}

export interface ClampedLayout {
  sidebarWidth: number
  layoutSizes: LayoutSizes
}

/** Pure: given the space available, what should actually be rendered? */
export function clampLayout(totalWidth: number, input: LayoutInput): ClampedLayout {
  const { showSidebar, showExplorer, showTutorial, sidebarWidth, layoutSizes } = input
  const unchanged: ClampedLayout = { sidebarWidth, layoutSizes }
  if (totalWidth <= 0) return unchanged

  let used = 0
  let dividers = 0
  if (showSidebar) { used += sidebarWidth; dividers++ }
  if (showExplorer) { used += layoutSizes.explorerWidth; dividers++ }
  if (showTutorial) { used += layoutSizes.tutorialPanelWidth; dividers++ }
  used += dividers * DIVIDER_WIDTH

  let deficit = AGENT_MIN_WIDTH - (totalWidth - used)
  if (deficit <= 0) return unchanged

  // Shrink tutorial first, then explorer, then the sidebar.
  const take = (current: number, min: number): number => {
    const shrink = Math.min(deficit, Math.max(0, current - min))
    deficit -= shrink
    return current - shrink
  }

  const nextSizes: LayoutSizes = { ...layoutSizes }
  if (showTutorial && deficit > 0) {
    nextSizes.tutorialPanelWidth = take(nextSizes.tutorialPanelWidth, TUTORIAL_MIN)
  }
  if (showExplorer && deficit > 0) {
    nextSizes.explorerWidth = take(nextSizes.explorerWidth, EXPLORER_MIN)
  }
  const nextSidebar = showSidebar && deficit > 0 ? take(sidebarWidth, SIDEBAR_MIN) : sidebarWidth

  return { sidebarWidth: nextSidebar, layoutSizes: nextSizes }
}

/** Observes the container and returns the widths to render. Never writes to the store. */
export function useLayoutClamp(params: UseLayoutClampParams): ClampedLayout {
  const { mainContentRef, showSidebar, showExplorer, showTutorial, sidebarWidth, layoutSizes } = params
  const [availableWidth, setAvailableWidth] = useState(0)

  useEffect(() => {
    const el = mainContentRef.current
    if (!el) return
    if (typeof ResizeObserver === 'undefined') return

    setAvailableWidth(el.getBoundingClientRect().width)

    const observer = new ResizeObserver(() => {
      const width = el.getBoundingClientRect().width
      if (width > 0) setAvailableWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [mainContentRef])

  return clampLayout(availableWidth, {
    showSidebar,
    showExplorer,
    showTutorial,
    sidebarWidth,
    layoutSizes,
  })
}
