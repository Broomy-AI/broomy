/**
 * Appearance model + colour-derivation tests.
 *
 * The status-colour surface (statusColor coercion, deriveStatusColor,
 * resolveStatusColorRgb/Var) is the new work. The rest of the module's exports are
 * covered here too, since nothing else exercises them directly.
 */
import { describe, it, expect } from 'vitest'
import {
  APP_TEXT_SCALES,
  DEFAULT_APPEARANCE,
  deriveAccent,
  deriveStatusColor,
  normalizeAppearance,
  resolveStatusColorRgb,
  resolveStatusColorVar,
  resolveTerminalContrast,
  resolveTheme,
  stepScale,
  themeIsLight,
  type Appearance,
} from './appearance'
import { PALETTE, type ThemeName } from './theme'
import { parseTriplet } from './color'

const THEMES: ThemeName[] = ['dark', 'light', 'hc', 'hc-light']
const nonTextFloor = (t: ThemeName) => (t === 'hc' || t === 'hc-light' ? 4.5 : 3)

/** Build an Appearance with a given statusColor, allowing deliberately-invalid values. */
const withStatus = (statusColor: string): Appearance => ({
  ...DEFAULT_APPEARANCE,
  statusColor: statusColor as Appearance['statusColor'],
})

describe('normalizeAppearance — statusColor', () => {
  it("keeps 'default' and 'accent'", () => {
    expect(normalizeAppearance({ statusColor: 'default' }).statusColor).toBe('default')
    expect(normalizeAppearance({ statusColor: 'accent' }).statusColor).toBe('accent')
  })

  it('keeps a valid #rrggbb in either case', () => {
    expect(normalizeAppearance({ statusColor: '#ff00ff' }).statusColor).toBe('#ff00ff')
    expect(normalizeAppearance({ statusColor: '#ABCDEF' }).statusColor).toBe('#ABCDEF')
  })

  it("falls back to 'default' for garbage, 3-digit hex, non-strings, undefined and null", () => {
    expect(normalizeAppearance({ statusColor: 'green' }).statusColor).toBe('default')
    expect(normalizeAppearance({ statusColor: '#fff' }).statusColor).toBe('default')
    expect(normalizeAppearance({ statusColor: 123 }).statusColor).toBe('default')
    expect(normalizeAppearance({}).statusColor).toBe('default')
    expect(normalizeAppearance(null).statusColor).toBe('default')
  })
})

describe('normalizeAppearance — the rest still degrades to defaults', () => {
  it('coerces a bad theme and clamps an out-of-range scale', () => {
    const a = normalizeAppearance({ theme: 'neon', appTextScale: 99 })
    expect(a.theme).toBe(DEFAULT_APPEARANCE.theme)
    expect(APP_TEXT_SCALES).toContain(a.appTextScale)
  })

  it('round-trips a fully valid object', () => {
    const valid: Appearance = { ...DEFAULT_APPEARANCE, theme: 'light', statusColor: '#123456', accent: '#00ff00' }
    expect(normalizeAppearance(valid)).toEqual(valid)
  })
})

describe('deriveStatusColor', () => {
  it('leaves an already-bright green untouched on dark', () => {
    const r = deriveStatusColor('#4ade80', 'dark')
    expect(r.adjusted).toBe(false)
    expect(r.triplet).toBe('74 222 128')
  })

  it('darkens a too-light green on light — still green, still clears 3:1', () => {
    const r = deriveStatusColor('#4ade80', 'light')
    expect(r.adjusted).toBe(true)
    const [rr, gg, bb] = r.rgb
    expect(gg).toBeGreaterThan(rr)
    expect(gg).toBeGreaterThan(bb)
    expect(r.contrastVsBg).toBeGreaterThanOrEqual(3)
  })

  it('clears the non-text floor against bg-tertiary in every theme', () => {
    for (const theme of THEMES) {
      for (const hex of ['#4ade80', '#ff00ff', '#4a9eff', '#f59e0b']) {
        const r = deriveStatusColor(hex, theme)
        expect(r.contrastVsBg, `${hex} on ${theme}`).toBeGreaterThanOrEqual(nonTextFloor(theme) - 0.01)
      }
    }
  })

  it('falls back to the token green on a malformed hex rather than throwing', () => {
    const r = deriveStatusColor('not-a-colour', 'dark')
    expect(r.rgb).toEqual(parseTriplet(PALETTE.dark['status-accent']))
  })
})

describe('resolveStatusColorRgb', () => {
  it("returns the token green for 'default' and for garbage, in every theme", () => {
    for (const theme of THEMES) {
      const green = parseTriplet(PALETTE[theme]['status-accent'])
      expect(resolveStatusColorRgb(withStatus('default'), theme)).toEqual(green)
      expect(resolveStatusColorRgb(withStatus('weird'), theme)).toEqual(green)
    }
  })

  it("follows the fitted accent for 'accent'", () => {
    const rgb = resolveStatusColorRgb({ ...DEFAULT_APPEARANCE, statusColor: 'accent', accent: '#4a9eff' }, 'light')
    expect(rgb).toEqual(deriveAccent('#4a9eff', 'light').accent)
  })

  it('fits a custom hex', () => {
    expect(resolveStatusColorRgb(withStatus('#ff00ff'), 'light')).toEqual(deriveStatusColor('#ff00ff', 'light').rgb)
  })
})

describe('resolveStatusColorVar', () => {
  it("returns null for 'default' (the CSS token wins) and for garbage", () => {
    expect(resolveStatusColorVar(withStatus('default'), 'dark')).toBeNull()
    expect(resolveStatusColorVar(withStatus('weird'), 'dark')).toBeNull()
  })

  it("returns a triplet for 'accent' and a custom hex", () => {
    expect(resolveStatusColorVar(withStatus('accent'), 'dark')).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
    expect(resolveStatusColorVar(withStatus('#ff00ff'), 'light')).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
  })
})

describe('other appearance helpers', () => {
  it('resolveTheme follows the OS only for the system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('hc', true)).toBe('hc')
  })

  it('resolveTerminalContrast is theme-aware for auto', () => {
    expect(resolveTerminalContrast('auto', 'dark')).toBe(7)
    expect(resolveTerminalContrast('auto', 'light')).toBe(4.5)
    expect(resolveTerminalContrast(21, 'light')).toBe(21)
  })

  it('themeIsLight matches the light-based themes', () => {
    expect(themeIsLight('light')).toBe(true)
    expect(themeIsLight('hc-light')).toBe(true)
    expect(themeIsLight('dark')).toBe(false)
  })

  it('stepScale clamps at both ends', () => {
    const last = APP_TEXT_SCALES[APP_TEXT_SCALES.length - 1]
    expect(stepScale(APP_TEXT_SCALES[0], -1, APP_TEXT_SCALES)).toBe(APP_TEXT_SCALES[0])
    expect(stepScale(last, 1, APP_TEXT_SCALES)).toBe(last)
  })
})
