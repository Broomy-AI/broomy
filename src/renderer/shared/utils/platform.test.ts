// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * The module reads `navigator` once at import time, so each case stubs the user agent and
 * re-imports. Asserting against the ambient `navigator` instead would be both a restatement
 * of the implementation and environment-dependent — it passes under an environment that
 * defines `navigator` and throws under one that doesn't.
 */
async function loadPlatform(userAgent: string | undefined) {
  vi.stubGlobal('navigator', userAgent === undefined ? undefined : { userAgent })
  vi.resetModules()
  return import('./platform')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('platform', () => {
  it('detects macOS and reports its modifier', async () => {
    const { isMac, modifierSymbol, modifierName } = await loadPlatform(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    )

    expect(isMac).toBe(true)
    expect(modifierSymbol).toBe('⌘')
    expect(modifierName).toBe('Cmd')
  })

  it('reports Ctrl off macOS', async () => {
    const { isMac, modifierSymbol, modifierName } = await loadPlatform(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    )

    expect(isMac).toBe(false)
    expect(modifierSymbol).toBe('Ctrl+')
    expect(modifierName).toBe('Ctrl')
  })

  it('matches case-insensitively (the variant one call site had drifted to)', async () => {
    const { isMac } = await loadPlatform('mozilla/5.0 (macintosh; intel mac os x)')

    expect(isMac).toBe(true)
  })

  it('falls back to non-Mac where there is no navigator at all', async () => {
    // Importable from a non-DOM test environment rather than throwing at module scope.
    const { isMac, modifierName } = await loadPlatform(undefined)

    expect(isMac).toBe(false)
    expect(modifierName).toBe('Ctrl')
  })
})
