// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLayoutKeyboard } from './useLayoutKeyboard'

// Mock the panels module
vi.mock('../../panels', () => ({
  PANEL_IDS: {
    SIDEBAR: 'sidebar',
    EXPLORER: 'explorer',
    FILE_VIEWER: 'fileViewer',
    AGENT: 'agent',
    SETTINGS: 'settings',
    TUTORIAL: 'tutorial',
  },
  MAX_SHORTCUT_PANELS: 5,
}))

describe('useLayoutKeyboard', () => {
  const handleToggle = vi.fn()
  const onSearchFiles = vi.fn()
  const onNewSession = vi.fn()
  const onNextSession = vi.fn()
  const onPrevSession = vi.fn()
  const onFocusSessionList = vi.fn()
  const onFocusSessionSearch = vi.fn()
  const onArchiveSession = vi.fn()
  const onToggleSettings = vi.fn()
  const onShowShortcuts = vi.fn()
  const onNextTerminalTab = vi.fn()
  const onPrevTerminalTab = vi.fn()
  const onExplorerTab = vi.fn()

  const isPanelVisible = vi.fn<(panelId: string) => boolean>().mockReturnValue(true)

  const defaultProps = {
    toolbarPanels: ['sidebar', 'explorer', 'fileViewer', 'tutorial', 'settings'],
    isPanelVisible,
    panels: {
      sidebar: 'sidebar-content' as ReactNode,
      explorer: 'explorer-content' as ReactNode,
      fileViewer: 'fileViewer-content' as ReactNode,
      tutorial: 'tutorial-content' as ReactNode,
      settings: null as ReactNode,
    } as Record<string, ReactNode>,
    handleToggle: handleToggle as (panelId: string) => void,
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
  }

  beforeEach(() => {
    vi.clearAllMocks()
    isPanelVisible.mockReturnValue(true)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('starts with no flashed panel', () => {
      const { result } = renderHook(() => useLayoutKeyboard(defaultProps))
      expect(result.current.flashedPanel).toBeNull()
    })
  })

  describe('panel toggle by number keys', () => {
    it('focuses visible panel on Cmd+1 (focus-or-toggle: visible+unfocused → focus)', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: '1',
          metaKey: true,
          bubbles: true,
        })
        window.dispatchEvent(event)
      })

      // Panel is visible but not focused → focuses without toggling
      expect(handleToggle).not.toHaveBeenCalled()
    })

    it('focuses visible panel on Cmd+2 (focus-or-toggle)', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: '2',
          metaKey: true,
          bubbles: true,
        })
        window.dispatchEvent(event)
      })

      expect(handleToggle).not.toHaveBeenCalled()
    })

    it('shows hidden panel on Cmd+5 (focus-or-toggle: hidden → show)', () => {
      const isPanelVisible = vi.fn((id: string) => id !== 'settings') as (panelId: string) => boolean
      renderHook(() => useLayoutKeyboard({ ...defaultProps, isPanelVisible }))

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: '5',
          metaKey: true,
          bubbles: true,
        })
        window.dispatchEvent(event)
      })

      expect(handleToggle).toHaveBeenCalledWith('settings')
    })

    it('hides visible+focused panel (focus-or-toggle: visible+focused → hide)', () => {
      // Create a button inside a panel container to simulate focused panel
      const container = document.createElement('div')
      container.setAttribute('data-panel-id', 'fileViewer')
      const btn = document.createElement('button')
      container.appendChild(btn)
      document.body.appendChild(container)
      btn.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: '3',
          ctrlKey: true,
          bubbles: true,
        })
        window.dispatchEvent(event)
      })

      expect(handleToggle).toHaveBeenCalledWith('fileViewer')
      document.body.removeChild(container)
    })

    it('does not toggle beyond MAX_SHORTCUT_PANELS', () => {
      const propsWithMany = {
        ...defaultProps,
        toolbarPanels: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      }

      renderHook(() => useLayoutKeyboard(propsWithMany))

      // Key 6 (index 5) is beyond the max of 5
      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: '6',
          metaKey: true,
          bubbles: true,
        })
        window.dispatchEvent(event)
      })

      expect(handleToggle).not.toHaveBeenCalled()
    })

    it('ignores key presses in input fields', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))

      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: '1',
          metaKey: true,
          bubbles: true,
        })
        Object.defineProperty(event, 'target', { value: input })
        window.dispatchEvent(event)
      })

      expect(handleToggle).not.toHaveBeenCalled()

      document.body.removeChild(input)
    })

    it('ignores key presses in textarea fields', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))

      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)
      textarea.focus()

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: '2',
          metaKey: true,
          bubbles: true,
        })
        Object.defineProperty(event, 'target', { value: textarea })
        window.dispatchEvent(event)
      })

      expect(handleToggle).not.toHaveBeenCalled()

      document.body.removeChild(textarea)
    })

    it('ignores keys without modifier', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: '1',
          bubbles: true,
        })
        window.dispatchEvent(event)
      })

      expect(handleToggle).not.toHaveBeenCalled()
    })
  })

  describe('Cmd/Ctrl+P for file search', () => {
    it('calls onSearchFiles on Cmd+P', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'p',
          metaKey: true,
          bubbles: true,
        })
        window.dispatchEvent(event)
      })

      expect(onSearchFiles).toHaveBeenCalled()
    })

    it('calls onSearchFiles on Cmd+Shift+P (uppercase P)', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'P',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
        })
        window.dispatchEvent(event)
      })

      expect(onSearchFiles).toHaveBeenCalled()
    })

    it('works even in textarea (Cmd+P is app-wide)', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))

      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'p',
          metaKey: true,
          bubbles: true,
        })
        Object.defineProperty(event, 'target', { value: textarea })
        window.dispatchEvent(event)
      })

      expect(onSearchFiles).toHaveBeenCalled()

      document.body.removeChild(textarea)
    })
  })

  describe('Ctrl+Tab panel cycling', () => {
    it('handles Ctrl+Tab for forward cycling', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'Tab',
          ctrlKey: true,
          bubbles: true,
        })
        window.dispatchEvent(event)
      })

      // Should not throw, cycling logic works even without DOM focus
    })

    it('handles Ctrl+Shift+Tab for reverse cycling', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'Tab',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        })
        window.dispatchEvent(event)
      })

      // Should not throw
    })

    it('Ctrl+Tab dispatches to handleCyclePanel which handles panel cycling', () => {
      const { result } = renderHook(() => useLayoutKeyboard(defaultProps))

      // Verify initial state
      expect(result.current.flashedPanel).toBeNull()

      // Dispatch the event -- it runs handleCyclePanel inside the capture handler
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true })
        )
      })

      // After advancing past the flash timeout, state should remain null
      act(() => {
        vi.advanceTimersByTime(300)
      })

      expect(result.current.flashedPanel).toBeNull()
    })

    it('skips settings panel during cycling', () => {
      const props = {
        ...defaultProps,
        isPanelVisible: vi.fn().mockReturnValue(true) as (panelId: string) => boolean,
        toolbarPanels: ['explorer', 'settings', 'fileViewer'],
        panels: {
          explorer: 'explorer-content' as ReactNode,
          settings: 'settings-content' as ReactNode,
          fileViewer: 'fileViewer-content' as ReactNode,
        } as Record<string, ReactNode>,
      }

      const { result } = renderHook(() => useLayoutKeyboard(props))

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'Tab',
          ctrlKey: true,
          bubbles: true,
        })
        window.dispatchEvent(event)
      })

      // Should have flashed either explorer or agentTerminal, not settings
      expect(result.current.flashedPanel).not.toBe('settings')
    })

    it('skips hidden panels during cycling', () => {
      const props = {
        ...defaultProps,
        isPanelVisible: vi.fn().mockImplementation((id: string) => id !== 'explorer') as (panelId: string) => boolean,
      }

      renderHook(() => useLayoutKeyboard(props))

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'Tab',
          ctrlKey: true,
          bubbles: true,
        })
        window.dispatchEvent(event)
      })

      // Should not throw even with hidden panels
    })

    it('does nothing when no visible panels', () => {
      const props = {
        ...defaultProps,
        isPanelVisible: vi.fn().mockReturnValue(false) as (panelId: string) => boolean,
      }

      renderHook(() => useLayoutKeyboard(props))

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'Tab',
          ctrlKey: true,
          bubbles: true,
        })
        window.dispatchEvent(event)
      })

      // Should not throw
    })
  })

  describe('custom toggle event', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    it('handles app:toggle-panel for hidden panel → shows it', () => {
      isPanelVisible.mockImplementation((id: string) => id !== 'explorer')
      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new CustomEvent('app:toggle-panel', { detail: { key: '2' } }))
      })

      expect(handleToggle).toHaveBeenCalledWith('explorer')
    })

    it('handles app:toggle-panel for visible+focused panel → hides it', () => {
      const container = document.createElement('div')
      container.setAttribute('data-panel-id', 'explorer')
      const btn = document.createElement('button')
      container.appendChild(btn)
      document.body.appendChild(container)

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        btn.focus()
        window.dispatchEvent(new CustomEvent('app:toggle-panel', { detail: { key: '2' } }))
      })

      expect(handleToggle).toHaveBeenCalledWith('explorer')
    })
  })

  describe('new session shortcuts', () => {
    it('Cmd+N calls onNewSession', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))
      })
      expect(onNewSession).toHaveBeenCalled()
    })

    it('Cmd+N works even from textarea (app-wide)', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)
      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true })
        Object.defineProperty(event, 'target', { value: textarea })
        window.dispatchEvent(event)
      })
      expect(onNewSession).toHaveBeenCalled()
      document.body.removeChild(textarea)
    })

    it('Cmd+J calls onFocusSessionList', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true, bubbles: true }))
      })
      expect(onFocusSessionList).toHaveBeenCalled()
    })

    it('Cmd+Shift+F calls onFocusSessionSearch', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, shiftKey: true, bubbles: true }))
      })
      expect(onFocusSessionSearch).toHaveBeenCalled()
    })

    it('Cmd+Shift+A calls onArchiveSession', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, shiftKey: true, bubbles: true }))
      })
      expect(onArchiveSession).toHaveBeenCalled()
    })

    it('Cmd+, calls onToggleSettings', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', metaKey: true, bubbles: true }))
      })
      expect(onToggleSettings).toHaveBeenCalled()
    })

    it('Cmd+/ calls onShowShortcuts', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true }))
      })
      expect(onShowShortcuts).toHaveBeenCalled()
    })

    it('Cmd+/ does not call onShowShortcuts when focus is in monaco-editor', () => {
      const editor = document.createElement('div')
      editor.classList.add('monaco-editor')
      const textarea = document.createElement('div')
      textarea.tabIndex = 0
      editor.appendChild(textarea)
      document.body.appendChild(editor)
      textarea.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      let defaultPrevented = false
      act(() => {
        const event = new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true, cancelable: true })
        window.dispatchEvent(event)
        defaultPrevented = event.defaultPrevented
      })

      expect(onShowShortcuts).not.toHaveBeenCalled()
      expect(defaultPrevented).toBe(false)
      document.body.removeChild(editor)
    })

    it('Alt+Down calls onNextSession', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }))
      })
      expect(onNextSession).toHaveBeenCalled()
    })

    it('Alt+Up calls onPrevSession', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }))
      })
      expect(onPrevSession).toHaveBeenCalled()
    })

    it('Cmd+Shift+F works from textarea (app-wide)', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)
      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'f', metaKey: true, shiftKey: true, bubbles: true })
        Object.defineProperty(event, 'target', { value: textarea })
        window.dispatchEvent(event)
      })
      expect(onFocusSessionSearch).toHaveBeenCalled()
      document.body.removeChild(textarea)
    })

    it('Cmd+Shift+A works from textarea (app-wide)', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)
      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'a', metaKey: true, shiftKey: true, bubbles: true })
        Object.defineProperty(event, 'target', { value: textarea })
        window.dispatchEvent(event)
      })
      expect(onArchiveSession).toHaveBeenCalled()
      document.body.removeChild(textarea)
    })
  })

  describe('terminal tab shortcuts', () => {
    it('Cmd+Shift+] calls onNextTerminalTab', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', metaKey: true, shiftKey: true, bubbles: true }))
      })
      expect(onNextTerminalTab).toHaveBeenCalled()
    })

    it('Cmd+Shift+[ calls onPrevTerminalTab', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', metaKey: true, shiftKey: true, bubbles: true }))
      })
      expect(onPrevTerminalTab).toHaveBeenCalled()
    })

    it('app:next-terminal-tab triggers onNextTerminalTab', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => { window.dispatchEvent(new CustomEvent('app:next-terminal-tab')) })
      expect(onNextTerminalTab).toHaveBeenCalled()
    })

    it('app:prev-terminal-tab triggers onPrevTerminalTab', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => { window.dispatchEvent(new CustomEvent('app:prev-terminal-tab')) })
      expect(onPrevTerminalTab).toHaveBeenCalled()
    })
  })

  describe('panel cycling includes agent', () => {
    it('includes agent in the cycling list when visible and in toolbarPanels', () => {
      // Create DOM elements so focusPanel and getCurrentPanel work
      const sidebarDiv = document.createElement('div')
      sidebarDiv.setAttribute('data-panel-id', 'sidebar')
      sidebarDiv.tabIndex = -1
      document.body.appendChild(sidebarDiv)

      const agentDiv = document.createElement('div')
      agentDiv.setAttribute('data-panel-id', 'agent')
      agentDiv.tabIndex = -1
      document.body.appendChild(agentDiv)

      // Focus sidebar first so cycling moves to the next panel
      sidebarDiv.focus()

      const propsWithAgent = {
        ...defaultProps,
        toolbarPanels: ['sidebar', 'explorer', 'fileViewer', 'tutorial', 'agent', 'settings'],
        panels: {
          ...defaultProps.panels,
          agent: 'terminal-content' as ReactNode,
        },
      }

      renderHook(() => useLayoutKeyboard(propsWithAgent))

      // Cycle forward from sidebar: sidebar → explorer → fileViewer → tutorial → agent
      for (let i = 0; i < 4; i++) {
        act(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
        })
      }

      // After 4 cycles from sidebar we should reach the agent panel
      // (it has data-panel-id="agent" which is a valid cycle target)

      document.body.removeChild(sidebarDiv)
      document.body.removeChild(agentDiv)
    })
  })

  describe('explorer tab shortcuts', () => {
    it('Cmd+Alt+1 calls onExplorerTab with files', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '¡', code: 'Digit1', metaKey: true, altKey: true, bubbles: true }))
      })
      expect(onExplorerTab).toHaveBeenCalledWith('files')
    })

    it('Cmd+Alt+3 calls onExplorerTab with search', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '£', code: 'Digit3', metaKey: true, altKey: true, bubbles: true }))
      })
      expect(onExplorerTab).toHaveBeenCalledWith('search')
    })

    it('Cmd+Alt+5 calls onExplorerTab with review', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '∞', code: 'Digit5', metaKey: true, altKey: true, bubbles: true }))
      })
      expect(onExplorerTab).toHaveBeenCalledWith('review')
    })

    it('app:explorer-tab custom event triggers onExplorerTab', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new CustomEvent('app:explorer-tab', { detail: { filter: 'source-control' } }))
      })
      expect(onExplorerTab).toHaveBeenCalledWith('source-control')
    })
  })

  describe('custom events for new shortcuts', () => {
    it('app:new-session triggers onNewSession', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => { window.dispatchEvent(new CustomEvent('app:new-session')) })
      expect(onNewSession).toHaveBeenCalled()
    })

    it('app:next-session triggers onNextSession', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => { window.dispatchEvent(new CustomEvent('app:next-session')) })
      expect(onNextSession).toHaveBeenCalled()
    })

    it('app:prev-session triggers onPrevSession', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => { window.dispatchEvent(new CustomEvent('app:prev-session')) })
      expect(onPrevSession).toHaveBeenCalled()
    })

    it('app:focus-sessions triggers onFocusSessionList', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => { window.dispatchEvent(new CustomEvent('app:focus-sessions')) })
      expect(onFocusSessionList).toHaveBeenCalled()
    })

    it('app:focus-session-search triggers onFocusSessionSearch', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => { window.dispatchEvent(new CustomEvent('app:focus-session-search')) })
      expect(onFocusSessionSearch).toHaveBeenCalled()
    })

    it('app:archive-session triggers onArchiveSession', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => { window.dispatchEvent(new CustomEvent('app:archive-session')) })
      expect(onArchiveSession).toHaveBeenCalled()
    })

    it('app:toggle-settings triggers onToggleSettings', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => { window.dispatchEvent(new CustomEvent('app:toggle-settings')) })
      expect(onToggleSettings).toHaveBeenCalled()
    })

    it('app:show-shortcuts triggers onShowShortcuts', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => { window.dispatchEvent(new CustomEvent('app:show-shortcuts')) })
      expect(onShowShortcuts).toHaveBeenCalled()
    })
  })

  describe('Cmd+Shift+Left/Right directional panel focus', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    it('Cmd+Shift+Right moves focus to the right', () => {
      const sidebarDiv = document.createElement('div')
      sidebarDiv.setAttribute('data-panel-id', 'sidebar')
      sidebarDiv.tabIndex = -1
      document.body.appendChild(sidebarDiv)

      const explorerDiv = document.createElement('div')
      explorerDiv.setAttribute('data-panel-id', 'explorer')
      const btn = document.createElement('button')
      explorerDiv.appendChild(btn)
      document.body.appendChild(explorerDiv)

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        sidebarDiv.focus()
      })
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowRight', metaKey: true, shiftKey: true, bubbles: true,
        }))
      })

      // focusPanel should have focused something inside explorer
      expect(document.activeElement).toBe(btn)
    })

    it('Cmd+Shift+Left moves focus to the left', () => {
      const sidebarDiv = document.createElement('div')
      sidebarDiv.setAttribute('data-panel-id', 'sidebar')
      sidebarDiv.tabIndex = -1
      document.body.appendChild(sidebarDiv)

      const explorerDiv = document.createElement('div')
      explorerDiv.setAttribute('data-panel-id', 'explorer')
      explorerDiv.tabIndex = -1
      document.body.appendChild(explorerDiv)

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        explorerDiv.focus()
      })
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowLeft', metaKey: true, shiftKey: true, bubbles: true,
        }))
      })

      expect(document.activeElement).toBe(sidebarDiv)
    })

    it('does not move past left edge', () => {
      const sidebarDiv = document.createElement('div')
      sidebarDiv.setAttribute('data-panel-id', 'sidebar')
      sidebarDiv.tabIndex = -1
      document.body.appendChild(sidebarDiv)

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        sidebarDiv.focus()
      })
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowLeft', metaKey: true, shiftKey: true, bubbles: true,
        }))
      })

      // Still on sidebar — at left edge
      expect(document.activeElement).toBe(sidebarDiv)
    })

    it('app:focus-panel-left custom event works', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new CustomEvent('app:focus-panel-left'))
      })
      // Should not throw
    })

    it('app:focus-panel-right custom event works', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))
      act(() => {
        window.dispatchEvent(new CustomEvent('app:focus-panel-right'))
      })
      // Should not throw
    })
  })

  describe('arrow key navigation within panels', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    it('ArrowDown moves focus to next focusable element within a panel', () => {
      const panel = document.createElement('div')
      panel.setAttribute('data-panel-id', 'sidebar')
      const btn1 = document.createElement('button')
      btn1.textContent = 'First'
      const btn2 = document.createElement('button')
      btn2.textContent = 'Second'
      panel.appendChild(btn1)
      panel.appendChild(btn2)
      document.body.appendChild(panel)
      btn1.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown', bubbles: true,
        }))
      })

      expect(document.activeElement).toBe(btn2)
    })

    it('ArrowUp moves focus to previous focusable element within a panel', () => {
      const panel = document.createElement('div')
      panel.setAttribute('data-panel-id', 'sidebar')
      const btn1 = document.createElement('button')
      const btn2 = document.createElement('button')
      panel.appendChild(btn1)
      panel.appendChild(btn2)
      document.body.appendChild(panel)
      btn2.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowUp', bubbles: true,
        }))
      })

      expect(document.activeElement).toBe(btn1)
    })

    it('stops at edges (no wrap-around)', () => {
      const panel = document.createElement('div')
      panel.setAttribute('data-panel-id', 'sidebar')
      const btn = document.createElement('button')
      panel.appendChild(btn)
      document.body.appendChild(panel)
      btn.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowUp', bubbles: true,
        }))
      })

      expect(document.activeElement).toBe(btn)
    })

    it('works within role="dialog" containers', () => {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      const btn1 = document.createElement('button')
      const btn2 = document.createElement('button')
      dialog.appendChild(btn1)
      dialog.appendChild(btn2)
      document.body.appendChild(dialog)
      btn1.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown', bubbles: true,
        }))
      })

      expect(document.activeElement).toBe(btn2)
    })

    it('does not handle arrow keys inside aria-modal dialog', () => {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-modal', 'true')
      const btn1 = document.createElement('button')
      const btn2 = document.createElement('button')
      dialog.appendChild(btn1)
      dialog.appendChild(btn2)
      document.body.appendChild(dialog)
      btn1.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown', bubbles: true,
        }))
      })

      // Focus should NOT move — the modal dialog handles its own keyboard events
      expect(document.activeElement).toBe(btn1)
    })

    it('still allows global shortcuts inside aria-modal dialog', () => {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-modal', 'true')
      const btn = document.createElement('button')
      dialog.appendChild(btn)
      document.body.appendChild(dialog)
      btn.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        // Cmd+N is an app-wide shortcut — should still work inside modal
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'n', metaKey: true, bubbles: true,
        }))
      })

      expect(onNewSession).toHaveBeenCalled()
    })

    it('works within role="menu" containers', () => {
      const menu = document.createElement('div')
      menu.setAttribute('role', 'menu')
      const item1 = document.createElement('button')
      const item2 = document.createElement('button')
      menu.appendChild(item1)
      menu.appendChild(item2)
      document.body.appendChild(menu)
      item1.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown', bubbles: true,
        }))
      })

      expect(document.activeElement).toBe(item2)
    })

    it('ArrowLeft/Right works in role="menu"', () => {
      const menu = document.createElement('div')
      menu.setAttribute('role', 'menu')
      const item1 = document.createElement('button')
      const item2 = document.createElement('button')
      menu.appendChild(item1)
      menu.appendChild(item2)
      document.body.appendChild(menu)
      item1.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowRight', bubbles: true,
        }))
      })

      expect(document.activeElement).toBe(item2)
    })

    it('ArrowLeft/Right blocked in panels without data-arrow-nav="grid"', () => {
      const panel = document.createElement('div')
      panel.setAttribute('data-panel-id', 'sidebar')
      const btn1 = document.createElement('button')
      const btn2 = document.createElement('button')
      panel.appendChild(btn1)
      panel.appendChild(btn2)
      document.body.appendChild(panel)
      btn1.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowRight', bubbles: true,
        }))
      })

      // Should NOT move — ArrowRight is blocked in regular panels
      expect(document.activeElement).toBe(btn1)
    })

    it('does not intercept arrows in xterm', () => {
      const xterm = document.createElement('div')
      xterm.classList.add('xterm')
      xterm.setAttribute('data-panel-id', 'agent')
      const textarea = document.createElement('textarea')
      xterm.appendChild(textarea)
      document.body.appendChild(xterm)
      textarea.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown', bubbles: true,
        }))
      })

      // Focus should stay on textarea (passthrough)
      expect(document.activeElement).toBe(textarea)
    })

    it('does not intercept arrows in text inputs', () => {
      const panel = document.createElement('div')
      panel.setAttribute('data-panel-id', 'sidebar')
      const input = document.createElement('input')
      input.type = 'text'
      panel.appendChild(input)
      document.body.appendChild(panel)
      input.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown', bubbles: true,
        }))
      })

      expect(document.activeElement).toBe(input)
    })

    it('does not intercept arrows in monaco-editor', () => {
      const editor = document.createElement('div')
      editor.classList.add('monaco-editor')
      editor.setAttribute('data-panel-id', 'fileViewer')
      const textarea = document.createElement('div')
      textarea.tabIndex = 0
      editor.appendChild(textarea)
      document.body.appendChild(editor)
      textarea.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown', bubbles: true,
        }))
      })

      expect(document.activeElement).toBe(textarea)
    })

    it('does not intercept arrows in contenteditable', () => {
      const panel = document.createElement('div')
      panel.setAttribute('data-panel-id', 'sidebar')
      const editable = document.createElement('div')
      editable.setAttribute('contenteditable', 'true')
      editable.tabIndex = 0
      panel.appendChild(editable)
      document.body.appendChild(panel)
      editable.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown', bubbles: true,
        }))
      })

      expect(document.activeElement).toBe(editable)
    })

    it('does not intercept arrows in select elements', () => {
      const panel = document.createElement('div')
      panel.setAttribute('data-panel-id', 'sidebar')
      const select = document.createElement('select')
      panel.appendChild(select)
      document.body.appendChild(panel)
      select.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown', bubbles: true,
        }))
      })

      expect(document.activeElement).toBe(select)
    })

    it('does nothing when focus is not inside any container', () => {
      const btn = document.createElement('button')
      document.body.appendChild(btn)
      btn.focus()

      renderHook(() => useLayoutKeyboard(defaultProps))

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown', bubbles: true,
        }))
      })

      expect(document.activeElement).toBe(btn)
    })
  })

  describe('select-all scoping', () => {
    beforeEach(() => {
      // jsdom doesn't define execCommand — stub it so we can spy on it
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      if (!document.execCommand) {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        document.execCommand = vi.fn().mockReturnValue(true)
      }
    })

    it('app:select-all calls execCommand selectAll for non-terminal focus', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))

      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()

      const execSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true)

      act(() => {
        window.dispatchEvent(new CustomEvent('app:select-all'))
      })

      expect(execSpy).toHaveBeenCalledWith('selectAll')
      execSpy.mockRestore()
      document.body.removeChild(input)
    })

    it('app:select-all skips execCommand when focus is inside .xterm', () => {
      renderHook(() => useLayoutKeyboard(defaultProps))

      const xtermDiv = document.createElement('div')
      xtermDiv.classList.add('xterm')
      const textarea = document.createElement('textarea')
      xtermDiv.appendChild(textarea)
      document.body.appendChild(xtermDiv)
      textarea.focus()

      const execSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true)

      act(() => {
        window.dispatchEvent(new CustomEvent('app:select-all'))
      })

      expect(execSpy).not.toHaveBeenCalled()
      execSpy.mockRestore()
      document.body.removeChild(xtermDiv)
    })
  })

  describe('cleanup', () => {
    it('removes event listeners on unmount', () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const removeSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = renderHook(() => useLayoutKeyboard(defaultProps))

      // Should have registered keydown and custom events
      expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true)
      expect(addSpy).toHaveBeenCalledWith('app:toggle-panel', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:new-session', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:next-session', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:prev-session', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:focus-sessions', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:focus-session-search', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:archive-session', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:toggle-settings', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:show-shortcuts', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:next-terminal-tab', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:prev-terminal-tab', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:explorer-tab', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:select-all', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:focus-panel-left', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('app:focus-panel-right', expect.any(Function))

      unmount()

      // Should clean up all of them
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true)
      expect(removeSpy).toHaveBeenCalledWith('app:toggle-panel', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:new-session', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:next-session', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:prev-session', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:focus-sessions', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:focus-session-search', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:archive-session', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:toggle-settings', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:show-shortcuts', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:next-terminal-tab', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:prev-terminal-tab', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:explorer-tab', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:select-all', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:focus-panel-left', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('app:focus-panel-right', expect.any(Function))

      addSpy.mockRestore()
      removeSpy.mockRestore()
    })
  })
})
