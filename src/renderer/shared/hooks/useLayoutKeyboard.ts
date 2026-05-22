/**
 * Registers global keyboard shortcuts for panel toggling, session navigation, file search, and other layout actions.
 */
import { ReactNode, useEffect, useState, useCallback, useRef } from 'react'
import { PANEL_IDS, MAX_SHORTCUT_PANELS } from '../../panels'
import { focusPanel, focusAdjacentPanel, setLastFocusedPanel } from '../utils/focusHelpers'

interface UseLayoutKeyboardParams {
  toolbarPanels: string[]
  isPanelVisible: (panelId: string) => boolean
  panels: Record<string, ReactNode>
  handleToggle: (panelId: string) => void
  activeSessionId?: string | null
  onSearchFiles?: () => void
  onNewSession?: () => void
  onNextSession?: () => void
  onPrevSession?: () => void
  onFocusSessionList?: () => void
  onFocusSessionSearch?: () => void
  onArchiveSession?: () => void
  onToggleSettings?: () => void
  onShowShortcuts?: () => void
  onNextTerminalTab?: () => void
  onPrevTerminalTab?: () => void
  onExplorerTab?: (filter: string) => void
}

/** Resolve the logical key, using e.code for digits when Alt mangles e.key on Mac. */
function resolveKey(e: KeyboardEvent): string {
  if (e.altKey && e.code.startsWith('Digit')) return e.code.charAt(5)
  return e.key.toLowerCase()
}

/** Build a normalized shortcut key for matching, e.g. "shift+mod:f" or "alt:arrowdown". */
function shortcutKey(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  if (e.metaKey || e.ctrlKey) parts.push('mod')
  return `${parts.join('+')}:${resolveKey(e)}`
}

/** Like shortcutKey but ignores Shift, for shortcuts that accept both upper/lowercase. */
function shortcutKeyNoShift(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.altKey) parts.push('alt')
  if (e.metaKey || e.ctrlKey) parts.push('mod')
  return `${parts.join('+')}:${resolveKey(e)}`
}

/** Check if focus is inside a modal dialog that should handle its own keyboard events. */
function isInsideModalDialog(): boolean {
  return !!document.activeElement?.closest('[role="dialog"][aria-modal="true"]')
}

/** Check if focus is inside a Monaco editor, which has its own keybindings (e.g. Cmd+/ for toggle comment). */
function isInsideMonaco(): boolean {
  return !!document.activeElement?.closest('.monaco-editor')
}

/** Check if focus is in a context that should pass through arrow keys. */
function isArrowPassthrough(el: Element): boolean {
  if (el.closest('.xterm')) return true
  if (el.closest('.monaco-editor')) return true
  if (el.closest('[contenteditable]')) return true
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) {
    const textTypes = ['text', 'search', 'number', 'url', 'email', 'tel', 'password']
    return textTypes.includes(el.type)
  }
  return false
}

/** Handle arrow key navigation within panels and modals. Returns true if handled. */
function handleArrowNavigation(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false

  const activeEl = document.activeElement
  if (!activeEl || isArrowPassthrough(activeEl)) return false

  const isHorizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight'

  // Find the nearest navigable container
  const container =
    activeEl.closest('[role="dialog"]') ??
    activeEl.closest('[role="menu"]') ??
    activeEl.closest('[data-panel-id]')
  if (!container) return false

  // Horizontal arrows only within grid-nav containers, menus, and dialogs
  if (isHorizontal) {
    const isGridNav = container.getAttribute('data-arrow-nav') === 'grid'
    const role = container.getAttribute('role')
    if (!isGridNav && role !== 'menu' && role !== 'dialog') return false
  }

  // Query all focusable elements within the container
  const focusables = Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex="0"]'
    )
  )
  if (focusables.length === 0) return false

  const currentIndex = focusables.indexOf(activeEl as HTMLElement)
  if (currentIndex === -1) return false

  const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight'
  const nextIndex = forward ? currentIndex + 1 : currentIndex - 1

  // No wrap-around — stop at edges
  if (nextIndex < 0 || nextIndex >= focusables.length) return false

  e.preventDefault()
  e.stopImmediatePropagation()
  focusables[nextIndex].focus()
  return true
}

/** Build the app-wide shortcut map from the provided callbacks. */
function buildAppWideShortcuts(cbs: {
  onNewSession?: () => void; onFocusSessionList?: () => void
  onFocusSessionSearch?: () => void; onArchiveSession?: () => void
  onToggleSettings?: () => void; onShowShortcuts?: () => void
  onPrevSession?: () => void; onNextSession?: () => void
  onNextTerminalTab?: () => void; onPrevTerminalTab?: () => void
  onExplorerTab?: (filter: string) => void
}): Map<string, () => void> {
  const m = new Map<string, () => void>()
  if (cbs.onNewSession) m.set('mod:n', cbs.onNewSession)
  if (cbs.onFocusSessionList) m.set('mod:j', cbs.onFocusSessionList)
  if (cbs.onFocusSessionSearch) m.set('shift+mod:f', cbs.onFocusSessionSearch)
  if (cbs.onArchiveSession) m.set('shift+mod:a', cbs.onArchiveSession)
  if (cbs.onToggleSettings) m.set('mod:,', cbs.onToggleSettings)
  if (cbs.onShowShortcuts) m.set('mod:/', cbs.onShowShortcuts)
  if (cbs.onPrevSession) m.set('alt:arrowup', cbs.onPrevSession)
  if (cbs.onNextSession) m.set('alt:arrowdown', cbs.onNextSession)
  if (cbs.onNextTerminalTab) m.set('shift+mod:]', cbs.onNextTerminalTab)
  if (cbs.onPrevTerminalTab) m.set('shift+mod:[', cbs.onPrevTerminalTab)
  if (cbs.onExplorerTab) {
    const filters = ['files', 'source-control', 'search', 'recent', 'review']
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i]
      m.set(`alt+mod:${i + 1}`, () => cbs.onExplorerTab!(filter))
    }
  }
  return m
}

export function useLayoutKeyboard({
  toolbarPanels,
  isPanelVisible,
  panels,
  handleToggle,
  activeSessionId,
  onSearchFiles,
  onNewSession,
  onNextSession,
  onPrevSession,
  onFocusSessionList,
  onFocusSessionSearch,
  onArchiveSession,
  onToggleSettings,
  onShowShortcuts,
  onNextTerminalTab,
  onPrevTerminalTab,
  onExplorerTab,
}: UseLayoutKeyboardParams) {
  const [flashedPanel, setFlashedPanel] = useState<string | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track which panel has focus so we can restore it on session switch
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId
  useEffect(() => {
    const handleFocusIn = () => {
      const sessionId = activeSessionIdRef.current
      if (!sessionId) return
      const activeEl = document.activeElement
      if (!activeEl) return
      const panelEl = activeEl.closest('[data-panel-id]')
      const panelId = panelEl?.getAttribute('data-panel-id')
      if (panelId) setLastFocusedPanel(sessionId, panelId)
    }
    window.addEventListener('focusin', handleFocusIn)
    return () => window.removeEventListener('focusin', handleFocusIn)
  }, [])

  const getCurrentPanel = useCallback((): string | null => {
    const activeEl = document.activeElement
    if (!activeEl) return null
    const panelEl = activeEl.closest('[data-panel-id]')
    return panelEl?.getAttribute('data-panel-id') ?? null
  }, [])

  const lastCyclePanelRef = useRef<string | null>(null)

  /** Build the ordered list of currently visible panels for cycling. */
  const getVisiblePanels = useCallback(() => {
    return toolbarPanels.filter(id => {
      if (!isPanelVisible(id)) return false
      if (id === PANEL_IDS.SETTINGS) return false
      return !!panels[id]
    })
  }, [toolbarPanels, isPanelVisible, panels])

  const flashPanel = useCallback((panelId: string) => {
    setFlashedPanel(panelId)
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = setTimeout(() => setFlashedPanel(null), 250)
  }, [])

  const handleCyclePanel = useCallback((reverse: boolean) => {
    const visiblePanels = getVisiblePanels()
    if (visiblePanels.length === 0) return

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
    flashPanel(targetPanel)
  }, [getVisiblePanels, getCurrentPanel, flashPanel])

  const handleDirectionalFocus = useCallback((direction: 'left' | 'right') => {
    const visiblePanels = getVisiblePanels()
    const targetPanel = focusAdjacentPanel(direction, visiblePanels, getCurrentPanel)
    if (targetPanel) flashPanel(targetPanel)
  }, [getVisiblePanels, getCurrentPanel, flashPanel])

  const handleToggleByKey = useCallback((key: string) => {
    const index = parseInt(key, 10) - 1
    if (index >= 0 && index < toolbarPanels.length && index < MAX_SHORTCUT_PANELS) {
      const panelId = toolbarPanels[index]

      // Focus-or-toggle: hidden → show+focus, visible+unfocused → focus, visible+focused → hide
      if (isPanelVisible(panelId)) {
        const currentPanel = getCurrentPanel()
        if (currentPanel === panelId) {
          handleToggle(panelId) // hide it
        } else {
          focusPanel(panelId) // focus it without hiding
          flashPanel(panelId)
        }
      } else {
        handleToggle(panelId) // show it
        // Focus after React renders
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            focusPanel(panelId)
            flashPanel(panelId)
          })
        })
      }
    }
  }, [toolbarPanels, isPanelVisible, getCurrentPanel, handleToggle, flashPanel])

  useEffect(() => {
    const appWideShortcuts = buildAppWideShortcuts({
      onNewSession, onFocusSessionList, onFocusSessionSearch, onArchiveSession,
      onToggleSettings, onShowShortcuts, onPrevSession, onNextSession,
      onNextTerminalTab, onPrevTerminalTab, onExplorerTab,
    })

    const shiftInsensitiveShortcuts = new Map<string, () => void>()
    if (onSearchFiles) shiftInsensitiveShortcuts.set('mod:p', onSearchFiles)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        e.stopImmediatePropagation()
        handleCyclePanel(e.shiftKey)
        return
      }

      // Cmd+Shift+Left/Right: directional panel focus
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        e.stopImmediatePropagation()
        handleDirectionalFocus(e.key === 'ArrowLeft' ? 'left' : 'right')
        return
      }

      // Check exact-match app-wide shortcuts
      const key = shortcutKey(e)
      const appAction = appWideShortcuts.get(key)
      if (appAction) {
        // Cmd+/ is Monaco's toggle-line-comment binding. When focus is in a
        // Monaco editor, let Monaco handle it instead of opening the shortcuts modal.
        if (key === 'mod:/' && isInsideMonaco()) return
        e.preventDefault()
        e.stopImmediatePropagation()
        appAction()
        return
      }

      // Check shift-insensitive shortcuts
      const noShiftKey = shortcutKeyNoShift(e)
      const shiftInsensitiveAction = shiftInsensitiveShortcuts.get(noShiftKey)
      if (shiftInsensitiveAction) {
        e.preventDefault()
        e.stopImmediatePropagation()
        shiftInsensitiveAction()
        return
      }

      // When a modal dialog is open, let it handle its own keyboard events.
      // Only global shortcuts (Cmd/Ctrl combos handled above) should pass through.
      if (isInsideModalDialog()) return

      // Global arrow key navigation within panels/modals
      if (handleArrowNavigation(e)) return

      // Panel toggle shortcuts: Cmd/Ctrl+1-5 (work from any context including Monaco)
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && ['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        handleToggleByKey(e.key)
      }
    }

    // Custom events from Terminal (xterm may block normal event bubbling)
    const handleCustomToggle = (e: Event) => {
      handleToggleByKey((e as CustomEvent<{ key: string }>).detail.key)
    }
    const handleCustomExplorerTab = (e: Event) => {
      onExplorerTab?.((e as CustomEvent<{ filter: string }>).detail.filter)
    }

    // Select-all scoping: for non-terminal focused elements
    const handleSelectAll = () => {
      const active = document.activeElement
      if (!active || active.closest('.xterm')) return
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.execCommand('selectAll')
    }

    // Register all custom event listeners with a table-driven approach
    const customEvents: [string, EventListener][] = [
      ['app:toggle-panel', handleCustomToggle],
      ['app:new-session', () => onNewSession?.()],
      ['app:next-session', () => onNextSession?.()],
      ['app:prev-session', () => onPrevSession?.()],
      ['app:focus-sessions', () => onFocusSessionList?.()],
      ['app:focus-session-search', () => onFocusSessionSearch?.()],
      ['app:archive-session', () => onArchiveSession?.()],
      ['app:toggle-settings', () => onToggleSettings?.()],
      ['app:show-shortcuts', () => onShowShortcuts?.()],
      ['app:next-terminal-tab', () => onNextTerminalTab?.()],
      ['app:prev-terminal-tab', () => onPrevTerminalTab?.()],
      ['app:explorer-tab', handleCustomExplorerTab],
      ['app:select-all', handleSelectAll],
      ['app:focus-panel-left', () => handleDirectionalFocus('left')],
      ['app:focus-panel-right', () => handleDirectionalFocus('right')],
    ]

    window.addEventListener('keydown', handleKeyDown, true)
    for (const [name, handler] of customEvents) window.addEventListener(name, handler)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      for (const [name, handler] of customEvents) window.removeEventListener(name, handler)
    }
  }, [handleToggleByKey, handleCyclePanel, handleDirectionalFocus, onSearchFiles, onNewSession, onNextSession, onPrevSession, onFocusSessionList, onFocusSessionSearch, onArchiveSession, onToggleSettings, onShowShortcuts, onNextTerminalTab, onPrevTerminalTab, onExplorerTab])

  return {
    flashedPanel,
  }
}
