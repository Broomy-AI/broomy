import { describe, it, expect } from 'vitest'
import { navigationAction } from './navigation'

describe('navigationAction', () => {
  it('allows a genuine same-URL reload (prod file:// and dev localhost)', () => {
    expect(navigationAction('file:///app/index.html', 'file:///app/index.html')).toBe('allow')
    expect(navigationAction('http://localhost:5173/', 'http://localhost:5173/')).toBe('allow')
  })

  it('blocks any other file:// navigation (dropped-file data-loss guard)', () => {
    expect(navigationAction('file:///app/index.html', 'file:///Users/me/notes.txt')).toBe('block')
  })

  it('blocks a file:// navigation even when there is no current URL', () => {
    expect(navigationAction('', 'file:///Users/me/notes.txt')).toBe('block')
  })

  it('routes a different localhost path to external, not allow', () => {
    expect(navigationAction('http://localhost:5173/', 'http://localhost:5173/other')).toBe('external')
  })

  it('opens external http(s) and mailto in the browser', () => {
    expect(navigationAction('file:///app/index.html', 'https://example.com')).toBe('external')
    expect(navigationAction('file:///app/index.html', 'http://example.com')).toBe('external')
    expect(navigationAction('file:///app/index.html', 'mailto:x@example.com')).toBe('external')
  })
})
