import { describe, it, expect } from 'vitest'
import { toHttpUrl } from './externalUrl'

describe('toHttpUrl', () => {
  it('passes through an http(s) URL that is already normalized', () => {
    expect(toHttpUrl('https://github.com/Broomy-AI/broomy/pull/149')).toBe(
      'https://github.com/Broomy-AI/broomy/pull/149',
    )
  })

  it('returns the WHATWG-normalized href, not the raw string', () => {
    // A bare host gains a trailing slash, so the OS gets exactly what was validated.
    expect(toHttpUrl('http://localhost:5173')).toBe('http://localhost:5173/')
    // Backslashes normalize to forward slashes — the OS must not re-parse the raw form.
    expect(toHttpUrl('https://example.com\\@evil.com')).not.toContain('\\')
  })

  it('is case-insensitive on the scheme', () => {
    expect(toHttpUrl('HTTPS://Example.com')).toBe('https://example.com/')
  })

  it('refuses non-http(s) schemes', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'mailto:a@b.com', 'app://x', 'ftp://example.com']) {
      expect(toHttpUrl(url)).toBeNull()
    }
  })

  it('refuses a scheme smuggled past the prefix check', () => {
    // `http:\\host` and leading whitespace fail the literal prefix test before URL parsing.
    expect(toHttpUrl('http:\\\\example.com')).toBeNull()
    expect(toHttpUrl('  https://example.com')).toBeNull()
    expect(toHttpUrl('https:')).toBeNull()
  })

  it('refuses embedded credentials (host-spoofing guard)', () => {
    // Reads as github.com to a human skimming terminal output; the real host is evil.example.
    expect(toHttpUrl('https://github.com@evil.example/pull/149')).toBeNull()
    expect(toHttpUrl('https://user:pass@evil.example')).toBeNull()
  })

  it('refuses malformed and non-string input', () => {
    expect(toHttpUrl('not a url')).toBeNull()
    expect(toHttpUrl('')).toBeNull()
    expect(toHttpUrl('https://')).toBeNull()
    expect(toHttpUrl(undefined)).toBeNull()
    expect(toHttpUrl(null)).toBeNull()
    expect(toHttpUrl(42)).toBeNull()
  })
})
