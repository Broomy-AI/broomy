// @vitest-environment jsdom
/**
 * Two controls here carry behaviour rather than just state:
 *
 *   - the repo rail toggle, whose aria-checked IS the thing a screen reader user reads;
 *   - the contrast dropdown, whose LABEL is derived. "Automatic" means a different floor
 *     per theme, and on standard light it means no floor at all. A user who cannot tell
 *     those apart cannot tell whether their terminal colours are being rewritten.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { AppearanceSettings } from './AppearanceSettings'
import { DEFAULT_APPEARANCE, type Appearance } from '../../../shared/appearance'
import type { ThemeName } from '../../../shared/theme'

afterEach(cleanup)

/** resolvedTheme is a parameter because the contrast label is derived from it. */
function renderSettings(overrides: Partial<Appearance> = {}, resolvedTheme: ThemeName = 'dark') {
  const onChange = vi.fn()
  render(
    <AppearanceSettings
      appearance={{ ...DEFAULT_APPEARANCE, ...overrides }}
      resolvedTheme={resolvedTheme}
      onChange={onChange}
      onReset={vi.fn()}
    />,
  )
  return { onChange }
}

describe('AppearanceSettings — repo rail colour toggle', () => {
  const railSwitch = () => screen.getByRole('switch', { name: /repo rail colour/i })

  it('reflects the on state via aria-checked', () => {
    renderSettings({ sidebarRailColored: true })
    expect(railSwitch().getAttribute('aria-checked')).toBe('true')
  })

  it('reflects the off state via aria-checked', () => {
    renderSettings({ sidebarRailColored: false })
    expect(railSwitch().getAttribute('aria-checked')).toBe('false')
  })

  it('emits the flipped value on click', () => {
    const { onChange } = renderSettings({ sidebarRailColored: true })
    fireEvent.click(railSwitch())
    expect(onChange).toHaveBeenCalledWith({ sidebarRailColored: false })
  })
})

describe('AppearanceSettings — terminal contrast', () => {
  it('says the floor is OFF on standard light, not "1:1"', () => {
    renderSettings({}, 'light')
    expect(screen.getByText('Automatic (off for this theme)')).toBeTruthy()
    // "1:1" would read as a setting the user chose rather than as disabled.
    expect(screen.queryByText('Automatic (1:1 for this theme)')).toBeNull()
  })

  it('names the actual floor on themes that impose one', () => {
    renderSettings({}, 'dark')
    expect(screen.getByText('Automatic (7:1 for this theme)')).toBeTruthy()
    cleanup()

    renderSettings({}, 'hc-light')
    expect(screen.getByText('Automatic (4.5:1 for this theme)')).toBeTruthy()
  })

  it('labels the explicit floors, with 21 named as Maximum', () => {
    renderSettings({}, 'dark')
    expect(screen.getByText('4.5:1')).toBeTruthy()
    expect(screen.getByText('7:1')).toBeTruthy()
    expect(screen.getByText('Maximum (21:1)')).toBeTruthy()
  })

  it('reports an explicit pick as a number, not the string off the select', () => {
    const { onChange } = renderSettings({}, 'light')
    fireEvent.change(screen.getByLabelText('Minimum contrast'), { target: { value: '7' } })
    expect(onChange).toHaveBeenCalledWith({ terminalContrast: 7 })
  })

  it('reports auto as the string, since it is not a number', () => {
    const { onChange } = renderSettings({}, 'light')
    fireEvent.change(screen.getByLabelText('Minimum contrast'), { target: { value: 'auto' } })
    expect(onChange).toHaveBeenCalledWith({ terminalContrast: 'auto' })
  })
})
