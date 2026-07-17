import { describe, it, expect } from 'vitest'
import { normalizeAppearance, DEFAULT_APPEARANCE } from './appearance'

describe('normalizeAppearance — sidebarRailColored', () => {
  it('defaults to true when the field is absent', () => {
    expect(DEFAULT_APPEARANCE.sidebarRailColored).toBe(true)
    expect(normalizeAppearance({}).sidebarRailColored).toBe(true)
    expect(normalizeAppearance(undefined).sidebarRailColored).toBe(true)
  })

  it('preserves a valid boolean', () => {
    expect(normalizeAppearance({ sidebarRailColored: false }).sidebarRailColored).toBe(false)
    expect(normalizeAppearance({ sidebarRailColored: true }).sidebarRailColored).toBe(true)
  })

  it('falls back to the default for a non-boolean value', () => {
    expect(normalizeAppearance({ sidebarRailColored: 'yes' }).sidebarRailColored).toBe(true)
    expect(normalizeAppearance({ sidebarRailColored: 1 }).sidebarRailColored).toBe(true)
    expect(normalizeAppearance({ sidebarRailColored: null }).sidebarRailColored).toBe(true)
  })
})
