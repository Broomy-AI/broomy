import { describe, it, expect, vi } from 'vitest'
import {
  shouldOpenTerminalLink,
  isOpenableTerminalUri,
  fileUriToPath,
  createTerminalLinkHandlers,
  type TerminalLinkClick,
} from './terminalLinkHandler'

const click = (over: Partial<TerminalLinkClick> = {}): TerminalLinkClick => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  ...over,
})

describe('fileUriToPath', () => {
  it('decodes a canonical file:// URL to a path, exactly once', () => {
    expect(fileUriToPath('file:///Users/x.png')).toBe('/Users/x.png')
    expect(fileUriToPath('file:///Users/a%20b.png')).toBe('/Users/a b.png') // %20 → space
    expect(fileUriToPath('file:///Users/a%2520b.png')).toBe('/Users/a%20b.png') // %2520 → literal %20
    expect(fileUriToPath('file://localhost/Users/x.png')).toBe('/Users/x.png')
    expect(fileUriToPath('FILE:///Users/x.png')).toBe('/Users/x.png') // scheme is case-insensitive
  })

  it('rejects anything outside the safe file-URL contract', () => {
    for (const uri of [
      'file:///a%2Fb', // encoded slash (upper)
      'file:///a%2fb', // encoded slash (lower)
      'file:///a%00b', // NUL
      'file:///a%7Fb', // DEL (post-decode \p{Cc})
      'file:///a%C2%80b', // C1 control U+0080 (post-decode \p{Cc})
      'file:///a	b', // raw TAB (URL would strip it)
      'file:///a\\b', // raw backslash (URL would rewrite to /)
      'file:///a%zz', // malformed %-escape
      'file:///a%', // trailing %
      'file:relative', // shorthand/relative (new URL('file:x').pathname is /x)
      'file:/Users/x', // single-slash shorthand
      'file:////path', // extra slash after the authority
      'file://example.com/a', // remote host
      'file:///a?q=1', // query
      'file:///a#frag', // fragment
      'http://example.com', // not file
      'javascript:alert(1)',
      `file:///${'a'.repeat(20000)}`, // overlong raw input
    ]) {
      expect(fileUriToPath(uri)).toBeNull()
    }
  })
})

describe('isOpenableTerminalUri', () => {
  it('always accepts http(s)', () => {
    expect(isOpenableTerminalUri('https://example.com', false)).toBe(true)
    expect(isOpenableTerminalUri('http://example.com', false)).toBe(true)
  })

  it('accepts a valid file:// only when allowFileUris', () => {
    expect(isOpenableTerminalUri('file:///Users/x.png', true)).toBe(true)
    expect(isOpenableTerminalUri('file:///Users/x.png', false)).toBe(false)
    expect(isOpenableTerminalUri('file://host/x', true)).toBe(false) // invalid file URL
  })

  it('refuses every other scheme', () => {
    for (const uri of ['javascript:alert(1)', 'mailto:a@b.com', 'ftp://x', 'localhost:5173']) {
      expect(isOpenableTerminalUri(uri, true)).toBe(false)
    }
  })
})

describe('shouldOpenTerminalLink', () => {
  const HTTPS = 'https://example.com'

  it('opens on ⌘+primary-click on macOS', () => {
    expect(shouldOpenTerminalLink(click({ metaKey: true }), HTTPS, true, true)).toBe(true)
    expect(shouldOpenTerminalLink(click({ metaKey: true }), 'http://example.com', true, true)).toBe(true)
  })

  it('opens on Ctrl+primary-click off macOS', () => {
    expect(shouldOpenTerminalLink(click({ ctrlKey: true }), HTTPS, false, true)).toBe(true)
  })

  it('does NOT open on Ctrl-click on macOS (that is the context-menu gesture)', () => {
    expect(shouldOpenTerminalLink(click({ ctrlKey: true }), HTTPS, true, true)).toBe(false)
  })

  it('does NOT open on a plain click (leaves selection/cursor to xterm)', () => {
    expect(shouldOpenTerminalLink(click(), HTTPS, true, true)).toBe(false)
  })

  it('does NOT open on middle- or right-click even with the modifier', () => {
    expect(shouldOpenTerminalLink(click({ metaKey: true, button: 1 }), HTTPS, true, true)).toBe(false)
    expect(shouldOpenTerminalLink(click({ metaKey: true, button: 2 }), HTTPS, true, true)).toBe(false)
  })

  it('opens a valid file:// only when allowFileUris; refuses other non-http schemes always', () => {
    const mod = click({ metaKey: true })
    expect(shouldOpenTerminalLink(mod, 'file:///Users/x.png', true, true)).toBe(true)
    expect(shouldOpenTerminalLink(mod, 'file:///Users/x.png', true, false)).toBe(false) // isolated
    for (const uri of ['javascript:alert(1)', 'mailto:a@b.com', 'ftp://example.com', 'localhost:5173']) {
      expect(shouldOpenTerminalLink(mod, uri, true, true)).toBe(false)
    }
  })

  it('is case-insensitive on the scheme', () => {
    expect(shouldOpenTerminalLink(click({ metaKey: true }), 'HTTPS://Example.com', true, true)).toBe(true)
  })
})

describe('createTerminalLinkHandlers', () => {
  const mod = { button: 0, metaKey: true, ctrlKey: false } as MouseEvent
  const plain = { button: 0, metaKey: false, ctrlKey: false } as MouseEvent
  const makeDeps = (isMac: boolean, allowFileUris = true) => {
    const openExternal = vi.fn()
    const openPath = vi.fn()
    const hint = { show: vi.fn(), hide: vi.fn() }
    return {
      openExternal,
      openPath,
      hint,
      handlers: createTerminalLinkHandlers({ isMac, openExternal, openPath, allowFileUris, hint }),
    }
  }

  it('allows non-http OSC 8 delivery on host terminals so file:// links reach the handler', () => {
    expect(makeDeps(true, true).handlers.linkHandler.allowNonHttpProtocols).toBe(true)
    expect(makeDeps(true, false).handlers.linkHandler.allowNonHttpProtocols).toBe(false) // isolated
  })

  it('opens an http URL via openExternal (linkHandler + onClick), gated by the modifier', () => {
    const { openExternal, openPath, handlers } = makeDeps(true)
    handlers.linkHandler.activate(mod, 'https://example.com')
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com')
    handlers.linkHandler.activate(plain, 'https://example.com')
    expect(openExternal).toHaveBeenCalledTimes(1) // plain click ignored
    expect(openPath).not.toHaveBeenCalled()
  })

  it('opens a file:// OSC 8 link via openPath with the DECODED path', () => {
    const { openExternal, openPath, handlers } = makeDeps(true)
    handlers.linkHandler.activate(mod, 'file:///Users/a%20b.png')
    expect(openPath).toHaveBeenCalledExactlyOnceWith('/Users/a b.png')
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('does not open a file:// link without the modifier', () => {
    const { openPath, handlers } = makeDeps(true)
    handlers.linkHandler.activate(plain, 'file:///Users/x.png')
    expect(openPath).not.toHaveBeenCalled()
  })

  it('ignores non-file, non-http schemes even with the modifier (no open action)', () => {
    const { openExternal, openPath, handlers } = makeDeps(true)
    for (const uri of ['javascript:alert(1)', 'mailto:a@b.com', 'file://host/x']) {
      handlers.linkHandler.activate(mod, uri)
      handlers.onClick(mod, uri)
    }
    expect(openExternal).not.toHaveBeenCalled()
    expect(openPath).not.toHaveBeenCalled()
  })

  it('refuses a file:// link in an isolated session (allowFileUris false)', () => {
    const { openPath, handlers } = makeDeps(true, false)
    handlers.linkHandler.activate(mod, 'file:///Users/x.png')
    expect(openPath).not.toHaveBeenCalled()
  })

  it('hover shows the decoded path for a file link, the plain hint for a URL, nothing otherwise', () => {
    const { hint, handlers } = makeDeps(true)
    const event = { clientX: 10, clientY: 20 } as MouseEvent

    handlers.linkHandler.hover(event, 'file:///Users/a%20b.png')
    expect(hint.show).toHaveBeenCalledExactlyOnceWith(event, '/Users/a b.png')

    handlers.linkProviderOptions.hover(event, 'https://example.com')
    expect(hint.show).toHaveBeenLastCalledWith(event, undefined) // URL → static "⌘click to open"

    handlers.linkHandler.hover(event, 'javascript:alert(1)')
    expect(hint.show).toHaveBeenCalledTimes(2) // unsupported scheme → no hint
  })

  it('does not show a file hint in an isolated session', () => {
    const { hint, handlers } = makeDeps(true, false)
    handlers.linkHandler.hover({} as MouseEvent, 'file:///Users/x.png')
    expect(hint.show).not.toHaveBeenCalled()
  })

  it('hides the hint on leave and when a link is opened', () => {
    const { hint, handlers } = makeDeps(true)
    handlers.linkHandler.leave()
    expect(hint.hide).toHaveBeenCalledOnce()
    handlers.onClick(mod, 'https://example.com')
    expect(hint.hide).toHaveBeenCalledTimes(2)
  })

  it('works without a hint (optional affordance)', () => {
    const openExternal = vi.fn()
    const openPath = vi.fn()
    const { onClick, linkProviderOptions } = createTerminalLinkHandlers({
      isMac: true,
      openExternal,
      openPath,
      allowFileUris: true,
    })
    expect(() => linkProviderOptions.hover({} as MouseEvent, 'https://example.com')).not.toThrow()
    expect(() => linkProviderOptions.leave()).not.toThrow()
    onClick(mod, 'file:///Users/x.png')
    expect(openPath).toHaveBeenCalledExactlyOnceWith('/Users/x.png')
  })
})
