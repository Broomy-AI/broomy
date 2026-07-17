/**
 * The terminal palette must survive the contrast floor.
 *
 * xterm's `minimumContrastRatio` does not clamp — it DARKENS any foreground that
 * falls below the floor until it reaches it. So a floor set above what the palette
 * natively achieves rewrites every colour, and the hues collapse toward each other.
 *
 * That is not hypothetical: shipping the light theme with the dark theme's floor of
 * 7 turned Claude Code's status line — cyan, yellow, blue — into one uniform muddy
 * brown, because MOST light slots sit at 4.5-5.9:1 and all of them got pushed down.
 * (green/brightGreen are the deliberate exceptions — vivid, iTerm-like, below the text
 * bar — which is exactly why standard light turns the floor off; see the palette test.)
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
 * hue toward the same muddy brown. So the palette must clear the floor natively (or,
 * on standard light where the floor is off, the vivid green exceptions must stay in
 * their intended band), or it is not the palette that renders.
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

  it('every ANSI colour sits in its intended contrast band against the terminal background', () => {
    // Standard light intentionally brightens green toward a faithful, iTerm-like terminal
    // green — the 4.5-fitted dark green read as muddy. `green` lands at ~3.2:1 and the vivid
    // `brightGreen` at ~2.2:1: both sit BELOW the 4.5 text bar on purpose. That is a fidelity
    // trade-off, not a legibility guarantee — it only renders as authored because standard
    // light turns the contrast floor OFF (see resolveTerminalContrast); it does not make 2.2:1
    // text "accessible". The band is two-sided on purpose: the lower bound keeps the greens
    // visible, and the < 4.5 upper bound is what fails if someone reverts to the muddy
    // 4.5-fitted greens. Every other slot — and ALL of hc-light — still clears 4.5:1.
    const fidelityGreens: Record<string, number> = theme === 'light' ? { green: 3, brightGreen: 2 } : {}
    for (const slot of ANSI) {
      const ratio = contrast(hexToRgb(t[slot]!), bg)
      const floorFor = fidelityGreens[slot]
      if (floorFor !== undefined) {
        expect(
          ratio,
          `${slot} is ${ratio.toFixed(2)}:1 — a vivid fidelity green must stay >= ${floorFor}`
        ).toBeGreaterThanOrEqual(floorFor)
        expect(
          ratio,
          `${slot} is ${ratio.toFixed(2)}:1 — a >= 4.5 green means the muddy 4.5-fitted palette is back`
        ).toBeLessThan(4.5)
      } else {
        expect(ratio, `${slot} is ${ratio.toFixed(2)}:1 on ${t.background}`).toBeGreaterThanOrEqual(4.5)
      }
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

  it('is off (1) on standard light — the palette renders as authored, so no floor is imposed', () => {
    expect(resolveTerminalContrast('auto', 'light')).toBe(1)
  })

  it('is 4.5 on high-contrast light — its users want the extra floor, and the palette can take it', () => {
    expect(resolveTerminalContrast('auto', 'hc-light')).toBe(4.5)
  })

  it('respects an explicit override', () => {
    expect(resolveTerminalContrast(21, 'light')).toBe(21)
    expect(resolveTerminalContrast(4.5, 'dark')).toBe(4.5)
  })
})
