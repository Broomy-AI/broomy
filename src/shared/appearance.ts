/**
 * Appearance preferences: the shape, the defaults, and the rules for validating
 * them. Shared by main (which owns the file and the native chrome), preload, and
 * the renderer.
 *
 * These live in a GLOBAL ~/.broomy/settings.json rather than the per-profile
 * config.json, for two reasons:
 *
 *   - `nativeTheme.themeSource` is process-global. If two profile windows disagreed
 *     about the theme, the native chrome (traffic lights, context menus, file
 *     dialogs) could only satisfy one of them.
 *   - How readable a UI is, is a property of the person's eyes — not of which
 *     project they happen to have open. Opening a new profile must not reset a
 *     low-vision user to 13px dark.
 */
import { bestLabelOn, contrast, fitContrast, hexToRgb, parseTriplet, rgbToTriplet, type Rgb } from './color'
import { IS_LIGHT, PALETTE, type ThemeName } from './theme'

/** What the user picks. `system` follows the OS appearance. */
export type ThemePreference = ThemeName | 'system'

export interface Appearance {
  theme: ThemePreference
  /** Multiplies every font-size token. Reaches the agent transcript, session list
   *  and explorer — all React text, which a terminal font-size cannot touch. */
  appTextScale: number
  /** Whole-window zoom factor. Scales px, rem, SVG and inline styles alike. */
  interfaceScale: number
  /** Monaco + xterm, in px. */
  editorFontSize: number
  /** xterm line spacing. Tight leading on a dense TUI is a low-vision problem. */
  terminalLineHeight: number
  /**
   * xterm's minimumContrastRatio floor.
   *
   * 'auto' is theme-aware and is what you want: off (1) on standard light (so the
   * palette renders as authored — faithful colours), 4.5 on hc-light, 7 on dark/hc.
   *
   * A single fixed number cannot serve both. The DARK ANSI palette is bright
   * pastels, where 7 is a useful safety net for tools that print colours tuned for
   * some other background. But MOST of the LIGHT palette already clears 4.5 natively
   * (those slots land at 4.5-5.9:1). A floor of 4.5 would darken only the two green
   * exceptions (which sit below it); a floor of 7 would push nearly every slot down to
   * reach it, so cyan, yellow, blue, green and red all collapse into the same muddy
   * brown. Standard light therefore turns the floor OFF entirely: its green/brightGreen
   * sit deliberately below 4.5, for a faithful, iTerm-like look — a fidelity choice, not
   * a legibility one. hc-light keeps 4.5 for users who want the extra floor.
   */
  terminalContrast: number | 'auto'
  /** The accent HUE. Fitted per theme — see deriveAccent. */
  accent: string
  /**
   * Colour-code the per-repo "rail" beside each sidebar group. On by default (a wayfinding
   * cue); when off, the rail is a neutral grey so the sidebar reads calmer.
   */
  sidebarRailColored: boolean
}

export const DEFAULT_APPEARANCE: Appearance = {
  // 'dark' rather than 'system': defaulting to system would silently flip every
  // existing user on a light OS, and would make Storybook and the committed
  // marketing screenshots depend on the host machine's appearance.
  theme: 'dark',
  appTextScale: 1,
  interfaceScale: 1,
  editorFontSize: 13,
  terminalLineHeight: 1.2,
  terminalContrast: 'auto',
  accent: '#4a9eff',
  sidebarRailColored: true,
}

export const APP_TEXT_SCALES = [1, 1.1, 1.25, 1.4] as const

/**
 * Floors at 1.0 on purpose. Scaling *down* is useless to a low-vision user and is
 * the only direction that collides with the native window controls: the toolbar
 * reserves a fixed strip in CSS px for the traffic lights, and that strip shrinks
 * under zoom while the native buttons do not.
 *
 * Caps at 2.0. Past that a four-panel app stops being a four-panel app — the panel
 * minimums already sum to 700 CSS px, so at 200% on a 1512px display every panel
 * is pinned to its floor. Beyond this, the OS magnifier is the right tool.
 */
export const INTERFACE_SCALES = [1, 1.1, 1.25, 1.5, 1.75, 2] as const

export const EDITOR_FONT_SIZES = [11, 12, 13, 14, 16, 18, 20, 22, 24] as const
export const TERMINAL_LINE_HEIGHTS = [1.2, 1.4, 1.6] as const
export const TERMINAL_CONTRASTS = ['auto', 4.5, 7, 21] as const

export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Blue', hex: '#4a9eff' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Magenta', hex: '#ff00ff' },
]

export function resolveTheme(preference: ThemePreference, systemIsDark: boolean): ThemeName {
  if (preference !== 'system') return preference
  return systemIsDark ? 'dark' : 'light'
}

/** Accent contrast target. High contrast demands more. */
const accentTarget = (theme: ThemeName) => (theme === 'hc' || theme === 'hc-light' ? 7 : 4.5)

/**
 * Fit the user's accent to the active theme.
 *
 * The pick is a HUE, not a final value. #4a9eff is a good accent on #1a1a1a (6.3:1)
 * and an unreadable one on #fbfbfa (2.66:1), so shipping the raw pick would give a
 * light-mode user unreadable buttons. We move only its OKLCH lightness — hue and
 * chroma hold, so a magenta stays a magenta — then choose the button label by
 * whichever of white/black actually wins against the fitted fill.
 *
 * Fitting in HSL instead would preserve the hue *angle* but not the hue you see: a
 * rose darkens into crimson. That is not hypothetical; it was the first thing the
 * user rejected.
 */
export function deriveAccent(accentHex: string, theme: ThemeName) {
  let picked: Rgb
  try {
    picked = hexToRgb(accentHex)
  } catch {
    picked = hexToRgb(DEFAULT_APPEARANCE.accent)
  }
  const bg = parseTriplet(PALETTE[theme]['bg-primary'])
  const accent = fitContrast(picked, bg, accentTarget(theme))
  const onAccent = bestLabelOn(accent)
  return {
    accent,
    onAccent,
    accentTriplet: rgbToTriplet(accent),
    onAccentTriplet: rgbToTriplet(onAccent),
    contrastVsBg: contrast(accent, bg),
    contrastLabelOnFill: contrast(onAccent, accent),
    /** True when the pick had to be adjusted — worth telling the user. */
    adjusted: accent.join() !== picked.join(),
  }
}

/** True when the resolved theme has a light base. Terminals and editors need this. */
export const themeIsLight = (theme: ThemeName): boolean => IS_LIGHT[theme]

/**
 * The automatic floor, stated per theme rather than derived from themeIsLight.
 *
 * The four outcomes are genuinely four decisions, not two rules — deriving them
 * would mean a fifth theme silently inherits a floor nobody chose for it.
 *
 * - light     1   OFF (xterm's disabled value). The ANSI palette renders as authored,
 *                 which is the whole point: its greens sit below 4.5 for fidelity.
 * - hc-light  4.5 Its users asked for the extra floor, and its palette clears it natively.
 * - dark/hc   7   The safety net dark has always had, for tools printing foreign colours.
 */
const AUTO_TERMINAL_CONTRAST: Record<ThemeName, number> = {
  light: 1,
  'hc-light': 4.5,
  dark: 7,
  hc: 7,
}

/**
 * The actual floor to hand xterm.
 *
 * A floor above what the palette natively achieves does not clamp — on a light ground
 * xterm DARKENS every foreground until it reaches the floor, so 7 on light collapses
 * cyan, yellow, blue and green into the same muddy brown.
 */
export function resolveTerminalContrast(
  setting: number | 'auto',
  theme: ThemeName
): number {
  if (setting !== 'auto') return setting
  return AUTO_TERMINAL_CONTRAST[theme]
}

const clampToSteps = (value: unknown, steps: readonly number[], fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return steps.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best), steps[0])
}

const VALID_THEMES: ThemePreference[] = ['dark', 'light', 'hc', 'hc-light', 'system']

/**
 * Coerce anything off disk into a usable Appearance. A hand-edited or
 * partially-written settings file must degrade to defaults, never crash the app
 * before its first window exists.
 */
export function normalizeAppearance(raw: unknown): Appearance {
  const r = (raw ?? {}) as Partial<Record<keyof Appearance, unknown>>
  return {
    theme: VALID_THEMES.includes(r.theme as ThemePreference)
      ? (r.theme as ThemePreference)
      : DEFAULT_APPEARANCE.theme,
    appTextScale: clampToSteps(r.appTextScale, APP_TEXT_SCALES, DEFAULT_APPEARANCE.appTextScale),
    interfaceScale: clampToSteps(r.interfaceScale, INTERFACE_SCALES, DEFAULT_APPEARANCE.interfaceScale),
    editorFontSize: clampToSteps(r.editorFontSize, EDITOR_FONT_SIZES, DEFAULT_APPEARANCE.editorFontSize),
    terminalLineHeight: clampToSteps(r.terminalLineHeight, TERMINAL_LINE_HEIGHTS, DEFAULT_APPEARANCE.terminalLineHeight),
    terminalContrast:
      r.terminalContrast === 'auto'
        ? 'auto'
        : clampToSteps(r.terminalContrast, [4.5, 7, 21], 7),
    accent:
      typeof r.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.accent)
        ? r.accent
        : DEFAULT_APPEARANCE.accent,
    sidebarRailColored:
      typeof r.sidebarRailColored === 'boolean'
        ? r.sidebarRailColored
        : DEFAULT_APPEARANCE.sidebarRailColored,
  }
}

/** Step through a scale list, clamped at both ends. Used by the zoom menu items. */
export function stepScale(current: number, delta: number, steps: readonly number[]): number {
  const i = steps.indexOf(clampToSteps(current, steps, steps[0]))
  return steps[Math.max(0, Math.min(steps.length - 1, i + delta))]
}

/** What main sends the renderer: the preference, plus the OS state needed to resolve it. */
export interface AppearanceSnapshot {
  appearance: Appearance
  systemIsDark: boolean
  resolvedTheme: ThemeName
}
