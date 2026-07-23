// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { AppearanceSettings } from './AppearanceSettings'
import { DEFAULT_APPEARANCE, type Appearance } from '../../../shared/appearance'

afterEach(cleanup)

function renderSettings(overrides: Partial<Appearance> = {}) {
  const onChange = vi.fn()
  render(
    <AppearanceSettings
      appearance={{ ...DEFAULT_APPEARANCE, ...overrides }}
      resolvedTheme="dark"
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
