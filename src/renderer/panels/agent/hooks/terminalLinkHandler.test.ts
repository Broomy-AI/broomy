import { describe, it, expect, vi } from 'vitest'
import {
  shouldOpenTerminalLink,
  createWebLinkHandler,
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

describe('createWebLinkHandler', () => {
  it('opens exactly the links that qualify', () => {
    const openExternal = vi.fn()
    const handler = createWebLinkHandler({ isMac: true, openExternal })

    // qualifying: ⌘ + primary + https
    handler({ button: 0, metaKey: true, ctrlKey: false } as MouseEvent, 'https://example.com')
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com')

    // non-qualifying: plain click, and a modified file: URL
    handler({ button: 0, metaKey: false, ctrlKey: false } as MouseEvent, 'https://example.com')
    handler({ button: 0, metaKey: true, ctrlKey: false } as MouseEvent, 'file:///etc/passwd')
    expect(openExternal).toHaveBeenCalledTimes(1)
  })
})

describe('createTerminalLinkHandlers', () => {
  it('gates OSC 8 links (linkHandler) with the same rule and forbids non-http protocols', () => {
    const openExternal = vi.fn()
    const { linkHandler } = createTerminalLinkHandlers({ isMac: true, openExternal })

    // xterm must not fall back to its plain-click confirm()+window.open for non-http links.
    expect(linkHandler.allowNonHttpProtocols).toBe(false)

    linkHandler.activate({ button: 0, metaKey: true, ctrlKey: false } as MouseEvent, 'https://example.com')
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com')

    linkHandler.activate({ button: 0, metaKey: false, ctrlKey: false } as MouseEvent, 'https://example.com')
    expect(openExternal).toHaveBeenCalledTimes(1)
  })

  it('exposes the same gate as onClick for detected URL text', () => {
    const openExternal = vi.fn()
    const { onClick } = createTerminalLinkHandlers({ isMac: false, openExternal })

    onClick({ button: 0, metaKey: false, ctrlKey: true } as MouseEvent, 'http://x.dev')
    onClick({ button: 0, metaKey: false, ctrlKey: false } as MouseEvent, 'http://x.dev')
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('http://x.dev')
  })
})
