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
  return '#' + parts.map((n) => n.toString(16).padStart(2, '0')).join('')
}
