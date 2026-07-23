import { describe, it, expect, vi } from 'vitest'
import {
  shouldOpenTerminalLink,
  createTerminalLinkHandlers,
  type TerminalLinkClick,
} from './terminalLinkHandler'

const click = (over: Partial<TerminalLinkClick> = {}): TerminalLinkClick => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  ...over,
})

describe('shouldOpenTerminalLink', () => {
  const HTTPS = 'https://example.com'

  it('opens on ⌘+primary-click on macOS', () => {
    expect(shouldOpenTerminalLink(click({ metaKey: true }), HTTPS, true)).toBe(true)
    expect(shouldOpenTerminalLink(click({ metaKey: true }), 'http://example.com', true)).toBe(true)
  })

  it('opens on Ctrl+primary-click off macOS', () => {
    expect(shouldOpenTerminalLink(click({ ctrlKey: true }), HTTPS, false)).toBe(true)
    expect(shouldOpenTerminalLink(click({ ctrlKey: true }), 'http://example.com', false)).toBe(true)
  })

  it('does NOT open on Ctrl-click on macOS (that is the context-menu gesture)', () => {
    expect(shouldOpenTerminalLink(click({ ctrlKey: true }), HTTPS, true)).toBe(false)
  })

  it('does NOT open with the wrong-platform modifier', () => {
    expect(shouldOpenTerminalLink(click({ metaKey: true }), HTTPS, false)).toBe(false)
    expect(shouldOpenTerminalLink(click({ ctrlKey: true }), HTTPS, true)).toBe(false)
  })

  it('does NOT open on a plain click (leaves selection/cursor to xterm)', () => {
    expect(shouldOpenTerminalLink(click(), HTTPS, true)).toBe(false)
    expect(shouldOpenTerminalLink(click(), HTTPS, false)).toBe(false)
  })

  it('does NOT open on middle- or right-click even with the modifier', () => {
    expect(shouldOpenTerminalLink(click({ metaKey: true, button: 1 }), HTTPS, true)).toBe(false)
    expect(shouldOpenTerminalLink(click({ metaKey: true, button: 2 }), HTTPS, true)).toBe(false)
  })

  it('refuses non-http(s) schemes even with the modifier held', () => {
    for (const uri of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'mailto:a@b.com',
      'localhost:5173',
      '127.0.0.1:5173',
      'ftp://example.com',
    ]) {
      expect(shouldOpenTerminalLink(click({ metaKey: true }), uri, true)).toBe(false)
    }
  })

  it('is case-insensitive on the scheme', () => {
    expect(shouldOpenTerminalLink(click({ metaKey: true }), 'HTTPS://Example.com', true)).toBe(true)
  })
})

describe('createTerminalLinkHandlers', () => {
  const makeDeps = (isMac: boolean) => {
    const openExternal = vi.fn()
    const hint = { show: vi.fn(), hide: vi.fn() }
    return { openExternal, hint, handlers: createTerminalLinkHandlers({ isMac, openExternal, hint }) }
  }

  it('gates OSC 8 links (linkHandler) with the same rule and forbids non-http protocols', () => {
    const { openExternal, handlers } = makeDeps(true)

    // xterm must not fall back to its plain-click confirm()+window.open for non-http links.
    expect(handlers.linkHandler.allowNonHttpProtocols).toBe(false)

    handlers.linkHandler.activate({ button: 0, metaKey: true, ctrlKey: false } as MouseEvent, 'https://example.com')
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com')

    handlers.linkHandler.activate({ button: 0, metaKey: false, ctrlKey: false } as MouseEvent, 'https://example.com')
    expect(openExternal).toHaveBeenCalledTimes(1)
  })

  it('exposes the same gate as onClick for detected URL text', () => {
    const { openExternal, handlers } = makeDeps(false)

    handlers.onClick({ button: 0, metaKey: false, ctrlKey: true } as MouseEvent, 'http://x.dev')
    handlers.onClick({ button: 0, metaKey: false, ctrlKey: false } as MouseEvent, 'http://x.dev')
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('http://x.dev')
  })

  it('refuses a non-http URI even with the modifier held (both paths)', () => {
    const { openExternal, handlers } = makeDeps(true)
    const modified = { button: 0, metaKey: true, ctrlKey: false } as MouseEvent

    handlers.onClick(modified, 'file:///etc/passwd')
    handlers.linkHandler.activate(modified, 'file:///etc/passwd')
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('shows the hint on hover and hides it on leave, for both link paths', () => {
    const { hint, handlers } = makeDeps(true)
    const event = { clientX: 10, clientY: 20 } as MouseEvent

    handlers.linkProviderOptions.hover(event, 'https://example.com')
    expect(hint.show).toHaveBeenCalledExactlyOnceWith(event, 'https://example.com')
    handlers.linkProviderOptions.leave()
    expect(hint.hide).toHaveBeenCalledOnce()

    handlers.linkHandler.hover(event, 'https://example.com')
    expect(hint.show).toHaveBeenCalledTimes(2)
    handlers.linkHandler.leave()
    expect(hint.hide).toHaveBeenCalledTimes(2)
  })

  it('does not promise to open a URI the click gate would refuse', () => {
    const { hint, handlers } = makeDeps(true)

    handlers.linkProviderOptions.hover({} as MouseEvent, 'file:///etc/passwd')
    expect(hint.show).not.toHaveBeenCalled()
  })

  it('hides the hint when a link is opened (no leave fires once focus goes to the browser)', () => {
    const { hint, handlers } = makeDeps(true)

    handlers.onClick({ button: 0, metaKey: true, ctrlKey: false } as MouseEvent, 'https://example.com')
    expect(hint.hide).toHaveBeenCalledOnce()
  })

  it('works without a hint (optional affordance)', () => {
    const openExternal = vi.fn()
    const { onClick, linkProviderOptions } = createTerminalLinkHandlers({ isMac: true, openExternal })

    expect(() => linkProviderOptions.hover({} as MouseEvent, 'https://example.com')).not.toThrow()
    expect(() => linkProviderOptions.leave()).not.toThrow()
    onClick({ button: 0, metaKey: true, ctrlKey: false } as MouseEvent, 'https://example.com')
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com')
  })
})
