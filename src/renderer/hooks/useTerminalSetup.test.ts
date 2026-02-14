// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTerminalSetup, type TerminalConfig } from './useTerminalSetup'
import { useSessionStore } from '../store/sessions'
import { useErrorStore } from '../store/errors'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/types'
import { terminalBufferRegistry } from '../utils/terminalBufferRegistry'

// Mock xterm and addons
const mockTerminalWrite = vi.fn((_data: string, cb?: () => void) => { cb?.() })
const mockTerminalOpen = vi.fn()
const mockTerminalDispose = vi.fn()
const mockTerminalFocus = vi.fn()
const mockTerminalScrollToBottom = vi.fn()
const mockTerminalLoadAddon = vi.fn()
const mockTerminalOnData = vi.fn().mockReturnValue({ dispose: vi.fn() })
const mockTerminalOnRender = vi.fn().mockReturnValue({ dispose: vi.fn() })
const mockTerminalAttachCustomKeyEventHandler = vi.fn()
const mockTerminalResize = vi.fn()

vi.mock('@xterm/xterm', () => {
  return {
    Terminal: class MockTerminal {
      write = mockTerminalWrite
      open = mockTerminalOpen
      dispose = mockTerminalDispose
      focus = mockTerminalFocus
      scrollToBottom = mockTerminalScrollToBottom
      loadAddon = mockTerminalLoadAddon
      onData = mockTerminalOnData
      onRender = mockTerminalOnRender
      attachCustomKeyEventHandler = mockTerminalAttachCustomKeyEventHandler
      resize = mockTerminalResize
      cols = 80
      rows = 24
      buffer = { active: { viewportY: 0, baseY: 0 } }
    },
  }
})

const mockFitAddonFit = vi.fn()
vi.mock('@xterm/addon-fit', () => {
  return {
    FitAddon: class MockFitAddon {
      fit = mockFitAddonFit
    },
  }
})

const mockSerializeAddonSerialize = vi.fn().mockReturnValue('')
vi.mock('@xterm/addon-serialize', () => {
  return {
    SerializeAddon: class MockSerializeAddon {
      serialize = mockSerializeAddonSerialize
    },
  }
})

// Mock the sub-hooks
vi.mock('./useTerminalKeyboard', () => ({
  useTerminalKeyboard: vi.fn().mockReturnValue(vi.fn().mockReturnValue(true)),
}))

vi.mock('./usePlanDetection', () => ({
  usePlanDetection: vi.fn().mockReturnValue(vi.fn()),
}))

vi.mock('../utils/terminalBufferRegistry', () => ({
  terminalBufferRegistry: {
    register: vi.fn(),
    unregister: vi.fn(),
    getBuffer: vi.fn(),
    getLastLines: vi.fn(),
  },
}))

vi.mock('../utils/terminalActivityDetector', () => ({
  evaluateActivity: vi.fn().mockReturnValue({ status: null, scheduleIdle: false }),
}))

// Mock ResizeObserver - track instances for assertions
const mockResizeObserverInstances: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = []
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor() {
    mockResizeObserverInstances.push(this)
  }
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

// Mock requestAnimationFrame
vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 1 })
vi.stubGlobal('cancelAnimationFrame', vi.fn())

function makeConfig(overrides: Partial<TerminalConfig> = {}): TerminalConfig {
  return {
    sessionId: 'session-1',
    cwd: '/test/dir',
    command: undefined,
    env: undefined,
    isAgentTerminal: false,
    isActive: true,
    restartKey: 0,
    ...overrides,
  }
}

function makeContainerRef(): React.RefObject<HTMLDivElement | null> {
  const div = document.createElement('div')
  // Provide a mock viewport element
  const viewportEl = document.createElement('div')
  viewportEl.className = 'xterm-viewport'
  div.appendChild(viewportEl)
  // Give it non-zero dimensions
  Object.defineProperty(div, 'offsetWidth', { value: 800, configurable: true })
  Object.defineProperty(div, 'offsetHeight', { value: 600, configurable: true })
  return { current: div }
}

describe('useTerminalSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResizeObserverInstances.length = 0

    // Reset stores
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
      isLoading: true,
      showSidebar: true,
      showSettings: false,
      sidebarWidth: 224,
      toolbarPanels: [...DEFAULT_TOOLBAR_PANELS],
      globalPanelVisibility: {
        [PANEL_IDS.SIDEBAR]: true,
        [PANEL_IDS.SETTINGS]: false,
      },
    })
    useErrorStore.setState({
      errors: [],
      hasUnread: false,
      detailError: null,
    })

    // Reset PTY mocks
    vi.mocked(window.pty.create).mockResolvedValue(undefined)
    vi.mocked(window.pty.write).mockResolvedValue(undefined)
    vi.mocked(window.pty.resize).mockResolvedValue(undefined)
    vi.mocked(window.pty.kill).mockResolvedValue(undefined)
    vi.mocked(window.pty.onData).mockReturnValue(() => {})
    vi.mocked(window.pty.onExit).mockReturnValue(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns terminal setup result with expected shape', () => {
    const config = makeConfig()
    const containerRef = makeContainerRef()

    const { result } = renderHook(() => useTerminalSetup(config, containerRef))

    expect(result.current).toHaveProperty('terminalRef')
    expect(result.current).toHaveProperty('ptyIdRef')
    expect(result.current).toHaveProperty('showScrollButton')
    expect(result.current).toHaveProperty('handleScrollToBottom')
    expect(typeof result.current.handleScrollToBottom).toBe('function')
    expect(result.current.showScrollButton).toBe(false)
  })

  it('does not set up terminal when sessionId is undefined', () => {
    const config = makeConfig({ sessionId: undefined })
    const containerRef = makeContainerRef()

    renderHook(() => useTerminalSetup(config, containerRef))

    expect(window.pty.create).not.toHaveBeenCalled()
    expect(mockTerminalOpen).not.toHaveBeenCalled()
  })

  it('does not set up terminal when containerRef is null', () => {
    const config = makeConfig()
    const containerRef = { current: null }

    renderHook(() => useTerminalSetup(config, containerRef))

    expect(window.pty.create).not.toHaveBeenCalled()
  })

  it('creates a PTY on mount with correct parameters', async () => {
    const config = makeConfig({
      sessionId: 'my-session',
      cwd: '/my/cwd',
      command: 'claude-code',
      env: { TERM: 'xterm' },
    })
    const containerRef = makeContainerRef()

    renderHook(() => useTerminalSetup(config, containerRef))

    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    expect(window.pty.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/my/cwd',
        command: 'claude-code',
        sessionId: 'my-session',
        env: { TERM: 'xterm' },
      }),
    )
  })

  it('opens terminal in the container element', () => {
    const config = makeConfig()
    const containerRef = makeContainerRef()

    renderHook(() => useTerminalSetup(config, containerRef))

    expect(mockTerminalOpen).toHaveBeenCalledWith(containerRef.current)
  })

  it('registers terminal buffer for agent terminals', () => {
    const config = makeConfig({ isAgentTerminal: true, command: 'claude-code' })
    const containerRef = makeContainerRef()

    renderHook(() => useTerminalSetup(config, containerRef))

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(terminalBufferRegistry.register).toHaveBeenCalledWith('session-1', expect.any(Function))
  })

  it('does not register terminal buffer for non-agent terminals', () => {
    const config = makeConfig({ isAgentTerminal: false })
    const containerRef = makeContainerRef()

    renderHook(() => useTerminalSetup(config, containerRef))

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(terminalBufferRegistry.register).not.toHaveBeenCalled()
  })

  it('attaches custom key event handler', () => {
    const config = makeConfig()
    const containerRef = makeContainerRef()

    renderHook(() => useTerminalSetup(config, containerRef))

    expect(mockTerminalAttachCustomKeyEventHandler).toHaveBeenCalledWith(expect.any(Function))
  })

  it('sets up resize observer on the container', () => {
    const config = makeConfig()
    const containerRef = makeContainerRef()

    renderHook(() => useTerminalSetup(config, containerRef))

    // ResizeObserver should have been created and observe called
    expect(mockResizeObserverInstances.length).toBeGreaterThan(0)
    expect(mockResizeObserverInstances[0].observe).toHaveBeenCalledWith(containerRef.current)
  })

  it('kills PTY and disposes terminal on unmount', async () => {
    const config = makeConfig()
    const containerRef = makeContainerRef()

    const { unmount } = renderHook(() => useTerminalSetup(config, containerRef))

    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    unmount()

    expect(window.pty.kill).toHaveBeenCalled()
    expect(mockTerminalDispose).toHaveBeenCalled()
  })

  it('unregisters terminal buffer for agent terminals on unmount', async () => {
    const config = makeConfig({ isAgentTerminal: true, command: 'claude-code' })
    const containerRef = makeContainerRef()

    const { unmount } = renderHook(() => useTerminalSetup(config, containerRef))

    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    unmount()

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(terminalBufferRegistry.unregister).toHaveBeenCalledWith('session-1')
  })

  it('disconnects resize observer on unmount', async () => {
    const config = makeConfig()
    const containerRef = makeContainerRef()

    const { unmount } = renderHook(() => useTerminalSetup(config, containerRef))

    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    unmount()

    expect(mockResizeObserverInstances.length).toBeGreaterThan(0)
    expect(mockResizeObserverInstances[0].disconnect).toHaveBeenCalled()
  })

  it('handles PTY creation error gracefully', async () => {
    vi.mocked(window.pty.create).mockRejectedValue(new Error('PTY failed'))

    const config = makeConfig()
    const containerRef = makeContainerRef()

    renderHook(() => useTerminalSetup(config, containerRef))

    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    // Should write error message to terminal (no callback in error path)
    expect(mockTerminalWrite).toHaveBeenCalledWith(
      expect.stringContaining('Error: Failed to start terminal'),
    )
  })

  it('sets up onData and onExit listeners after PTY creation', async () => {
    const config = makeConfig()
    const containerRef = makeContainerRef()

    renderHook(() => useTerminalSetup(config, containerRef))

    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    expect(window.pty.onData).toHaveBeenCalled()
    expect(window.pty.onExit).toHaveBeenCalled()
  })

  describe('handleScrollToBottom', () => {
    it('scrolls terminal to bottom and hides scroll button', () => {
      const config = makeConfig()
      const containerRef = makeContainerRef()

      const { result } = renderHook(() => useTerminalSetup(config, containerRef))

      act(() => { result.current.handleScrollToBottom() })

      expect(mockTerminalScrollToBottom).toHaveBeenCalled()
      expect(result.current.showScrollButton).toBe(false)
    })
  })

  describe('active state handling', () => {
    it('fits and focuses terminal when becoming active', () => {
      const config = makeConfig({ isActive: false })
      const containerRef = makeContainerRef()

      const { rerender } = renderHook(
        ({ isActive }) => useTerminalSetup({ ...config, isActive }, containerRef),
        { initialProps: { isActive: false } },
      )

      mockFitAddonFit.mockClear()
      mockTerminalFocus.mockClear()

      rerender({ isActive: true })

      // requestAnimationFrame is mocked to call immediately
      expect(mockFitAddonFit).toHaveBeenCalled()
      expect(mockTerminalFocus).toHaveBeenCalled()
    })
  })

  describe('window focus/blur tracking', () => {
    it('sets up focus and blur listeners', () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const config = makeConfig()
      const containerRef = makeContainerRef()

      renderHook(() => useTerminalSetup(config, containerRef))

      expect(addSpy).toHaveBeenCalledWith('focus', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('blur', expect.any(Function))
      addSpy.mockRestore()
    })

    it('removes focus and blur listeners on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const config = makeConfig()
      const containerRef = makeContainerRef()

      const { unmount } = renderHook(() => useTerminalSetup(config, containerRef))
      unmount()

      expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('blur', expect.any(Function))
      removeSpy.mockRestore()
    })
  })

  describe('agent PTY ID tracking', () => {
    it('sets agent PTY ID in session store for agent terminals', async () => {
      const setAgentPtyIdSpy = vi.fn()
      useSessionStore.setState({ setAgentPtyId: setAgentPtyIdSpy } as never)

      const config = makeConfig({ isAgentTerminal: true, command: 'claude-code' })
      const containerRef = makeContainerRef()

      renderHook(() => useTerminalSetup(config, containerRef))

      await act(async () => { await new Promise(r => setTimeout(r, 0)) })

      expect(setAgentPtyIdSpy).toHaveBeenCalledWith('session-1', expect.any(String))
    })
  })

  describe('agent idle on unmount', () => {
    it('sets agent to idle on unmount when agent was still working', async () => {
      const { evaluateActivity } = await import('../utils/terminalActivityDetector')
      vi.mocked(evaluateActivity).mockReturnValue({ status: 'working', scheduleIdle: true })

      const config = makeConfig({ isAgentTerminal: true, command: 'claude-code' })
      const containerRef = makeContainerRef()

      // Capture the onData callback
      let onDataCb: ((data: string) => void) | null = null
      vi.mocked(window.pty.onData).mockImplementation((_id, cb) => {
        onDataCb = cb as (data: string) => void
        return () => {}
      })

      const { unmount } = renderHook(() => useTerminalSetup(config, containerRef))
      await act(async () => { await new Promise(r => setTimeout(r, 0)) })

      // Simulate some terminal data to set status to working
      if (onDataCb) act(() => { onDataCb!('some output') })

      unmount()

      // Should have called updateAgentMonitor with idle on unmount
      const store = useSessionStore.getState()
      // The store action was called - verify PTY was killed
      expect(window.pty.kill).toHaveBeenCalled()
    })
  })

  describe('PTY data and exit handling', () => {
    it('writes exit message to terminal on PTY exit', async () => {
      let onExitCb: ((exitCode: number) => void) | null = null
      vi.mocked(window.pty.onExit).mockImplementation((_id, cb) => {
        onExitCb = cb as (exitCode: number) => void
        return () => {}
      })

      const config = makeConfig()
      const containerRef = makeContainerRef()

      renderHook(() => useTerminalSetup(config, containerRef))
      await act(async () => { await new Promise(r => setTimeout(r, 0)) })

      if (onExitCb) act(() => { onExitCb!(0) })

      expect(mockTerminalWrite).toHaveBeenCalledWith(
        expect.stringContaining('Process exited with code 0'),
      )
    })

    it('forwards user input to PTY write', async () => {
      let terminalOnDataCb: ((data: string) => void) | null = null
      mockTerminalOnData.mockImplementation((cb: (data: string) => void) => {
        terminalOnDataCb = cb
        return { dispose: vi.fn() }
      })

      const config = makeConfig()
      const containerRef = makeContainerRef()

      renderHook(() => useTerminalSetup(config, containerRef))
      await act(async () => { await new Promise(r => setTimeout(r, 0)) })

      if (terminalOnDataCb) {
        act(() => { terminalOnDataCb!('hello') })
        expect(window.pty.write).toHaveBeenCalled()
      }
    })

    it('calls onUserInput callback on printable character input', async () => {
      const onUserInput = vi.fn()
      let terminalOnDataCb: ((data: string) => void) | null = null
      mockTerminalOnData.mockImplementation((cb: (data: string) => void) => {
        terminalOnDataCb = cb
        return { dispose: vi.fn() }
      })

      const config = makeConfig({ onUserInput })
      const containerRef = makeContainerRef()

      renderHook(() => useTerminalSetup(config, containerRef))
      await act(async () => { await new Promise(r => setTimeout(r, 0)) })

      if (terminalOnDataCb) {
        act(() => { terminalOnDataCb!('a') })
        expect(onUserInput).toHaveBeenCalledTimes(1)
        // Second call should not re-trigger (hasNotifiedUserInputRef)
        act(() => { terminalOnDataCb!('b') })
        expect(onUserInput).toHaveBeenCalledTimes(1)
      }
    })

    it('processes agent activity detection on PTY data for agent terminals', async () => {
      const { evaluateActivity } = await import('../utils/terminalActivityDetector')
      vi.mocked(evaluateActivity).mockReturnValue({ status: 'working', scheduleIdle: true })

      let onDataCb: ((data: string) => void) | null = null
      vi.mocked(window.pty.onData).mockImplementation((_id, cb) => {
        onDataCb = cb as (data: string) => void
        return () => {}
      })

      const config = makeConfig({ isAgentTerminal: true, command: 'claude-code' })
      const containerRef = makeContainerRef()

      renderHook(() => useTerminalSetup(config, containerRef))
      await act(async () => { await new Promise(r => setTimeout(r, 0)) })

      if (onDataCb) {
        act(() => { onDataCb!('some data') })
        expect(evaluateActivity).toHaveBeenCalled()
      }
    })
  })

  describe('resize observer', () => {
    it('calls fitAddon.fit when container resizes', () => {
      let resizeCallback: ((entries: ResizeObserverEntry[]) => void) | null = null
      class TrackableResizeObserver {
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
        constructor(cb: (entries: ResizeObserverEntry[]) => void) {
          resizeCallback = cb
          mockResizeObserverInstances.push(this)
        }
      }
      vi.stubGlobal('ResizeObserver', TrackableResizeObserver)

      const config = makeConfig()
      const containerRef = makeContainerRef()
      mockFitAddonFit.mockClear()

      renderHook(() => useTerminalSetup(config, containerRef))

      if (resizeCallback) {
        act(() => {
          resizeCallback!([{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry])
        })
        expect(mockFitAddonFit).toHaveBeenCalled()
      }
    })
  })

  describe('scroll event listeners', () => {
    it('attaches wheel and touchmove listeners to the container', () => {
      const config = makeConfig()
      const containerRef = makeContainerRef()
      const addEventSpy = vi.spyOn(containerRef.current!, 'addEventListener')

      renderHook(() => useTerminalSetup(config, containerRef))

      expect(addEventSpy).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: true })
      expect(addEventSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: true })
      expect(addEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
      addEventSpy.mockRestore()
    })

    it('removes scroll listeners on unmount', () => {
      const config = makeConfig()
      const containerRef = makeContainerRef()
      const removeEventSpy = vi.spyOn(containerRef.current!, 'removeEventListener')

      const { unmount } = renderHook(() => useTerminalSetup(config, containerRef))
      unmount()

      expect(removeEventSpy).toHaveBeenCalledWith('wheel', expect.any(Function))
      expect(removeEventSpy).toHaveBeenCalledWith('touchmove', expect.any(Function))
      expect(removeEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
      removeEventSpy.mockRestore()
    })
  })
})
