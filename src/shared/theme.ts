/**
 * Single source of truth for the colour palette.
 *
 * Values are stored as space-separated sRGB triplets ("26 26 26") because
 * Tailwind consumes them as `rgb(var(--token) / <alpha-value>)`. That channel
 * form is what keeps the ~110 alpha-modifier utilities (`bg-accent/80`,
 * `border-border/50`) working: a bare `var(--token)` holding a hex would make
 * Tailwind emit nothing for every one of them.
 *
 * `src/renderer/theme.css.test.ts` asserts that `index.css` matches this table,
 * so the CSS and this file cannot drift apart.
 *
 * Dark is the only theme defined here for now, and its values are byte-identical
 * to the hex literals they replace — the refactor is a no-op by construction.
 * Light and high-contrast are added on top of this in the theming PR.
 */

export type ThemeName = 'dark' | 'light' | 'hc' | 'hc-light'

export const THEMES: { id: ThemeName; label: string; note?: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'hc-light', label: 'High contrast (light)' },
  { id: 'hc', label: 'High contrast (dark)' },
]

/** Every colour token in the system, in the order they appear in index.css. */
export const TOKENS = [
  // surfaces
  'bg-primary',
  'bg-secondary',
  'bg-tertiary',
  // lines
  'border',
  'border-strong',
  // text
  'text-primary',
  'text-secondary',
  'text-tertiary',
  // brand
  'accent',
  // The label on the USER-CHOSEN accent fill. Overridden at runtime — it flips
  // white/black depending on how light the chosen accent turns out to be.
  'on-accent',
  // The label on a SEMANTIC solid fill (danger, success, review, ...). Static per
  // theme, and deliberately NOT tied to the accent: picking an amber accent must not
  // put a black label on a red button.
  'on-solid',
  // session/agent status
  'status-working',
  'status-waiting',
  'status-idle',
  'status-error',
  // semantic roles. Each is a small scale rather than a single value, because the
  // app genuinely uses several steps of each hue: text at one weight, tints and
  // borders at another, button fills at a third. Tiers:
  //   subtle/soft  quiet text
  //   fg           default text for the role
  //   base         tints and borders (used with an alpha modifier)
  //   solid        button fill (pairs with on-accent)
  //   strong/deeper/deep  strong borders and the dark grounds of banners
  'danger-soft', 'danger-fg', 'danger-base', 'danger-solid', 'danger-deeper', 'danger-deep',
  'warning-subtle', 'warning-soft', 'warning-fg', 'warning-base', 'warning-solid', 'warning-strong', 'warning-deep',
  'success-soft', 'success-fg', 'success-base', 'success-solid', 'success-deep',
  'info-subtle', 'info-soft', 'info-fg', 'info-base', 'info-solid', 'info-strong', 'info-deep',
  'review-fg', 'review-base', 'review-solid', 'review-strong', 'review-deep',
  // Orange stays its own role. It is the PR-feedback signal; folding it into
  // `warning` would make it identical to modified-file yellow AND the
  // agent-waiting dot — three meanings, one colour, in the sidebar.
  'attention-fg', 'attention-base', 'attention-solid',
  'note-fg', 'note-base',
  // neutral roles
  'muted',
  'surface-hover',
  'overlay',
  // A wash applied OVER a surface to lift it. White on a dark ground; in a light
  // theme it must become black, which a raw `bg-white/10` can never do.
  'elevate',
  // one-off consumers that are not Tailwind utilities
  'focus-ring',
  'search-highlight',
] as const

export type Token = (typeof TOKENS)[number]

export const PALETTE: Record<ThemeName, Record<Token, string>> = {
  dark: {
    'bg-primary': '26 26 26',          // #1a1a1a
    'bg-secondary': '37 37 37',        // #252525
    'bg-tertiary': '45 45 45',         // #2d2d2d
    'border': '58 58 58',              // #3a3a3a
    'border-strong': '74 74 74',       // #4a4a4a — the raw hex in Divider.tsx
    'text-primary': '224 224 224',     // #e0e0e0
    'text-secondary': '160 160 160',   // #a0a0a0
    'text-tertiary': '148 148 148',    // #949494
    'accent': '74 158 255',            // #4a9eff
    'on-accent': '255 255 255',        // label on a saturated fill
    'on-solid': '255 255 255',
    'status-working': '74 222 128',    // #4ade80
    'status-waiting': '250 204 21',    // #facc15
    'status-idle': '107 114 128',      // #6b7280
    'status-error': '248 113 113',     // #f87171

    // Each value is the exact hex of the Tailwind shade it replaces, so adopting
    // the token changes the vocabulary and not one pixel.
    'danger-soft': '252 165 165',      // #fca5a5 (red-300)
    'danger-fg': '248 113 113',        // #f87171 (red-400)
    'danger-base': '239 68 68',        // #ef4444 (red-500)
    'danger-solid': '220 38 38',       // #dc2626 (red-600)
    'danger-deeper': '153 27 27',      // #991b1b (red-800)
    'danger-deep': '127 29 29',        // #7f1d1d (red-900)
    'warning-subtle': '254 240 138',   // #fef08a (yellow-200)
    'warning-soft': '253 224 71',      // #fde047 (yellow-300)
    'warning-fg': '250 204 21',        // #facc15 (yellow-400)
    'warning-base': '234 179 8',       // #eab308 (yellow-500)
    'warning-solid': '202 138 4',      // #ca8a04 (yellow-600)
    'warning-strong': '161 98 7',      // #a16207 (yellow-700)
    'warning-deep': '113 63 18',       // #713f12 (yellow-900)
    'success-soft': '134 239 172',     // #86efac (green-300)
    'success-fg': '74 222 128',        // #4ade80 (green-400)
    'success-base': '34 197 94',       // #22c55e (green-500)
    'success-solid': '22 163 74',      // #16a34a (green-600)
    'success-deep': '20 83 45',        // #14532d (green-900)
    'info-subtle': '191 219 254',      // #bfdbfe (blue-200)
    'info-soft': '147 197 253',        // #93c5fd (blue-300)
    'info-fg': '96 165 250',           // #60a5fa (blue-400)
    'info-base': '59 130 246',         // #3b82f6 (blue-500)
    'info-solid': '37 99 235',         // #2563eb (blue-600)
    'info-strong': '29 78 216',        // #1d4ed8 (blue-700)
    'info-deep': '30 58 138',          // #1e3a8a (blue-900)
    'review-fg': '192 132 252',        // #c084fc (purple-400)
    'review-base': '168 85 247',       // #a855f7 (purple-500)
    'review-solid': '147 51 234',      // #9333ea (purple-600)
    'review-strong': '126 34 206',     // #7e22ce (purple-700)
    'review-deep': '88 28 135',        // #581c87 (purple-900)
    'attention-fg': '251 146 60',      // #fb923c (orange-400)
    'attention-base': '249 115 22',    // #f97316 (orange-500)
    'attention-solid': '234 88 12',    // #ea580c (orange-600)
    'note-fg': '34 211 238',           // #22d3ee (cyan-400)
    'note-base': '6 182 212',          // #06b6d4 (cyan-500)

    'muted': '107 114 128',            // #6b7280 (gray-500) — grey chips and dots
    'surface-hover': '64 64 64',       // #404040 (neutral-700) — neutral hover fill
    'overlay': '0 0 0',                // the modal scrim; stays dark in every theme
    'elevate': '255 255 255',          // #ffffff — was bg-white/10

    'focus-ring': '59 130 246',        // #3b82f6 — used at 0.4 alpha today
    'search-highlight': '255 213 0',   // #ffd500
  },

  /**
   * Light.
   *
   * The base is a warm off-white, deliberately NOT #ffffff: pure white's specular
   * glare is itself a source of low-vision eye strain.
   *
   * Note the role tiers INVERT. `deep`/`deeper`/`strong` are the dark grounds of
   * banners in the dark theme; on a light ground they must become PALE grounds, or
   * every banner turns into a black box. Meanwhile `soft`/`fg` must darken, since
   * a colour readable on #1a1a1a is not readable on #fbfbfa — the accent is the
   * clearest case: #4a9eff is 2.66:1 here, a catastrophic fail.
   *
   * Contrast ratios are asserted in theme.contrast.test.ts, not eyeballed.
   */
  light: {
    'bg-primary': '251 251 250',       // #fbfbfa
    'bg-secondary': '242 242 240',     // #f2f2f0
    'bg-tertiary': '230 230 227',      // #e6e6e3 — "raised" is DARKER on light
    'border': '194 194 187',           // #c2c2bb
    'border-strong': '143 143 136',    // #8f8f88 — clears WCAG 1.4.11 (3:1)
    'text-primary': '28 28 26',        // #1c1c1a — 16.5:1
    'text-secondary': '82 82 73',      // #525249 —  7.6:1 (the most-used text class)
    'text-tertiary': '97 97 90',       // #61615a —  6.0:1
    'accent': '14 79 174',             // #0e4fae —  7.4:1 (dark accent is 2.66:1 here)
    'on-accent': '255 255 255',
    'on-solid': '255 255 255',
    'status-working': '22 101 52',     // green-800
    'status-waiting': '133 77 14',     // yellow-800 — yellow-700 was 4.39:1 on bg-secondary
    'status-idle': '87 83 78',         // #57534e
    'status-error': '185 28 28',       // #b91c1c

    'danger-soft': '153 27 27',        // red-800
    'danger-fg': '185 28 28',          // red-700
    'danger-base': '220 38 38',        // red-600
    'danger-solid': '185 28 28',       // red-700 — dark enough to carry a white label
    'danger-deeper': '254 202 202',    // red-200  <- inverted: a pale border
    'danger-deep': '254 226 226',      // red-100  <- inverted: a pale ground
    'warning-subtle': '133 77 14',     // yellow-800
    'warning-soft': '146 64 14',       // amber-800
    'warning-fg': '133 77 14',         // yellow-800 — 6.2:1
    'warning-base': '202 138 4',       // yellow-600
    'warning-solid': '133 77 14',      // yellow-800
    'warning-strong': '253 224 71',    // yellow-300 <- inverted: a pale border
    'warning-deep': '254 249 195',     // yellow-100 <- inverted: a pale ground
    'success-soft': '22 101 52',       // green-800
    'success-fg': '22 101 52',        // green-800 — 6.1:1 (green-700 was 4.47:1 on bg-secondary)
    'success-base': '22 163 74',       // green-600
    'success-solid': '21 128 61',      // green-700
    'success-deep': '220 252 231',     // green-100 <- inverted
    'info-subtle': '30 64 175',        // blue-800
    'info-soft': '29 78 216',          // blue-700
    'info-fg': '29 78 216',            // blue-700 — 6.5:1
    'info-base': '37 99 235',          // blue-600
    'info-solid': '29 78 216',         // blue-700
    'info-strong': '147 197 253',      // blue-300 <- inverted: a pale border
    'info-deep': '219 234 254',        // blue-100 <- inverted: a pale ground
    'review-fg': '126 34 206',         // purple-700 — 6.9:1
    'review-base': '147 51 234',       // purple-600
    'review-solid': '126 34 206',      // purple-700
    'review-strong': '216 180 254',    // purple-300 <- inverted
    'review-deep': '243 232 255',      // purple-100 <- inverted
    'attention-fg': '154 52 18',       // orange-800 — orange-700 was 4.14:1 on bg-tertiary
    'attention-base': '234 88 12',     // orange-600
    'attention-solid': '194 65 12',    // orange-700
    'note-fg': '21 94 117',            // cyan-800 — cyan-700 was 4.28:1 on bg-tertiary
    'note-base': '8 145 178',          // cyan-600

    'muted': '91 98 112',              // #5b6270 — 5.9:1
    'surface-hover': '226 226 222',    // #e2e2de
    'overlay': '28 28 26',             // scrim stays DARK — a pale scrim reads as nothing
    'elevate': '0 0 0',                // a wash OVER a surface: black on light, white on dark
    'focus-ring': '14 79 174',         // #0e4fae — 7.4:1
    'search-highlight': '202 138 4',   // #ca8a04 — #ffd500 is invisible on white
  },

  /**
   * High contrast (dark).
   *
   * NOT "more contrast on the same palette" — the defining move is HIERARCHY
   * COLLAPSE: text-secondary stops being a dimmer tier and resolves to primary.
   * ~400 elements in this app are deliberately greyed below body text, and no
   * amount of magnification makes grey legible; only removing the dimming does.
   *
   * Kept as an option, but note white-on-black maximises halation and is the
   * WORST configuration for astigmatism — hc-light is the one to reach for there.
   */
  hc: {
    'bg-primary': '0 0 0',
    'bg-secondary': '10 10 10',
    'bg-tertiary': '26 26 26',
    'border': '118 118 118',           // 3:1 minimum for non-text
    'border-strong': '176 176 176',
    'text-primary': '255 255 255',     // 21:1
    'text-secondary': '255 255 255',   // <- COLLAPSED. No dimmer tier.
    'text-tertiary': '224 224 224',    // one step off, ~17:1
    'accent': '124 196 255',
    'on-accent': '0 0 0',              // dark label on a bright fill
    'on-solid': '0 0 0',
    'status-working': '94 255 159',
    'status-waiting': '255 225 77',
    'status-idle': '176 176 176',
    'status-error': '255 128 128',

    'danger-soft': '255 179 179',
    'danger-fg': '255 138 138',
    'danger-base': '255 107 107',
    'danger-solid': '255 107 107',
    'danger-deeper': '255 179 179',
    'danger-deep': '61 0 0',
    'warning-subtle': '255 240 138',
    'warning-soft': '255 225 77',
    'warning-fg': '255 225 77',
    'warning-base': '255 208 0',
    'warning-solid': '255 208 0',
    'warning-strong': '255 240 138',
    'warning-deep': '61 46 0',
    'success-soft': '147 255 192',
    'success-fg': '94 255 159',
    'success-base': '52 235 130',
    'success-solid': '52 235 130',
    'success-deep': '0 51 20',
    'info-subtle': '188 223 255',
    'info-soft': '142 203 255',
    'info-fg': '142 203 255',
    'info-base': '108 186 255',
    'info-solid': '108 186 255',
    'info-strong': '188 223 255',
    'info-deep': '0 31 61',
    'review-fg': '234 160 255',
    'review-base': '221 122 255',
    'review-solid': '221 122 255',
    'review-strong': '242 194 255',
    'review-deep': '46 0 61',
    'attention-fg': '255 176 102',
    'attention-base': '255 149 51',
    'attention-solid': '255 149 51',
    'note-fg': '127 230 245',
    'note-base': '77 214 235',

    'muted': '176 176 176',
    'surface-hover': '51 51 51',
    'overlay': '0 0 0',
    'elevate': '255 255 255',
    'focus-ring': '255 255 0',         // maximum-visibility yellow
    'search-highlight': '255 255 0',
  },

  /**
   * High contrast (light). Same hierarchy collapse, on a white ground.
   * This is the mode for astigmatism/halation: dark text on light is the
   * low-halation configuration, and the greys stop hiding.
   */
  'hc-light': {
    'bg-primary': '255 255 255',
    'bg-secondary': '245 245 245',
    'bg-tertiary': '232 232 232',
    'border': '89 89 89',
    'border-strong': '51 51 51',
    'text-primary': '0 0 0',           // 21:1
    'text-secondary': '0 0 0',         // <- COLLAPSED
    'text-tertiary': '26 26 26',
    'accent': '0 61 153',
    'on-accent': '255 255 255',
    'on-solid': '255 255 255',
    'status-working': '0 102 34',
    'status-waiting': '122 74 0',
    'status-idle': '61 61 61',
    'status-error': '160 0 0',

    'danger-soft': '128 0 0',
    'danger-fg': '160 0 0',
    'danger-base': '178 10 39',
    'danger-solid': '160 0 0',
    'danger-deeper': '255 205 205',
    'danger-deep': '255 235 235',
    'warning-subtle': '92 56 0',
    'warning-soft': '92 56 0',
    'warning-fg': '92 56 0',
    'warning-base': '122 74 0',
    'warning-solid': '92 56 0',
    'warning-strong': '250 224 130',
    'warning-deep': '255 248 219',
    'success-soft': '0 77 25',
    'success-fg': '0 102 34',
    'success-base': '0 102 34',
    'success-solid': '0 102 34',
    'success-deep': '223 250 231',
    'info-subtle': '0 45 115',
    'info-soft': '0 45 115',
    'info-fg': '0 61 153',
    'info-base': '0 61 153',
    'info-solid': '0 61 153',
    'info-strong': '176 205 245',
    'info-deep': '228 238 252',
    'review-fg': '82 11 143',
    'review-base': '82 11 143',
    'review-solid': '82 11 143',
    'review-strong': '221 190 246',
    'review-deep': '245 235 253',
    'attention-fg': '148 50 0',
    'attention-base': '148 50 0',
    'attention-solid': '148 50 0',
    'note-fg': '0 82 94',
    'note-base': '0 82 94',

    'muted': '61 61 61',
    'surface-hover': '224 224 224',
    'overlay': '0 0 0',
    'elevate': '0 0 0',
    'focus-ring': '0 61 153',
    'search-highlight': '122 74 0',
  },
}

/** Themes whose base surface is light. Used to pick label colours and terminal palettes. */
export const IS_LIGHT: Record<ThemeName, boolean> = {
  dark: false,
  light: true,
  hc: false,
  'hc-light': true,
}

/** `"26 26 26"` → `"#1a1a1a"`. Useful where a real hex is required (Electron chrome, xterm). */
export function hexFromTriplet(triplet: string): string {
  const parts = triplet.trim().split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`Invalid colour triplet: "${triplet}"`)
  }
  return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`
}
