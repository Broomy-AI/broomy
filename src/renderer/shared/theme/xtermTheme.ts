/**
 * xterm palettes, one per theme.
 *
 * The light palettes are NOT the dark one inverted. The dark ANSI colours are
 * bright pastels tuned for a near-black ground, and several are unreadable on
 * white — yellow #ffd43b is 1.4:1 there, literally invisible. Yellow has to become
 * a dark amber, which is what GitHub Light, Solarized Light and every other serious
 * light terminal do. It is not a compromise.
 *
 * Dark is byte-identical to the palette that used to live inline in
 * useTerminalSetup.ts, so it cannot shift.
 */
import type { ITheme } from '@xterm/xterm'
import type { ThemeName } from '../../../shared/theme'

const DARK: ITheme = {
  background: '#1a1a1a',
  foreground: '#e0e0e0',
  cursor: '#e0e0e0',
  cursorAccent: '#1a1a1a',
  selectionBackground: '#4a9eff40',
  black: '#5c5c5c',
  brightBlack: '#888888',
  red: '#ff6b6b',
  brightRed: '#ff9999',
  green: '#69db7c',
  brightGreen: '#8ce99a',
  yellow: '#ffd43b',
  brightYellow: '#ffe066',
  blue: '#74c0fc',
  brightBlue: '#a5d8ff',
  magenta: '#da77f2',
  brightMagenta: '#e599f7',
  cyan: '#66d9e8',
  brightCyan: '#99e9f2',
  white: '#e8e8e8',
  brightWhite: '#ffffff',
}

/**
 * Most slots clear 4.5:1 on #fbfbfa. Green is the exception: it is intentionally brightened
 * toward a faithful, iTerm-like terminal green, because the 4.5-fitted dark green read as
 * muddy. That is a fidelity choice, and it only renders as authored because standard light
 * turns the contrast floor off (see resolveTerminalContrast) rather than darkening it back.
 *
 * Both greens still hold 3:1 — the WCAG large-text bar — on purpose. bright green is not a
 * decorative slot: it is what agents print for `+` diff lines, ✓ markers and pass counts, so
 * it has to stay readable at body size, not merely visible. The band is therefore two-sided:
 * vivid enough to not be the old muddy green, legible enough to still be text.
 */
const LIGHT: ITheme = {
  background: '#fbfbfa',
  foreground: '#1f2328',
  cursor: '#1f2328',
  cursorAccent: '#fbfbfa',
  selectionBackground: '#0a5ec933',
  black: '#24292f',
  brightBlack: '#4c5560',
  red: '#c02a30',
  brightRed: '#a81f25',
  green: '#128a3f',
  brightGreen: '#1ca14a',
  yellow: '#8a5a00',
  brightYellow: '#a06800',
  blue: '#0a5ec9',
  brightBlue: '#1668dd',
  magenta: '#8a3ec4',
  brightMagenta: '#7a2fb4',
  cyan: '#0b6e8a',
  brightCyan: '#0d7a99',
  white: '#616a75',
  brightWhite: '#3d444d',
}

const HC: ITheme = {
  background: '#000000',
  foreground: '#ffffff',
  cursor: '#ffff00',
  cursorAccent: '#000000',
  selectionBackground: '#ffff0055',
  black: '#8a8a8a',
  brightBlack: '#b0b0b0',
  red: '#ff8a8a',
  brightRed: '#ffb3b3',
  green: '#5eff9f',
  brightGreen: '#93ffc0',
  yellow: '#ffe14d',
  brightYellow: '#fff08a',
  blue: '#8ecbff',
  brightBlue: '#bcdfff',
  magenta: '#eaa0ff',
  brightMagenta: '#f2c2ff',
  cyan: '#7fe6f5',
  brightCyan: '#b0f0fa',
  white: '#f0f0f0',
  brightWhite: '#ffffff',
}

const HC_LIGHT: ITheme = {
  background: '#ffffff',
  foreground: '#000000',
  cursor: '#000000',
  cursorAccent: '#ffffff',
  selectionBackground: '#003d9933',
  black: '#000000',
  brightBlack: '#2b2b2b',
  red: '#a00000',
  brightRed: '#800000',
  green: '#006622',
  brightGreen: '#004d19',
  yellow: '#7a4a00',
  brightYellow: '#5c3800',
  blue: '#003d99',
  brightBlue: '#002d73',
  magenta: '#6b0f8f',
  brightMagenta: '#520b6e',
  cyan: '#00525e',
  brightCyan: '#003d47',
  white: '#3d3d3d',
  brightWhite: '#000000',
}

export const XTERM_THEMES: Record<ThemeName, ITheme> = {
  dark: DARK,
  light: LIGHT,
  hc: HC,
  'hc-light': HC_LIGHT,
}
