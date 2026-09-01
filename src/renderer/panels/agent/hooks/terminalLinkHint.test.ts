// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createTerminalLinkHint, middleEllipsis } from './terminalLinkHint'
import { modifierSymbol } from '../../../shared/utils/platform'

describe('createTerminalLinkHint', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  const hintEl = () => container.firstElementChild as HTMLElement | null
  const at = () => ({ clientX: 100, clientY: 200 }) as MouseEvent

  it('mounts hidden inside the terminal container', () => {
    createTerminalLinkHint(container)

    expect(hintEl()).not.toBeNull()
    expect(hintEl()!.style.display).toBe('none')
  })

  it('names the platform modifier so the user knows what the plain click was missing', () => {
    const hint = createTerminalLinkHint(container)
    hint.show(at()) // no detail → the plain URL affordance
    expect(hintEl()!.textContent).toBe(`${modifierSymbol}click to open`)
  })

  it('appends the decoded path for a file link, so a deceptive label cannot hide the target', () => {
    const hint = createTerminalLinkHint(container)
    hint.show(at(), '/Users/a b.png')
    expect(hintEl()!.textContent).toBe(`${modifierSymbol}click to open /Users/a b.png`)
  })

  it('updates the text when the pointer moves between targets', () => {
    const hint = createTerminalLinkHint(container)
    hint.show(at(), '/Users/first.png')
    expect(hintEl()!.textContent).toContain('/Users/first.png')
    hint.show(at()) // a URL next → no detail
    expect(hintEl()!.textContent).toBe(`${modifierSymbol}click to open`)
  })

  it('renders the (untrusted) path as text, never as HTML', () => {
    const hint = createTerminalLinkHint(container)
    hint.show(at(), '/tmp/<img src=x onerror=alert(1)>.png')
    expect(hintEl()!.querySelector('img')).toBeNull()
    expect(hintEl()!.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('shortens a long target from the MIDDLE, keeping the tree and the filename', () => {
    const long = `/Users/rob/repos/broomy/${'nested/'.repeat(20)}quiz-layout.png`
    const hint = createTerminalLinkHint(container)
    hint.show(at(), long)

    const text = hintEl()!.textContent
    expect(text).toContain('/Users/rob/repos') // the head survives
    expect(text).toContain('quiz-layout.png') // and so does the filename
    expect(text).toContain('…')
    expect(text.length).toBeLessThan(long.length)
  })

  it('middleEllipsis leaves a short target alone and never exceeds the budget', () => {
    expect(middleEllipsis('/tmp/a.png')).toBe('/tmp/a.png')
    expect(middleEllipsis('/a/'.repeat(80)).length).toBe(72)
    expect(middleEllipsis('abcdefghij', 5)).toBe('a…hij') // the budget favours the filename end
  })

  it('clamps back inside the window instead of running off the right edge', () => {
    const hint = createTerminalLinkHint(container)
    // jsdom reports 0 for offsetWidth/Height, so stub the measured size the clamp reads.
    const el = hintEl()!
    Object.defineProperty(el, 'offsetWidth', { value: 300, configurable: true })
    Object.defineProperty(el, 'offsetHeight', { value: 20, configurable: true })

    hint.show({ clientX: window.innerWidth - 10, clientY: window.innerHeight - 5 } as MouseEvent, '/tmp/a.png')
    expect(parseInt(el.style.left, 10)).toBe(window.innerWidth - 300 - 4)
    expect(parseInt(el.style.top, 10)).toBe(window.innerHeight - 20 - 4)
  })

  it('carries xterm-hover so it does not swallow events into the terminal beneath', () => {
    createTerminalLinkHint(container)

    expect(hintEl()!.className).toContain('xterm-hover')
    expect(hintEl()!.className).toContain('pointer-events-none')
  })

  it('shows at the pointer and hides again', () => {
    const hint = createTerminalLinkHint(container)

    hint.show({ clientX: 100, clientY: 200 } as MouseEvent)
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
