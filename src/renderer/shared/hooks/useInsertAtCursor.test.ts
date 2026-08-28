// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import '../../../test/react-setup'
import { useInsertAtCursor } from './useInsertAtCursor'

function inputWithSelection(value: string, start: number, end: number) {
  const el = document.createElement('input')
  el.value = value
  el.setSelectionRange = vi.fn()
  el.focus = vi.fn()
  Object.defineProperty(el, 'selectionStart', { value: start, writable: true })
  Object.defineProperty(el, 'selectionEnd', { value: end, writable: true })
  return el
}

describe('useInsertAtCursor', () => {
  it('splices text at the caret', () => {
    const { result } = renderHook(() => useInsertAtCursor<HTMLInputElement>())
    result.current.ref.current = inputWithSelection('/fix  now', 5, 5)
    const onChange = vi.fn()
    result.current.insert('{branch}', '/fix  now', onChange)
    expect(onChange).toHaveBeenCalledWith('/fix {branch} now')
  })

  it('replaces the selection', () => {
    const { result } = renderHook(() => useInsertAtCursor<HTMLInputElement>())
    result.current.ref.current = inputWithSelection('/fix OLD now', 5, 8)
    const onChange = vi.fn()
    result.current.insert('{branch}', '/fix OLD now', onChange)
    expect(onChange).toHaveBeenCalledWith('/fix {branch} now')
  })

  it('appends when there is no element', () => {
    const { result } = renderHook(() => useInsertAtCursor<HTMLInputElement>())
    const onChange = vi.fn()
    result.current.insert('{branch}', '/fix', onChange)
    expect(onChange).toHaveBeenCalledWith('/fix{branch}')
  })

  it('restores focus and places the caret after the inserted text', async () => {
    const { result } = renderHook(() => useInsertAtCursor<HTMLInputElement>())
    const el = inputWithSelection('/fix ', 5, 5)
    result.current.ref.current = el
    result.current.insert('{branch}', '/fix ', vi.fn())
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
    expect(el.focus).toHaveBeenCalled()
    expect(el.setSelectionRange).toHaveBeenCalledWith(13, 13)
  })
})
