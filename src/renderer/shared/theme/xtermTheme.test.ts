/**
 * The terminal palette must survive the contrast floor.
 *
 * xterm's `minimumContrastRatio` does not clamp — it DARKENS any foreground that
 * falls below the floor until it reaches it. So a floor set above what the palette
 * natively achieves rewrites every colour, and the hues collapse toward each other.
 *
 * That is not hypothetical: shipping the light theme with the dark theme's floor of
 * 7 turned Claude Code's status line — cyan, yellow, blue — into one uniform muddy
 * brown, because every light slot sits at 4.5-5.9:1 and all of them got pushed down.
 */
import { describe, expect, it } from 'vitest'
import { XTERM_THEMES } from './xtermTheme'
import { resolveTerminalContrast } from '../../../shared/appearance'
import { contrast, hexToRgb } from '../../../shared/color'
import type { ThemeName } from '../../../shared/theme'

const ANSI = [
  'black', 'brightBlack', 'red', 'brightRed', 'green', 'brightGreen',
  'yellow', 'brightYellow', 'blue', 'brightBlue', 'magenta', 'brightMagenta',
  'cyan', 'brightCyan', 'white', 'brightWhite',
] as const

/**
 * LIGHT grounds only.
 *
 * On a light ground the floor DARKENS a foreground to reach it, which drags every
 * hue toward the same muddy brown. So the palette must clear the floor natively, or
 * it is not the palette that renders.
 *
 * On a DARK ground the floor LIGHTENS instead, and that is the safety net working as
 * designed — the ANSI `black` slot is deliberately dim (#5c5c5c, 2.60:1 on #1a1a1a)
 * and is meant to be lifted at render time. Dark is also byte-identical to what
 * shipped before, so it is deliberately exempt from these assertions.
 */
const LIGHT_THEMES: ThemeName[] = ['light', 'hc-light']

describe.each(LIGHT_THEMES)('%s terminal palette', (theme) => {
  const t = XTERM_THEMES[theme]
  const bg = hexToRgb(t.background!)
  const floor = resolveTerminalContrast('auto', theme)

  it('every ANSI colour is readable against the terminal background', () => {
    for (const slot of ANSI) {
      const ratio = contrast(hexToRgb(t[slot]!), bg)
      expect(ratio, `${slot} is ${ratio.toFixed(2)}:1 on ${t.background}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('the automatic floor never exceeds what the palette already achieves', () => {
    // If a slot sits below the floor, xterm darkens it — and the palette stops
    // being the palette. This is the regression that turned Claude Code's status
    // line (cyan, yellow, blue) into one uniform brown.
    for (const slot of ANSI) {
      const ratio = contrast(hexToRgb(t[slot]!), bg)
      expect(
        ratio,
        `${slot} is ${ratio.toFixed(2)}:1 but the floor is ${floor}:1 — xterm would darken it, muddying the hue`
      ).toBeGreaterThanOrEqual(floor)
    }
  })
})

describe('resolveTerminalContrast', () => {
  it('is 7 on dark grounds — the bright pastel palette can take it, and it guards foreign colours', () => {
    expect(resolveTerminalContrast('auto', 'dark')).toBe(7)
    expect(resolveTerminalContrast('auto', 'hc')).toBe(7)
  })

  it('is 4.5 on light grounds — anything higher destroys the palette', () => {
    expect(resolveTerminalContrast('auto', 'light')).toBe(4.5)
    expect(resolveTerminalContrast('auto', 'hc-light')).toBe(4.5)
  })

  it('respects an explicit override', () => {
    expect(resolveTerminalContrast(21, 'light')).toBe(21)
    expect(resolveTerminalContrast(4.5, 'dark')).toBe(4.5)
  })
})
