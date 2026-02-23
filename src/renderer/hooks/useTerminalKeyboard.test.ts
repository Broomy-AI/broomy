// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTerminalKeyboard } from './useTerminalKeyboard'

describe('useTerminalKeyboard', () => {
  let ptyIdRef: React.MutableRefObject<string | null>

  beforeEach(() => {
    vi.clearAllMocks()
    ptyIdRef = { current: 'test-pty-id' }
  })

  function makeKeyEvent(overrides: Partial<KeyboardEvent> & { key: string; type?: string }): KeyboardEvent {
    const { key, metaKey, ctrlKey, shiftKey, altKey, ...rest } = overrides
    const event = {
      type: 'keydown',
      key,
      metaKey: metaKey ?? false,
      ctrlKey: ctrlKey ?? false,
      shiftKey: shiftKey ?? false,
      altKey: altKey ?? false,
      ...rest,
    } as KeyboardEvent
    return event
  }

  it('returns a function', () => {
    const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
    expect(typeof result.current).toBe('function')
  })

  describe('Ctrl+Tab', () => {
    it('returns false for Ctrl+Tab (preventing xterm from handling it)', () => {
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'Tab', ctrlKey: true })
      expect(result.current(event)).toBe(false)
    })
  })

  describe('Shift+Enter', () => {
    it('writes escape sequence on keydown and returns false', () => {
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'Enter', shiftKey: true, type: 'keydown' })
      const handled = result.current(event)

      expect(handled).toBe(false)
      expect(window.pty.write).toHaveBeenCalledWith('test-pty-id', '\x1b[13;2u')
    })

    it('does not write on keyup and returns false', () => {
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'Enter', shiftKey: true, type: 'keyup' })
      const handled = result.current(event)

      expect(handled).toBe(false)
      expect(window.pty.write).not.toHaveBeenCalled()
    })

    it('does not write when ptyId is null', () => {
      ptyIdRef.current = null
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'Enter', shiftKey: true, type: 'keydown' })
      result.current(event)

      expect(window.pty.write).not.toHaveBeenCalled()
    })
  })

  describe('Cmd+ArrowLeft (home)', () => {
    it('writes Ctrl-A escape on keydown and returns false', () => {
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'ArrowLeft', metaKey: true, type: 'keydown' })
      const handled = result.current(event)

      expect(handled).toBe(false)
      expect(window.pty.write).toHaveBeenCalledWith('test-pty-id', '\x01')
    })

    it('does not write on keyup', () => {
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'ArrowLeft', metaKey: true, type: 'keyup' })
      result.current(event)

      expect(window.pty.write).not.toHaveBeenCalled()
    })

    it('does not write when ptyId is null', () => {
      ptyIdRef.current = null
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'ArrowLeft', metaKey: true, type: 'keydown' })
      result.current(event)

      expect(window.pty.write).not.toHaveBeenCalled()
    })
  })

  describe('Cmd+ArrowRight (end)', () => {
    it('writes Ctrl-E escape on keydown and returns false', () => {
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'ArrowRight', metaKey: true, type: 'keydown' })
      const handled = result.current(event)

      expect(handled).toBe(false)
      expect(window.pty.write).toHaveBeenCalledWith('test-pty-id', '\x05')
    })

    it('does not write on keyup', () => {
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'ArrowRight', metaKey: true, type: 'keyup' })
      result.current(event)

      expect(window.pty.write).not.toHaveBeenCalled()
    })
  })

  describe('Cmd+Backspace (kill line)', () => {
    it('writes Ctrl-U escape on keydown and returns false', () => {
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'Backspace', metaKey: true, type: 'keydown' })
      const handled = result.current(event)

      expect(handled).toBe(false)
      expect(window.pty.write).toHaveBeenCalledWith('test-pty-id', '\x15')
    })

    it('does not write when ptyId is null', () => {
      ptyIdRef.current = null
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'Backspace', metaKey: true, type: 'keydown' })
      result.current(event)

      expect(window.pty.write).not.toHaveBeenCalled()
    })

    it('does not handle Cmd+Backspace on keyup (returns true for non-keydown)', () => {
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      // For non-keydown events, the handler returns true before reaching the Backspace check
      const event = makeKeyEvent({ key: 'Backspace', metaKey: true, type: 'keyup' })
      const handled = result.current(event)

      expect(handled).toBe(true)
      expect(window.pty.write).not.toHaveBeenCalled()
    })
  })

  describe('Cmd/Ctrl+1-5 panel toggle shortcuts', () => {
    it('dispatches app:toggle-panel event for Cmd+1 and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: '1', metaKey: true, type: 'keydown' })
      const handled = result.current(event)

      expect(handled).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'app:toggle-panel',
          detail: { key: '1' },
        }),
      )
      dispatchSpy.mockRestore()
    })

    it('dispatches for Ctrl+3', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: '3', ctrlKey: true, type: 'keydown' })
      const handled = result.current(event)

      expect(handled).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'app:toggle-panel',
          detail: { key: '3' },
        }),
      )
      dispatchSpy.mockRestore()
    })

    it('dispatches for each of keys 1-5', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))

      for (const key of ['1', '2', '3', '4', '5']) {
        dispatchSpy.mockClear()
        const event = makeKeyEvent({ key, metaKey: true, type: 'keydown' })
        const handled = result.current(event)

        expect(handled).toBe(false)
        expect(dispatchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'app:toggle-panel',
            detail: { key },
          }),
        )
      }
      dispatchSpy.mockRestore()
    })

    it('does not handle Cmd+6 (outside 1-5 range)', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: '6', metaKey: true, type: 'keydown' })
      const handled = result.current(event)

      expect(handled).toBe(true)
      expect(dispatchSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app:toggle-panel' }),
      )
      dispatchSpy.mockRestore()
    })
  })

  describe('Cmd+A (select all)', () => {
    it('dispatches app:select-all and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'a', metaKey: true, type: 'keydown' })
      expect(result.current(event)).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:select-all' }))
      dispatchSpy.mockRestore()
    })

    it('does not handle Cmd+Shift+A as select-all (Shift+A is archive)', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'a', metaKey: true, shiftKey: true, type: 'keydown' })
      expect(result.current(event)).toBe(false)
      // Should dispatch archive, not select-all
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:archive-session' }))
      dispatchSpy.mockRestore()
    })
  })

  describe('new app-wide shortcuts from terminal', () => {
    it('Cmd+N dispatches app:new-session and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'n', metaKey: true, type: 'keydown' })
      expect(result.current(event)).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:new-session' }))
      dispatchSpy.mockRestore()
    })

    it('Cmd+J dispatches app:focus-sessions and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'j', metaKey: true, type: 'keydown' })
      expect(result.current(event)).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:focus-sessions' }))
      dispatchSpy.mockRestore()
    })

    it('Cmd+Shift+F dispatches app:focus-session-search and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'f', metaKey: true, shiftKey: true, type: 'keydown' })
      expect(result.current(event)).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:focus-session-search' }))
      dispatchSpy.mockRestore()
    })

    it('Cmd+Shift+A dispatches app:archive-session and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'a', metaKey: true, shiftKey: true, type: 'keydown' })
      expect(result.current(event)).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:archive-session' }))
      dispatchSpy.mockRestore()
    })

    it('Cmd+, dispatches app:toggle-settings and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: ',', metaKey: true, type: 'keydown' })
      expect(result.current(event)).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:toggle-settings' }))
      dispatchSpy.mockRestore()
    })

    it('Cmd+/ dispatches app:show-shortcuts and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: '/', metaKey: true, type: 'keydown' })
      expect(result.current(event)).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:show-shortcuts' }))
      dispatchSpy.mockRestore()
    })

    it('Alt+Down dispatches app:next-session and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'ArrowDown', altKey: true, type: 'keydown' })
      expect(result.current(event)).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:next-session' }))
      dispatchSpy.mockRestore()
    })

    it('Alt+Up dispatches app:prev-session and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'ArrowUp', altKey: true, type: 'keydown' })
      expect(result.current(event)).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:prev-session' }))
      dispatchSpy.mockRestore()
    })

    it('Cmd+Shift+] dispatches app:next-terminal-tab and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: ']', metaKey: true, shiftKey: true, type: 'keydown' })
      expect(result.current(event)).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:next-terminal-tab' }))
      dispatchSpy.mockRestore()
    })

    it('Cmd+Shift+[ dispatches app:prev-terminal-tab and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: '[', metaKey: true, shiftKey: true, type: 'keydown' })
      expect(result.current(event)).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:prev-terminal-tab' }))
      dispatchSpy.mockRestore()
    })

    it('Cmd+Alt+1 dispatches app:explorer-tab with files and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: '¡', metaKey: true, altKey: true, type: 'keydown', code: 'Digit1' } as Partial<KeyboardEvent> & { key: string })
      expect(result.current(event)).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app:explorer-tab', detail: { filter: 'files' } }),
      )
      dispatchSpy.mockRestore()
    })

    it('Cmd+Alt+3 dispatches app:explorer-tab with search and returns false', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: '#', metaKey: true, altKey: true, type: 'keydown', code: 'Digit3' } as Partial<KeyboardEvent> & { key: string })
      expect(result.current(event)).toBe(false)
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app:explorer-tab', detail: { filter: 'search' } }),
      )
      dispatchSpy.mockRestore()
    })
  })

  describe('regular keys', () => {
    it('returns true for regular keydown events (letting xterm handle them)', () => {
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'a', type: 'keydown' })
      expect(result.current(event)).toBe(true)
    })

    it('returns true for non-keydown events that are not special keys', () => {
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: 'a', type: 'keyup' })
      expect(result.current(event)).toBe(true)
    })
  })

  describe('memoization', () => {
    it('returns the same function reference when ptyIdRef does not change', () => {
      const { result, rerender } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const first = result.current
      rerender()
      expect(result.current).toBe(first)
    })
  })
})
