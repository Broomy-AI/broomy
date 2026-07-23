import { describe, it, expect } from 'vitest'
import { STATUS_LED, type LedState } from './statusLed'
import { THEMES, PALETTE, type ThemeName } from '../../../shared/theme'
import { ACCENT_PRESETS, deriveAccent } from '../../../shared/appearance'
import { parseTriplet, hexToRgb, composite, contrast, type Rgb } from '../../../shared/color'

const NON_TEXT_MIN = 3 // WCAG 1.4.11

/**
 * Every surface a sidebar card LED actually renders on: the card sits on
 * `bg-secondary`, hover adds `bg-tertiary/50` over it, and the active card adds the
 * runtime-derived `accent`/15 over it. Also check `bg-primary` for robustness.
 */
function cardSurfaces(theme: ThemeName): Rgb[] {
  const bgSecondary = parseTriplet(PALETTE[theme]['bg-secondary'])
  const bgPrimary = parseTriplet(PALETTE[theme]['bg-primary'])
  const bgTertiary = parseTriplet(PALETTE[theme]['bg-tertiary'])
  const hover = composite(bgTertiary, bgSecondary, 0.5)
  const actives = ACCENT_PRESETS.map((p) => {
    const accent = parseTriplet(deriveAccent(p.hex, theme).accentTriplet)
    return composite(accent, bgSecondary, 0.15)
  })
  return [bgPrimary, bgSecondary, hover, ...actives]
}

const STATES: LedState[] = ['working', 'idle', 'unread', 'error', 'initializing']

describe('status LED contrast (non-text, 3:1)', () => {
  for (const { id: theme } of THEMES) {
    const surfaces = cardSurfaces(theme)
    for (const state of STATES) {
      const spec = STATUS_LED[theme][state]
      it(`${theme}/${state} clears the 3:1 non-text floor on every card surface`, () => {
        if (spec.bezel) {
          // Bright fill is allowed to fail on light — the bezel carries the edge.
          const bezel = hexToRgb(spec.bezel)
          for (const surface of surfaces) {
            expect(contrast(bezel, surface)).toBeGreaterThanOrEqual(NON_TEXT_MIN)
          }
          // and the bezel must be visibly distinct from the fill (a real ring)
          expect(contrast(hexToRgb(spec.fill), bezel)).toBeGreaterThanOrEqual(1.3)
        } else {
          // No bezel (dark / hc / hc-light): the fill itself must clear the floor.
          const fill = hexToRgb(spec.fill)
          for (const surface of surfaces) {
            expect(contrast(fill, surface)).toBeGreaterThanOrEqual(NON_TEXT_MIN)
          }
        }
      })
    }
  }
})

describe('status LED colour system', () => {
  it('uses the same green for working and unread (motion/glow separate them)', () => {
    for (const { id: theme } of THEMES) {
      expect(STATUS_LED[theme].working.fill).toBe(STATUS_LED[theme].unread.fill)
    }
  })

  it('gives the glow only to unread', () => {
    for (const { id: theme } of THEMES) {
      expect(STATUS_LED[theme].unread.glow).toBeTruthy()
      expect(STATUS_LED[theme].working.glow).toBeUndefined()
      expect(STATUS_LED[theme].error.glow).toBeUndefined()
    }
  })
})
