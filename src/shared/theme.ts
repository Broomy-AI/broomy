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

export type ThemeName = 'dark'

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
  'on-accent',
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
}

/** `"26 26 26"` → `"#1a1a1a"`. Useful where a real hex is required (Electron chrome, xterm). */
export function hexFromTriplet(triplet: string): string {
  const parts = triplet.trim().split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`Invalid colour triplet: "${triplet}"`)
  }
  return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`
}
