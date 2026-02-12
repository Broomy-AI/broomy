import { ReactNode, useEffect, useState, useCallback, useRef } from 'react'
import { PANEL_IDS, MAX_SHORTCUT_PANELS } from '../panels'

interface UseLayoutKeyboardParams {
  toolbarPanels: string[]
  isPanelVisible: (panelId: string) => boolean
  panels: Record<string, ReactNode>
  handleToggle: (panelId: string) => void
}

export function useLayoutKeyboard({
  toolbarPanels,
  isPanelVisible,
  panels,
  handleToggle,
}: UseLayoutKeyboardParams) {
  const [flashedPanel, setFlashedPanel] = useState<string | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Panel navigation helpers
  const focusPanel = useCallback((panelId: string) => {
    const container = document.querySelector(`[data-panel-id="${panelId}"]`)
    if (!container) return

    // For terminals: focus the xterm helper textarea
    const xtermTextarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
    if (xtermTextarea) {
      xtermTextarea.focus()
      return
    }

    // For Monaco editor: focus the editor textarea
    const monacoTextarea = container.querySelector('textarea.inputarea') as HTMLTextAreaElement | null
    if (monacoTextarea) {
      monacoTextarea.focus()
      return
    }

    // Fallback: focus any focusable element inside
    const focusable = container.querySelector('input, textarea, button, [tabindex]') as HTMLElement | null
    if (focusable) {
      focusable.focus()
      return
    }

    // Last resort: focus the container itself (needs tabIndex={-1})
    ;(container as HTMLElement).focus()
  }, [])

  const getCurrentPanel = useCallback((): string | null => {
    const activeEl = document.activeElement
    if (!activeEl) return null
    const panelEl = activeEl.closest('[data-panel-id]')
    return panelEl?.getAttribute('data-panel-id') ?? null
  }, [])

  // Track last cycle position so cycling always advances even if focus detection fails
  const lastCyclePanelRef = useRef<string | null>(null)

  // Cycle through visible toolbar panels in order (Ctrl+Tab / Ctrl+Shift+Tab)
  const handleCyclePanel = useCallback((reverse: boolean) => {
    // Get visible toolbar panels in order (skip settings since it replaces content)
    const visiblePanels = toolbarPanels.filter(id => {
      if (!isPanelVisible(id)) return false
      if (id === PANEL_IDS.SETTINGS) return false
      return !!panels[id]
    })

    if (visiblePanels.length === 0) return

    // Try to determine current position: first from activeElement, then from last cycle
    const current = getCurrentPanel() || lastCyclePanelRef.current
    const currentIndex = current ? visiblePanels.indexOf(current) : -1

    let nextIndex: number
    if (currentIndex === -1) {
      nextIndex = reverse ? visiblePanels.length - 1 : 0
    } else if (reverse) {
      nextIndex = (currentIndex - 1 + visiblePanels.length) % visiblePanels.length
    } else {
      nextIndex = (currentIndex + 1) % visiblePanels.length
    }

    const targetPanel = visiblePanels[nextIndex]
    lastCyclePanelRef.current = targetPanel
    focusPanel(targetPanel)

    // Brief flash overlay
    setFlashedPanel(targetPanel)
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = setTimeout(() => setFlashedPanel(null), 250)
  }, [toolbarPanels, isPanelVisible, panels, getCurrentPanel, focusPanel])

  // Handle panel toggle by key (1-6 for toolbar panels)
  const handleToggleByKey = useCallback((key: string) => {
    const index = parseInt(key, 10) - 1
    if (index >= 0 && index < toolbarPanels.length && index < MAX_SHORTCUT_PANELS) {
      const panelId = toolbarPanels[index]
      handleToggle(panelId)
    }
  }, [toolbarPanels, handleToggle])

  // Keyboard shortcuts - use capture phase to intercept before terminal gets them
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Tab cycles panels — handle before textarea check since it's app-wide
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        e.stopImmediatePropagation()
        handleCyclePanel(e.shiftKey)
        return
      }

      if (!(e.metaKey || e.ctrlKey)) return

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        handleToggleByKey(e.key)
      }
    }

    // Also listen for custom events from Terminal (xterm may block normal event bubbling)
    const handleCustomToggle = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>
      handleToggleByKey(customEvent.detail.key)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('app:toggle-panel', handleCustomToggle)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('app:toggle-panel', handleCustomToggle)
    }
  }, [handleToggleByKey, handleCyclePanel])

  return {
    flashedPanel,
  }
}
