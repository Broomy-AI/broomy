// @vitest-environment jsdom
/**
 * The contrast dropdown is the one control here whose LABEL is derived rather than
 * fixed: "Automatic" means a different floor per theme, and on standard light it means
 * no floor at all. A user who cannot tell those apart cannot tell whether their terminal
 * colours are being rewritten, so the wording is behaviour, not decoration.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { AppearanceSettings } from './AppearanceSettings'
import { DEFAULT_APPEARANCE } from '../../../shared/appearance'
import type { ThemeName } from '../../../shared/theme'

afterEach(() => {
  cleanup()
})

const props = (resolvedTheme: ThemeName) => ({
  appearance: DEFAULT_APPEARANCE,
  resolvedTheme,
  onChange: vi.fn(),
  onReset: vi.fn(),
})

describe('AppearanceSettings terminal contrast', () => {
  it('says the floor is OFF on standard light, not "1:1"', () => {
    render(<AppearanceSettings {...props('light')} />)
    expect(screen.getByText('Automatic (off for this theme)')).toBeTruthy()
    // "1:1" would read as a setting the user chose rather than as disabled.
    expect(screen.queryByText('Automatic (1:1 for this theme)')).toBeNull()
  })

  it('names the actual floor on themes that impose one', () => {
    render(<AppearanceSettings {...props('dark')} />)
    expect(screen.getByText('Automatic (7:1 for this theme)')).toBeTruthy()
    cleanup()

    render(<AppearanceSettings {...props('hc-light')} />)
    expect(screen.getByText('Automatic (4.5:1 for this theme)')).toBeTruthy()
  })

  it('labels the explicit floors, with 21 named as Maximum', () => {
    render(<AppearanceSettings {...props('dark')} />)
    expect(screen.getByText('4.5:1')).toBeTruthy()
    expect(screen.getByText('7:1')).toBeTruthy()
    expect(screen.getByText('Maximum (21:1)')).toBeTruthy()
  })

  it('reports an explicit pick as a number, not the string off the select', () => {
    const p = props('light')
    render(<AppearanceSettings {...p} />)
    fireEvent.change(screen.getByLabelText('Minimum contrast'), { target: { value: '7' } })
    expect(p.onChange).toHaveBeenCalledWith({ terminalContrast: 7 })
  })

  it('reports auto as the string, since it is not a number', () => {
    const p = props('light')
    render(<AppearanceSettings {...p} />)
    fireEvent.change(screen.getByLabelText('Minimum contrast'), { target: { value: 'auto' } })
    expect(p.onChange).toHaveBeenCalledWith({ terminalContrast: 'auto' })
  })
})
