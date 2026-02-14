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
    const event = {
      type: 'keydown',
      key: overrides.key,
      metaKey: overrides.metaKey ?? false,
      ctrlKey: overrides.ctrlKey ?? false,
      shiftKey: overrides.shiftKey ?? false,
      altKey: overrides.altKey ?? false,
      ...overrides,
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

  describe('Cmd/Ctrl+1-6 panel toggle shortcuts', () => {
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

    it('dispatches for each of keys 1-6', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))

      for (const key of ['1', '2', '3', '4', '5', '6']) {
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

    it('does not handle Cmd+7 (outside 1-6 range)', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const { result } = renderHook(() => useTerminalKeyboard(ptyIdRef))
      const event = makeKeyEvent({ key: '7', metaKey: true, type: 'keydown' })
      const handled = result.current(event)

      expect(handled).toBe(true)
      expect(dispatchSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app:toggle-panel' }),
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
