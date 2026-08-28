/**
 * The `system` theme preference resolves against whatever the OS last reported.
 *
 * This only works because main no longer forces `nativeTheme.themeSource`: with the
 * override in place, `shouldUseDarkColors` reported the FORCED value rather than the
 * OS appearance, and the `nativeTheme.on('updated')` listener wrote that back into
 * `systemIsDark` — so on a light OS, switching from Dark to System kept the app dark.
 * See themeSource.test.ts for the guard that keeps the override out.
 *
 * Runs with isE2ETest=true throughout, which keeps ~/.broomy untouched while still
 * holding the value in memory.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getResolvedTheme,
  getSystemIsDark,
  initSettings,
  saveAppearance,
  setSystemIsDark,
  snapshot,
} from './settings'
import { DEFAULT_APPEARANCE } from '../shared/appearance'

describe('system theme resolution', () => {
  // A light OS with the default dark app theme — the combination that was broken.
  beforeEach(() => {
    initSettings(false, true, false)
  })

  it('seeds systemIsDark from the OS value passed at startup', () => {
    expect(getSystemIsDark()).toBe(false)
  })

  it('keeps the explicit theme regardless of the OS appearance', () => {
    expect(DEFAULT_APPEARANCE.theme).toBe('dark')
    expect(getResolvedTheme()).toBe('dark')
  })

  it('resolves `system` to light on a light OS, even after a dark app theme', () => {
    saveAppearance({ ...DEFAULT_APPEARANCE, theme: 'system' })
    expect(getResolvedTheme()).toBe('light')
    expect(snapshot().resolvedTheme).toBe('light')
  })

  it('follows the OS when it changes under a `system` preference', () => {
    saveAppearance({ ...DEFAULT_APPEARANCE, theme: 'system' })

    // What the nativeTheme 'updated' listener does.
    setSystemIsDark(true)
    expect(getResolvedTheme()).toBe('dark')

    setSystemIsDark(false)
    expect(getResolvedTheme()).toBe('light')
  })
})
