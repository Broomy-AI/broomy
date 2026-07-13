/**
 * Every colour pairing the UI can actually produce must be legible.
 *
 * The drift guard (theme.css.test.ts) proves the CSS matches the palette. This
 * proves the palette is *readable* — a different question, and the one that
 * matters for the person this work is for.
 *
 * It is not decoration. The four `status-*` tokens had no light values at all, and
 * at their dark values they land at 1.48:1–2.67:1 on a light ground: session state,
 * the single most important signal in the sidebar, would have been invisible. This
 * test fails on exactly that, automatically, for every theme we ever add.
 */
import { describe, expect, it } from 'vitest'
import { PALETTE, TOKENS, type ThemeName, type Token } from './theme'
import { composite, contrast, parseTriplet } from './color'

const THEME_NAMES = Object.keys(PALETTE) as ThemeName[]

/** WCAG AA: 4.5:1 for body text, 3:1 for large text and non-text (borders, focus). */
const AA_TEXT = 4.5
const AA_NON_TEXT = 3

const rgb = (theme: ThemeName, token: Token) => parseTriplet(PALETTE[theme][token])

/**
 * Pre-existing WCAG failures in the DARK theme, inherited from the raw Tailwind
 * colours this palette replaced. They are in the app today; this PR neither
 * introduces nor fixes them.
 *
 * They are not fixed here on purpose. Making white-on-accent pass would mean
 * flipping the label on ~73 primary buttons from white to black — a visible
 * redesign of dark mode for every existing user, which is a different change from
 * "add a light theme" and deserves its own PR and its own discussion.
 *
 * Enumerating them does three things a `skip` would not:
 *   - they are visible, with their exact ratios, instead of quietly absent;
 *   - the list cannot grow — any NEW dark failure fails the suite;
 *   - it cannot rot: `expectedFailures` below asserts each one is STILL failing, so
 *     whoever fixes one is forced to delete it from this list.
 *
 * Tracked as a follow-up. Every other theme is held to the full bar.
 */
const KNOWN_DARK_DEBT: Record<string, number> = {
  'muted on bg-primary': 3.6,               // #6b7280 — also backs status-idle
  'muted on bg-secondary': 3.6,
  'muted on bg-tertiary': 3.6,
  'status-idle on bg-primary': 3.6,
  'status-idle on bg-secondary': 3.6,
  'status-idle on bg-tertiary': 3.6,
  'on-accent on accent': 2.75,              // white on #4a9eff — every primary button
  'on-accent on warning-solid': 2.94,
  'on-accent on success-solid': 3.3,
  'on-accent on attention-solid': 3.56,
  'border-strong on bg-primary': 1.96,      // #4a4a4a on #1a1a1a
}

const debtKey = (fg: string, bg: string) => `${fg} on ${bg}`
const isKnownDebt = (theme: ThemeName, fg: string, bg: string) =>
  theme === 'dark' && debtKey(fg, bg) in KNOWN_DARK_DEBT

/** Assert a pairing clears the bar — unless it is pre-existing dark-theme debt. */
function expectContrast(theme: ThemeName, fg: Token, bg: Token, min: number) {
  const ratio = contrast(rgb(theme, fg), rgb(theme, bg))
  if (isKnownDebt(theme, fg, bg)) {
    // Still failing, as recorded. If this trips, someone fixed it — delete the entry.
    expect(ratio, `${debtKey(fg, bg)} now passes; remove it from KNOWN_DARK_DEBT`).toBeLessThan(min)
    return
  }
  expect(ratio, `${theme}: ${debtKey(fg, bg)} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min)
}

/** The surfaces a foreground colour can legally land on. */
const SURFACES: Token[] = ['bg-primary', 'bg-secondary', 'bg-tertiary']

/** Foregrounds that carry real text and must clear 4.5:1 on every surface. */
const TEXT_TOKENS: Token[] = [
  'text-primary',
  'text-secondary',
  'text-tertiary',
  'accent',
  'danger-fg',
  'warning-fg',
  'success-fg',
  'info-fg',
  'review-fg',
  'attention-fg',
  'note-fg',
  'muted',
]

/** Fills that carry a label. The label is `on-accent` in every case. */
const SOLIDS: Token[] = [
  'accent',
  'danger-solid',
  'warning-solid',
  'success-solid',
  'info-solid',
  'review-solid',
  'attention-solid',
]

describe.each(THEME_NAMES)('%s', (theme) => {
  it('defines every token', () => {
    expect(Object.keys(PALETTE[theme]).sort()).toEqual([...TOKENS].sort())
  })

  it.each(TEXT_TOKENS)('%s is readable on every surface', (token) => {
    for (const surface of SURFACES) expectContrast(theme, token, surface, AA_TEXT)
  })

  it.each(SOLIDS)('a label is readable on the %s fill', (token) => {
    expectContrast(theme, 'on-accent', token, AA_TEXT)
  })

  // Session state is the most important signal in the sidebar. At their dark
  // values on a light ground these are 1.48:1–2.67:1 — literally invisible.
  it.each(['status-working', 'status-waiting', 'status-idle', 'status-error'] as Token[])(
    '%s is visible on every surface',
    (token) => {
      for (const surface of SURFACES) expectContrast(theme, token, surface, AA_TEXT)
    }
  )

  it('the focus ring clears 3:1 — it is navigation, not decoration', () => {
    for (const surface of SURFACES) expectContrast(theme, 'focus-ring', surface, AA_NON_TEXT)
  })

  it('border-strong clears 3:1 (WCAG 1.4.11, non-text contrast)', () => {
    expectContrast(theme, 'border-strong', 'bg-primary', AA_NON_TEXT)
  })

  // Roles are used as `bg-danger-base/20` over a surface, with `text-danger-fg` on
  // top. A tint that composites to nothing makes the text sit on bare background —
  // survivable — but a tint that swallows its own text does not.
  it.each(['danger', 'warning', 'success', 'info', 'review'])(
    '%s text stays readable on its own tint',
    (role) => {
      const base = rgb(theme, `${role}-base` as Token)
      const fg = rgb(theme, `${role}-fg` as Token)
      const tint = composite(base, rgb(theme, 'bg-primary'), 0.2)
      const ratio = contrast(fg, tint)
      expect(ratio, `${role}-fg on ${role}-base/20 is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT)
    }
  )

  it('the modal scrim stays dark — a pale scrim does not read as modal', () => {
    const [r, g, b] = rgb(theme, 'overlay')
    expect(r + g + b).toBeLessThan(120)
  })
})

describe('high contrast collapses the hierarchy', () => {
  // The point of HC is not "more contrast on the same palette". ~400 elements in
  // this app are deliberately greyed below body text, and magnifying grey does not
  // make it legible — only removing the dimming does.
  it.each(['hc', 'hc-light'] as ThemeName[])('%s: text-secondary is no longer a dimmer tier', (theme) => {
    expect(PALETTE[theme]['text-secondary']).toBe(PALETTE[theme]['text-primary'])
  })

  it.each(['hc', 'hc-light'] as ThemeName[])('%s: body text is at or near maximum', (theme) => {
    const ratio = contrast(rgb(theme, 'text-primary'), rgb(theme, 'bg-primary'))
    expect(ratio).toBeGreaterThanOrEqual(15)
  })
})
