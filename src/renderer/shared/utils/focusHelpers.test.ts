// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../../../test/react-setup'
import { sendAgentPrompt, focusAgentTerminal, focusActiveTerminal, focusSearchInput, setLastFocusedPanel, getLastFocusedPanel, clearLastFocusedPanel, focusPanel, focusAdjacentPanel, restoreSessionFocus } from './focusHelpers'
import { useSessionStore } from '../../store/sessions'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sendAgentPrompt', () => {
  it('writes prompt text and \\r as separate calls so agent treats Enter as a keypress', async () => {
    await sendAgentPrompt('pty-1', 'do something')

    expect(window.pty.write).toHaveBeenCalledTimes(2)
    expect(window.pty.write).toHaveBeenNthCalledWith(1, 'pty-1', 'do something')
    expect(window.pty.write).toHaveBeenNthCalledWith(2, 'pty-1', '\r')
  })
})

describe('focusAgentTerminal', () => {
  it('switches to agent tab and schedules focus via double-rAF', () => {
    const mockSetActiveTerminalTab = vi.fn()
    useSessionStore.setState({
      activeSessionId: 'session-1',
      setActiveTerminalTab: mockSetActiveTerminalTab,
    })

    const rAFs: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rAFs.push(cb)
      return rAFs.length
    })

    focusAgentTerminal()

    expect(mockSetActiveTerminalTab).toHaveBeenCalledWith('session-1', '__agent__')
    expect(rAFs).toHaveLength(1)

    // Trigger first rAF → second rAF
    rAFs[0](0)
    expect(rAFs).toHaveLength(2)

    // Trigger second rAF — no terminal panel in JSDOM, but no error
    rAFs[1](0)
  })

  it('focuses textarea when terminal panel exists in DOM', () => {
    useSessionStore.setState({
      activeSessionId: 'session-1',
      setActiveTerminalTab: vi.fn(),
    })

    // Create the DOM elements
    const panel = document.createElement('div')
    panel.setAttribute('data-panel-id', 'agent')
    const textarea = document.createElement('textarea')
    textarea.className = 'xterm-helper-textarea'
    panel.appendChild(textarea)
    document.body.appendChild(panel)
    const focusSpy = vi.spyOn(textarea, 'focus')

    const rAFs: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rAFs.push(cb)
      return rAFs.length
    })

    focusAgentTerminal()
    rAFs[0](0) // first rAF
    rAFs[1](0) // second rAF — should focus textarea

    expect(focusSpy).toHaveBeenCalled()
    document.body.removeChild(panel)
  })

  it('leaves focus in a modal dialog that opened before the focus ran', () => {
    useSessionStore.setState({ activeSessionId: 'session-1', setActiveTerminalTab: vi.fn() })
    const panel = document.createElement('div')
    panel.setAttribute('data-panel-id', 'agent')
    const textarea = document.createElement('textarea')
    textarea.className = 'xterm-helper-textarea'
    panel.appendChild(textarea)
    document.body.appendChild(panel)
    const focusSpy = vi.spyOn(textarea, 'focus')

    const rAFs: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rAFs.push(cb)
      return rAFs.length
    })

    focusAgentTerminal()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    document.body.appendChild(dialog)
    rAFs[0](0)
    rAFs[1](0)

    expect(focusSpy).not.toHaveBeenCalled()
    document.body.innerHTML = ''
  })

  it('does not set tab when no active session', () => {
    const mockSetActiveTerminalTab = vi.fn()
    useSessionStore.setState({
      activeSessionId: null,
      setActiveTerminalTab: mockSetActiveTerminalTab,
    })

    focusAgentTerminal()
    expect(mockSetActiveTerminalTab).not.toHaveBeenCalled()
  })
})

describe('focusActiveTerminal', () => {
  it('schedules focus via double-rAF without switching tabs', () => {
    const mockSetActiveTerminalTab = vi.fn()
    useSessionStore.setState({
      activeSessionId: 'session-1',
      setActiveTerminalTab: mockSetActiveTerminalTab,
    })

    const rAFs: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rAFs.push(cb)
      return rAFs.length
    })

    focusActiveTerminal()

    // Should NOT switch tabs
    expect(mockSetActiveTerminalTab).not.toHaveBeenCalled()
    expect(rAFs).toHaveLength(1)

    // Trigger first rAF → second rAF
    rAFs[0](0)
    expect(rAFs).toHaveLength(2)

    // Trigger second rAF — no terminal panel in JSDOM, but no error
    rAFs[1](0)
  })

  it('focuses the agent panel, unless a modal dialog opened before the focus ran', () => {
    const panel = document.createElement('div')
    panel.setAttribute('data-panel-id', 'agent')
    const button = document.createElement('button')
    panel.appendChild(button)
    document.body.appendChild(panel)

    const rAFs: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rAFs.push(cb)
      return rAFs.length
    })

    focusActiveTerminal()
    rAFs[0](0)
    rAFs[1](0)
    expect(document.activeElement).toBe(button)

    button.blur()
    focusActiveTerminal()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    document.body.appendChild(dialog)
    rAFs[2](0)
    rAFs[3](0)
    expect(document.activeElement).not.toBe(button)
    document.body.innerHTML = ''
  })
})

describe('per-session focus tracking', () => {
  beforeEach(() => {
    clearLastFocusedPanel('s1')
    clearLastFocusedPanel('s2')
  })

  it('defaults to agent when no panel has been tracked', () => {
    expect(getLastFocusedPanel('unknown')).toBe('agent')
  })

  it('stores and retrieves last focused panel per session', () => {
    setLastFocusedPanel('s1', 'explorer')
    setLastFocusedPanel('s2', 'fileViewer')
    expect(getLastFocusedPanel('s1')).toBe('explorer')
    expect(getLastFocusedPanel('s2')).toBe('fileViewer')
  })

  it('clears tracking for a session', () => {
    setLastFocusedPanel('s1', 'explorer')
    clearLastFocusedPanel('s1')
    expect(getLastFocusedPanel('s1')).toBe('agent')
  })
})

describe('focusPanel', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('does nothing when panel container is not in DOM', () => {
    focusPanel('nonexistent')
    // No error thrown
  })

  it('focuses xterm textarea when focus succeeds', () => {
    const panel = document.createElement('div')
    panel.setAttribute('data-panel-id', 'agent')
    const textarea = document.createElement('textarea')
    textarea.className = 'xterm-helper-textarea'
    panel.appendChild(textarea)
    document.body.appendChild(panel)

    focusPanel('agent')
    expect(document.activeElement).toBe(textarea)
  })

  it('skips xterm textareas that reject focus and falls through to Monaco', () => {
    const panel = document.createElement('div')
    panel.setAttribute('data-panel-id', 'agent')
    // Xterm textarea that rejects focus (simulate visibility:hidden behavior)
    const hiddenTa = document.createElement('textarea')
    hiddenTa.className = 'xterm-helper-textarea'
    vi.spyOn(hiddenTa, 'focus').mockImplementation(() => {
      // Simulate browser behavior: focus() on visibility:hidden element is a no-op
    })
    panel.appendChild(hiddenTa)
    // Monaco textarea
    const monacoTa = document.createElement('textarea')
    monacoTa.className = 'inputarea'
    panel.appendChild(monacoTa)
    document.body.appendChild(panel)

    focusPanel('agent')
    expect(document.activeElement).toBe(monacoTa)
  })

  it('falls through to generic focusable when no xterm or Monaco', () => {
    const panel = document.createElement('div')
    panel.setAttribute('data-panel-id', 'explorer')
    const button = document.createElement('button')
    button.textContent = 'Click'
    panel.appendChild(button)
    document.body.appendChild(panel)

    focusPanel('explorer')
    expect(document.activeElement).toBe(button)
  })

  it('focuses container as last resort', () => {
    const panel = document.createElement('div')
    panel.setAttribute('data-panel-id', 'sidebar')
    panel.tabIndex = -1
    document.body.appendChild(panel)

    focusPanel('sidebar')
    expect(document.activeElement).toBe(panel)
  })
})

describe('restoreSessionFocus', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    clearLastFocusedPanel('s1')
  })

  it('restores focus to the last focused panel via double-rAF', () => {
    setLastFocusedPanel('s1', 'explorer')
    const panel = document.createElement('div')
    panel.setAttribute('data-panel-id', 'explorer')
    const button = document.createElement('button')
    panel.appendChild(button)
    document.body.appendChild(panel)

    const rAFs: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rAFs.push(cb)
      return rAFs.length
    })

    restoreSessionFocus('s1')
    rAFs[0](0)
    rAFs[1](0)

    expect(document.activeElement).toBe(button)
  })

  it('leaves focus in a modal dialog that opened before the restore ran', () => {
    setLastFocusedPanel('s1', 'explorer')
    const panel = document.createElement('div')
    panel.setAttribute('data-panel-id', 'explorer')
    panel.appendChild(document.createElement('button'))
    document.body.appendChild(panel)

    const rAFs: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rAFs.push(cb)
      return rAFs.length
    })

    restoreSessionFocus('s1')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.tabIndex = -1
    document.body.appendChild(dialog)
    dialog.focus()
    rAFs[0](0)
    rAFs[1](0)

    expect(document.activeElement).toBe(dialog)
  })

  it('defaults to terminal when no panel was tracked', () => {
    const rAFs: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rAFs.push(cb)
      return rAFs.length
    })

    restoreSessionFocus('unknown-session')
    rAFs[0](0)
    rAFs[1](0)
    // No error — terminal panel not in DOM so focusPanel is a no-op
  })
})

describe('focusAdjacentPanel', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('focuses the next panel to the right', () => {
    const sidebarDiv = document.createElement('div')
    sidebarDiv.setAttribute('data-panel-id', 'sidebar')
    sidebarDiv.tabIndex = -1
    document.body.appendChild(sidebarDiv)

    const explorerDiv = document.createElement('div')
    explorerDiv.setAttribute('data-panel-id', 'explorer')
    const btn = document.createElement('button')
    explorerDiv.appendChild(btn)
    document.body.appendChild(explorerDiv)

    sidebarDiv.focus()

    const result = focusAdjacentPanel('right', ['sidebar', 'explorer'], () => 'sidebar')
    expect(result).toBe('explorer')
  })

  it('focuses the next panel to the left', () => {
    const sidebarDiv = document.createElement('div')
    sidebarDiv.setAttribute('data-panel-id', 'sidebar')
    sidebarDiv.tabIndex = -1
    document.body.appendChild(sidebarDiv)

    const explorerDiv = document.createElement('div')
    explorerDiv.setAttribute('data-panel-id', 'explorer')
    explorerDiv.tabIndex = -1
    document.body.appendChild(explorerDiv)

    explorerDiv.focus()

    const result = focusAdjacentPanel('left', ['sidebar', 'explorer'], () => 'explorer')
    expect(result).toBe('sidebar')
  })

  it('returns null at left edge', () => {
    const result = focusAdjacentPanel('left', ['sidebar', 'explorer'], () => 'sidebar')
    expect(result).toBeNull()
  })

  it('returns null at right edge', () => {
    const result = focusAdjacentPanel('right', ['sidebar', 'explorer'], () => 'explorer')
    expect(result).toBeNull()
  })

  it('returns null for empty panel list', () => {
    const result = focusAdjacentPanel('right', [], () => null)
    expect(result).toBeNull()
  })

  it('handles no current panel — right focuses first', () => {
    const sidebarDiv = document.createElement('div')
    sidebarDiv.setAttribute('data-panel-id', 'sidebar')
    sidebarDiv.tabIndex = -1
    document.body.appendChild(sidebarDiv)

    const result = focusAdjacentPanel('right', ['sidebar', 'explorer'], () => null)
    expect(result).toBe('sidebar')
  })

  it('handles no current panel — left focuses last', () => {
    const explorerDiv = document.createElement('div')
    explorerDiv.setAttribute('data-panel-id', 'explorer')
    explorerDiv.tabIndex = -1
    document.body.appendChild(explorerDiv)

    const result = focusAdjacentPanel('left', ['sidebar', 'explorer'], () => null)
    expect(result).toBe('explorer')
  })
})

describe('focusSearchInput', () => {
  it('schedules focus via requestAnimationFrame', () => {
    const rAFs: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rAFs.push(cb)
      return rAFs.length
    })

    focusSearchInput()
    expect(rAFs).toHaveLength(1)

    // Trigger — no matching element in JSDOM, but no error
    rAFs[0](0)
  })
})
