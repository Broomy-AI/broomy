// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createTerminalLinkHint } from './terminalLinkHint'
import { modifierSymbol } from '../../../shared/utils/platform'

describe('createTerminalLinkHint', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  const hintEl = () => container.firstElementChild as HTMLElement | null

  it('mounts hidden inside the terminal container', () => {
    createTerminalLinkHint(container)

    expect(hintEl()).not.toBeNull()
    expect(hintEl()!.style.display).toBe('none')
  })

  it('names the platform modifier so the user knows what the plain click was missing', () => {
    createTerminalLinkHint(container)

    expect(hintEl()!.textContent).toBe(`${modifierSymbol}click to open`)
  })

  it('carries xterm-hover so it does not swallow events into the terminal beneath', () => {
    createTerminalLinkHint(container)

    expect(hintEl()!.className).toContain('xterm-hover')
    expect(hintEl()!.className).toContain('pointer-events-none')
  })

  it('shows at the pointer and hides again', () => {
    const hint = createTerminalLinkHint(container)

    hint.show({ clientX: 100, clientY: 200 } as MouseEvent, 'https://example.com')
    expect(hintEl()!.style.display).toBe('')
    // Offset off the pointer so the hint never covers the link it describes.
    expect(hintEl()!.style.left).toBe('112px')
    expect(hintEl()!.style.top).toBe('212px')

    hint.hide()
    expect(hintEl()!.style.display).toBe('none')
  })

  it('removes itself on dispose (it would otherwise outlive the terminal)', () => {
    const hint = createTerminalLinkHint(container)
    hint.dispose()

    expect(hintEl()).toBeNull()
  })
})
