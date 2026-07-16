// @vitest-environment jsdom
/**
 * applyAppearanceToDocument writes the runtime CSS variables onto <html>. These cover the
 * status-colour seam: 'accent'/custom set an inline --color-status-accent that overrides
 * the theme block, while 'default' (and reset) clear it so the per-theme CSS token wins.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { applyAppearanceToDocument, useAppearance } from './useAppearance'
import { useSettingsStore } from '../../store/settings'
import { DEFAULT_APPEARANCE, type Appearance, type AppearanceSnapshot } from '../../../shared/appearance'
import type { ThemeName } from '../../../shared/theme'

const statusVar = () => document.documentElement.style.getPropertyValue('--color-status-accent')

const seed = (patch: Partial<Appearance>, resolvedTheme: ThemeName = 'dark') =>
  useSettingsStore.setState({
    appearance: { ...DEFAULT_APPEARANCE, ...patch },
    systemIsDark: resolvedTheme === 'dark' || resolvedTheme === 'hc',
    resolvedTheme,
  })

describe('applyAppearanceToDocument — status colour var', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--color-status-accent')
    seed({ statusColor: 'default' })
  })

  it("clears the inline var for 'default' so the CSS token wins", () => {
    document.documentElement.style.setProperty('--color-status-accent', '1 2 3')
    seed({ statusColor: 'default' })
    applyAppearanceToDocument()
    expect(statusVar()).toBe('')
  })

  it("sets a fitted triplet for 'accent'", () => {
    seed({ statusColor: 'accent', accent: '#4a9eff' })
    applyAppearanceToDocument()
    expect(statusVar()).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
  })

  it('sets a fitted triplet for a custom hex', () => {
    seed({ statusColor: '#ff00ff' }, 'light')
    applyAppearanceToDocument()
    expect(statusVar()).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
  })

  it('re-clears the var after returning to the default preference via reset()', () => {
    seed({ statusColor: '#ff00ff' }, 'light')
    applyAppearanceToDocument()
    expect(statusVar()).not.toBe('')

    useSettingsStore.getState().reset()
    applyAppearanceToDocument()
    expect(statusVar()).toBe('')
  })

  it('removes the focus-ring override in high contrast (the theme pins it)', () => {
    document.documentElement.style.setProperty('--color-focus-ring', '9 9 9')
    seed({ statusColor: 'default' }, 'hc')
    applyAppearanceToDocument()
    expect(document.documentElement.style.getPropertyValue('--color-focus-ring')).toBe('')
  })
})

describe('useAppearance hook', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--color-status-accent')
    seed({ statusColor: 'default' })
  })

  it('applies the appearance on mount and writes remote changes back to the store', () => {
    let captured: ((s: AppearanceSnapshot) => void) | null = null
    vi.mocked(window.settings.onChanged).mockImplementation((cb) => {
      captured = cb
      return () => {}
    })
    seed({ statusColor: 'accent', accent: '#4a9eff' }, 'dark')

    renderHook(() => useAppearance())

    // The mount effect applied the current appearance to <html>.
    expect(statusVar()).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
    expect(window.settings.onChanged).toHaveBeenCalled()

    // A change pushed from another window is applied to this window's store.
    captured?.({
      appearance: { ...DEFAULT_APPEARANCE, statusColor: 'default' },
      systemIsDark: false,
      resolvedTheme: 'light',
    })
    expect(useSettingsStore.getState().appearance.statusColor).toBe('default')
    expect(useSettingsStore.getState().resolvedTheme).toBe('light')
  })
})
