/**
 * Splices text into an input or textarea at the caret, restoring focus after.
 *
 * Used by the template variable picker so inserting lands where the user was
 * typing rather than at the end of the field.
 */
import { useCallback, useRef } from 'react'

export function useInsertAtCursor<T extends HTMLInputElement | HTMLTextAreaElement>() {
  const ref = useRef<T | null>(null)

  const insert = useCallback((text: string, value: string, onChange: (v: string) => void) => {
    const el = ref.current
    if (!el) {
      onChange(value + text)
      return
    }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? start
    const next = value.slice(0, start) + text + value.slice(end)
    onChange(next)
    const caret = start + text.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }, [])

  return { ref, insert }
}
