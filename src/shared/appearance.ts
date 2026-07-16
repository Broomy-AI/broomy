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

/**
 * The status-indicator colour preference: the built-in green (`'default'`), the theme
 * accent (`'accent'`), or a custom `#rrggbb`. The template-literal union keeps the two
 * sentinels visible in autocomplete while still allowing any hex.
 */
export type StatusColorPreference = 'default' | 'accent' | `#${string}`

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
   * 'auto' is theme-aware and is what you want: 7 on dark, 4.5 on light.
   *
   * A single fixed number cannot serve both. The DARK ANSI palette is bright
   * pastels, where 7 is a useful safety net for tools that print colours tuned for
   * some other background. But the LIGHT palette is designed to clear 4.5 natively
   * (its slots land at 4.5-5.9:1), so a floor of 7 forces xterm to darken every
   * single one of them until they hit 7 — cyan, yellow, blue, green and red all
   * collapse into the same muddy brown, and the hues stop meaning anything.
   */
  terminalContrast: number | 'auto'
  /** The accent HUE. Fitted per theme — see deriveAccent. */
  accent: string
  /**
   * Colour of the status indicators — the unread "check me" dot and the "Working"
   * spinner. `'default'` is the semantic green, `'accent'` follows the theme accent, a
   * `#rrggbb` is a custom pick. Unlike `accent`, this is fitted to the NON-TEXT contrast
   * floor (3:1; 4.5:1 in high contrast): a dot is not text, and tuning it to 4.5:1 is
   * exactly what made the old green come out dark. See resolveStatusColorVar.
   */
  statusColor: StatusColorPreference
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
  // The semantic green, brightened per theme via the status-accent token. Not tied to
  // `accent`: a purple button next to a green "ready" dot is the sensible default.
  statusColor: 'default',
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

/** Recognises a #rrggbb hex, shared by the status-colour resolvers and the normaliser. */
const STATUS_HEX = /^#[0-9a-fA-F]{6}$/

/**
 * Status-indicator contrast floor. The dot and the spinner are NON-TEXT indicators
 * (WCAG 1.4.11, 3:1), not text — holding a filled dot to the 4.5:1 body-text bar is
 * exactly what made the old green come out dark. High contrast asks for more, so 4.5.
 */
const statusTarget = (theme: ThemeName): number => (theme === 'hc' || theme === 'hc-light' ? 4.5 : 3)

/**
 * Fit a custom status colour to the theme — like deriveAccent, but to the non-text floor
 * and against the WORST-CASE surface. The indicators sit on the sidebar (bg-secondary)
 * and on active/hover cards; for a colour darkened (light theme) or lightened (dark
 * theme) to reach a floor, bg-tertiary is the hardest of the three SOLID surfaces in every
 * theme, so clearing it clears all three.
 *
 * Two residuals are deliberately NOT modelled and are accepted as within tolerance:
 *   - the active card tints its ground with bg-accent/15, so a very dark accent can make
 *     that one card's surface darker than bg-tertiary;
 *   - the dark working spinner renders its arc at 75% opacity (--spinner-arc-opacity).
 * Either can dip a floor-hugging pick a little under target on that single card / that
 * spinner — a small shortfall on a redundantly-encoded non-text dot (unread also bolds the
 * name and enlarges the dot), not the 1.4:1 washout this replaced. Modelling them would
 * make the fit accent-dependent and re-darken the default green we set out to brighten.
 */
export function deriveStatusColor(hex: string, theme: ThemeName) {
  let picked: Rgb
  try {
    picked = hexToRgb(hex)
  } catch {
    picked = parseTriplet(PALETTE[theme]['status-accent'])
  }
  const bg = parseTriplet(PALETTE[theme]['bg-tertiary'])
  const fitted = fitContrast(picked, bg, statusTarget(theme))
  return {
    rgb: fitted,
    triplet: rgbToTriplet(fitted),
    contrastVsBg: contrast(fitted, bg),
    /** True when the pick had to be adjusted — worth telling the user. */
    adjusted: fitted.join() !== picked.join(),
  }
}

/**
 * The RGB the status indicators resolve to for the current preference + theme, so the
 * Settings preview matches the sidebar. `'accent'` follows the theme accent; a valid hex
 * is fitted; anything else (`'default'`, or a hand-edited/garbage value) is the token
 * default green.
 */
export function resolveStatusColorRgb(appearance: Appearance, theme: ThemeName): Rgb {
  const { statusColor } = appearance
  if (statusColor === 'accent') return deriveAccent(appearance.accent, theme).accent
  if (typeof statusColor === 'string' && STATUS_HEX.test(statusColor)) {
    return deriveStatusColor(statusColor, theme).rgb
  }
  return parseTriplet(PALETTE[theme]['status-accent'])
}

/**
 * The triplet to write to the inline `--color-status-accent`, or `null` to clear it and
 * let the per-theme CSS token (the green) win. Only `'accent'` and a custom hex override.
 */
export function resolveStatusColorVar(appearance: Appearance, theme: ThemeName): string | null {
  const { statusColor } = appearance
  const override = statusColor === 'accent' || (typeof statusColor === 'string' && STATUS_HEX.test(statusColor))
  return override ? rgbToTriplet(resolveStatusColorRgb(appearance, theme)) : null
}

/** True when the resolved theme has a light base. Terminals and editors need this. */
export const themeIsLight = (theme: ThemeName): boolean => IS_LIGHT[theme]

/**
 * The actual floor to hand xterm.
 *
 * On a light ground the palette already clears 4.5:1, so raising the floor to 7
 * only destroys it. On dark, 7 remains the safety net it has always been.
 */
export function resolveTerminalContrast(
  setting: number | 'auto',
  theme: ThemeName
): number {
  if (setting !== 'auto') return setting
  return themeIsLight(theme) ? 4.5 : 7
}

const clampToSteps = (value: unknown, steps: readonly number[], fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return steps.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best), steps[0])
}

const VALID_THEMES: ThemePreference[] = ['dark', 'light', 'hc', 'hc-light', 'system']

/** 'accent' and a valid #rrggbb pass through; everything else → 'default'. */
function normalizeStatusColor(raw: unknown): StatusColorPreference {
  if (raw === 'accent') return 'accent'
  if (typeof raw === 'string' && STATUS_HEX.test(raw)) return raw as `#${string}`
  return 'default'
}

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
    statusColor: normalizeStatusColor(r.statusColor),
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
