/**
 * Clamps panel sizes when the viewport shrinks, so the agent terminal keeps its
 * minimum width.
 *
 * These adjustments are NEVER persisted. Shrinking a panel here is a rendering
 * response to a small viewport, not a layout the user asked for — and the interface
 * scale makes that distinction load-bearing: zooming to 200% shrinks the logical
 * viewport, which fires this clamp. If it wrote to disk, zooming back to 100% would
 * leave the sidebar permanently narrower than the user set it, with no way to know
 * why.
 */
import { useEffect, RefObject } from 'react'
import type { LayoutSizes } from '../../store/sessions'
import {
  SIDEBAR_MIN,
  EXPLORER_MIN,
  TUTORIAL_MIN,
  AGENT_MIN_WIDTH,
} from './useDividerResize'

/** The clamp adjusts the rendered layout; it must not rewrite what the user saved. */
const NO_PERSIST = { persist: false } as const

interface UseLayoutClampParams {
  mainContentRef: RefObject<HTMLDivElement>
  showSidebar: boolean
  showExplorer: boolean
  showTutorial: boolean
  sidebarWidth: number
  layoutSizes: LayoutSizes
  onSidebarWidthChange: (width: number, options?: { persist?: boolean }) => void
  onLayoutSizeChange: (key: keyof LayoutSizes, value: number, options?: { persist?: boolean }) => void
}

export function useLayoutClamp({
  mainContentRef,
  showSidebar,
  showExplorer,
  showTutorial,
  sidebarWidth,
  layoutSizes,
  onSidebarWidthChange,
  onLayoutSizeChange,
}: UseLayoutClampParams) {
  useEffect(() => {
    const el = mainContentRef.current
    if (!el) return

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      const totalWidth = el.getBoundingClientRect().width
      if (totalWidth <= 0) return

      // Calculate current space consumed by side panels (including dividers between them)
      const DIVIDER_WIDTH = 6 // px — matches the Divider component's hit area
      let usedWidth = 0
      let dividerCount = 0
      if (showSidebar) { usedWidth += sidebarWidth; dividerCount++ }
      if (showExplorer) { usedWidth += layoutSizes.explorerWidth; dividerCount++ }
      if (showTutorial) { usedWidth += layoutSizes.tutorialPanelWidth; dividerCount++ }
      usedWidth += dividerCount * DIVIDER_WIDTH

      const agentWidth = totalWidth - usedWidth
      if (agentWidth >= AGENT_MIN_WIDTH) return

      // Need to reclaim (AGENT_MIN_WIDTH - agentWidth) pixels
      let deficit = AGENT_MIN_WIDTH - agentWidth

      // Shrink tutorial first, then explorer, then sidebar
      if (showTutorial && deficit > 0) {
        const current = layoutSizes.tutorialPanelWidth
        const shrinkable = current - TUTORIAL_MIN
        if (shrinkable > 0) {
          const shrink = Math.min(deficit, shrinkable)
          onLayoutSizeChange('tutorialPanelWidth', current - shrink, NO_PERSIST)
          deficit -= shrink
        }
      }
      if (showExplorer && deficit > 0) {
        const current = layoutSizes.explorerWidth
        const shrinkable = current - EXPLORER_MIN
        if (shrinkable > 0) {
          const shrink = Math.min(deficit, shrinkable)
          onLayoutSizeChange('explorerWidth', current - shrink, NO_PERSIST)
          deficit -= shrink
        }
      }
      if (showSidebar && deficit > 0) {
        const shrinkable = sidebarWidth - SIDEBAR_MIN
        if (shrinkable > 0) {
          const shrink = Math.min(deficit, shrinkable)
          onSidebarWidthChange(sidebarWidth - shrink, NO_PERSIST)
        }
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [mainContentRef, showSidebar, showExplorer, showTutorial, sidebarWidth, layoutSizes.explorerWidth, layoutSizes.tutorialPanelWidth, onSidebarWidthChange, onLayoutSizeChange])
}
