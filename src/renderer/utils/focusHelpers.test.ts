// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../../test/react-setup'
import { sendAgentPrompt, focusAgentTerminal, focusActiveTerminal, focusSearchInput } from './focusHelpers'
import { useSessionStore } from '../store/sessions'

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
