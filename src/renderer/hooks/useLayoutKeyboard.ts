import { ReactNode, useEffect, useState, useCallback, useRef } from 'react'
import { PANEL_IDS, MAX_SHORTCUT_PANELS } from '../panels'

interface UseLayoutKeyboardParams {
  toolbarPanels: string[]
  isPanelVisible: (panelId: string) => boolean
  panels: Record<string, ReactNode>
  handleToggle: (panelId: string) => void
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

export function useLayoutKeyboard({
  toolbarPanels,
  isPanelVisible,
  panels,
  handleToggle,
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

  // Panel navigation helpers
  const focusPanel = useCallback((panelId: string) => {
    const container = document.querySelector(`[data-panel-id="${panelId}"]`)
    if (!container) return

    // For xterm: find a visible textarea (hidden tabs have display:none parents)
    const xtermTextareas = container.querySelectorAll<HTMLElement>('.xterm-helper-textarea')
    for (const ta of xtermTextareas) {
      if (ta.offsetParent !== null) { ta.focus(); return }
    }

    const monacoTextarea = container.querySelector<HTMLElement>('textarea.inputarea')
    if (monacoTextarea) { monacoTextarea.focus(); return }

    const focusable = container.querySelector<HTMLElement>('input, textarea, button, [tabindex]')
    if (focusable) { focusable.focus(); return }

    ;(container as HTMLElement).focus()
  }, [])

  const getCurrentPanel = useCallback((): string | null => {
    const activeEl = document.activeElement
    if (!activeEl) return null
    const panelEl = activeEl.closest('[data-panel-id]')
    return panelEl?.getAttribute('data-panel-id') ?? null
  }, [])

  const lastCyclePanelRef = useRef<string | null>(null)

  const handleCyclePanel = useCallback((reverse: boolean) => {
    const visiblePanels = toolbarPanels.filter(id => {
      if (!isPanelVisible(id)) return false
      if (id === PANEL_IDS.SETTINGS) return false
      return !!panels[id]
    })

    // Terminal is always visible but not in toolbarPanels — insert after file viewer
    if (panels.terminal) {
      const insertAfter = visiblePanels.indexOf(PANEL_IDS.FILE_VIEWER)
      visiblePanels.splice(insertAfter !== -1 ? insertAfter + 1 : visiblePanels.length, 0, 'terminal')
    }

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

    setFlashedPanel(targetPanel)
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = setTimeout(() => setFlashedPanel(null), 250)
  }, [toolbarPanels, isPanelVisible, panels, getCurrentPanel, focusPanel])

  const handleToggleByKey = useCallback((key: string) => {
    const index = parseInt(key, 10) - 1
    if (index >= 0 && index < toolbarPanels.length && index < MAX_SHORTCUT_PANELS) {
      const panelId = toolbarPanels[index]
      handleToggle(panelId)
    }
  }, [toolbarPanels, handleToggle])

  useEffect(() => {
    // App-wide shortcuts: exact match (including shift state)
    const appWideShortcuts = new Map<string, () => void>()
    if (onNewSession) appWideShortcuts.set('mod:n', onNewSession)
    if (onFocusSessionList) appWideShortcuts.set('mod:j', onFocusSessionList)
    if (onFocusSessionSearch) appWideShortcuts.set('shift+mod:f', onFocusSessionSearch)
    if (onArchiveSession) appWideShortcuts.set('shift+mod:a', onArchiveSession)
    if (onToggleSettings) appWideShortcuts.set('mod:,', onToggleSettings)
    if (onShowShortcuts) appWideShortcuts.set('mod:/', onShowShortcuts)
    if (onPrevSession) appWideShortcuts.set('alt:arrowup', onPrevSession)
    if (onNextSession) appWideShortcuts.set('alt:arrowdown', onNextSession)
    if (onNextTerminalTab) appWideShortcuts.set('shift+mod:]', onNextTerminalTab)
    if (onPrevTerminalTab) appWideShortcuts.set('shift+mod:[', onPrevTerminalTab)

    // Explorer tab shortcuts: Cmd+Alt+1-5
    if (onExplorerTab) {
      const explorerFilters = ['files', 'source-control', 'search', 'recent', 'review']
      for (let i = 0; i < explorerFilters.length; i++) {
        const filter = explorerFilters[i]
        appWideShortcuts.set(`alt+mod:${i + 1}`, () => onExplorerTab(filter))
      }
    }

    // Shift-insensitive shortcuts (Cmd+P works as Cmd+Shift+P too)
    const shiftInsensitiveShortcuts = new Map<string, () => void>()
    if (onSearchFiles) shiftInsensitiveShortcuts.set('mod:p', onSearchFiles)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        e.stopImmediatePropagation()
        handleCyclePanel(e.shiftKey)
        return
      }

      // Check exact-match app-wide shortcuts
      const key = shortcutKey(e)
      const appAction = appWideShortcuts.get(key)
      if (appAction) {
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

      // Below here: skip if in input/textarea, require Cmd/Ctrl
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        handleToggleByKey(e.key)
      }
    }

    // Custom events from Terminal (xterm may block normal event bubbling)
    const handleCustomToggle = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>
      handleToggleByKey(customEvent.detail.key)
    }

    const handleCustomNewSession = () => onNewSession?.()
    const handleCustomNextSession = () => onNextSession?.()
    const handleCustomPrevSession = () => onPrevSession?.()
    const handleCustomFocusSessions = () => onFocusSessionList?.()
    const handleCustomFocusSessionSearch = () => onFocusSessionSearch?.()
    const handleCustomArchiveSession = () => onArchiveSession?.()
    const handleCustomToggleSettings = () => onToggleSettings?.()
    const handleCustomShowShortcuts = () => onShowShortcuts?.()
    const handleCustomNextTerminalTab = () => onNextTerminalTab?.()
    const handleCustomPrevTerminalTab = () => onPrevTerminalTab?.()
    const handleCustomExplorerTab = (e: Event) => {
      const detail = (e as CustomEvent<{ filter: string }>).detail
      onExplorerTab?.(detail.filter)
    }

    // Select-all scoping: for non-terminal focused elements (Monaco, inputs, textareas),
    // use execCommand('selectAll') which correctly scopes to the focused editable element.
    // Terminal.tsx handles its own select-all via the same app:select-all event.
    const handleSelectAll = () => {
      const active = document.activeElement
      if (!active) return
      // Skip if focus is inside a terminal (xterm) — Terminal.tsx handles it
      if (active.closest('.xterm')) return
      // For Monaco editor, input, textarea, or contentEditable elements.
      // No modern replacement for execCommand('selectAll') on arbitrary focused elements.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.execCommand('selectAll')
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('app:toggle-panel', handleCustomToggle)
    window.addEventListener('app:new-session', handleCustomNewSession)
    window.addEventListener('app:next-session', handleCustomNextSession)
    window.addEventListener('app:prev-session', handleCustomPrevSession)
    window.addEventListener('app:focus-sessions', handleCustomFocusSessions)
    window.addEventListener('app:focus-session-search', handleCustomFocusSessionSearch)
    window.addEventListener('app:archive-session', handleCustomArchiveSession)
    window.addEventListener('app:toggle-settings', handleCustomToggleSettings)
    window.addEventListener('app:show-shortcuts', handleCustomShowShortcuts)
    window.addEventListener('app:next-terminal-tab', handleCustomNextTerminalTab)
    window.addEventListener('app:prev-terminal-tab', handleCustomPrevTerminalTab)
    window.addEventListener('app:explorer-tab', handleCustomExplorerTab)
    window.addEventListener('app:select-all', handleSelectAll)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('app:toggle-panel', handleCustomToggle)
      window.removeEventListener('app:new-session', handleCustomNewSession)
      window.removeEventListener('app:next-session', handleCustomNextSession)
      window.removeEventListener('app:prev-session', handleCustomPrevSession)
      window.removeEventListener('app:focus-sessions', handleCustomFocusSessions)
      window.removeEventListener('app:focus-session-search', handleCustomFocusSessionSearch)
      window.removeEventListener('app:archive-session', handleCustomArchiveSession)
      window.removeEventListener('app:toggle-settings', handleCustomToggleSettings)
      window.removeEventListener('app:show-shortcuts', handleCustomShowShortcuts)
      window.removeEventListener('app:next-terminal-tab', handleCustomNextTerminalTab)
      window.removeEventListener('app:prev-terminal-tab', handleCustomPrevTerminalTab)
      window.removeEventListener('app:explorer-tab', handleCustomExplorerTab)
      window.removeEventListener('app:select-all', handleSelectAll)
    }
  }, [handleToggleByKey, handleCyclePanel, onSearchFiles, onNewSession, onNextSession, onPrevSession, onFocusSessionList, onFocusSessionSearch, onArchiveSession, onToggleSettings, onShowShortcuts, onNextTerminalTab, onPrevTerminalTab, onExplorerTab])

  return {
    flashedPanel,
  }
}
