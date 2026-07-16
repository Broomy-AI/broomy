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
import { ACCENT_PRESETS, deriveAccent, deriveStatusColor } from './appearance'

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
  // The idle dot is a non-text indicator (3:1), but on the tertiary surface it is
  // 2.85:1 — pre-existing, and it predates this work.
  'status-idle on bg-tertiary': 2.85,
  'on-accent on accent': 2.75,              // white on #4a9eff — every primary button
  'on-solid on warning-solid': 2.94,        // white on yellow-600
  'on-solid on success-solid': 3.3,         // white on green-600
  'on-solid on attention-solid': 3.56,      // white on orange-600
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

/**
 * Semantic fills that carry a label. Their label is `on-solid`, which is STATIC per
 * theme — deliberately not `on-accent`, which follows the user's chosen accent and
 * flips white/black with it. Tying these together would mean picking an amber accent
 * puts a black label on a red button.
 */
const SOLIDS: Token[] = [
  'danger-solid',
  'warning-solid',
  'success-solid',
  'info-solid',
  'review-solid',
  'attention-solid',
  'muted',
]

describe.each(THEME_NAMES)('%s', (theme) => {
  it('defines every token', () => {
    expect(Object.keys(PALETTE[theme]).sort()).toEqual([...TOKENS].sort())
  })

  it.each(TEXT_TOKENS)('%s is readable on every surface', (token) => {
    for (const surface of SURFACES) expectContrast(theme, token, surface, AA_TEXT)
  })

  it.each(SOLIDS)('a label is readable on the %s fill', (token) => {
    expectContrast(theme, 'on-solid', token, AA_TEXT)
  })

  it('a label is readable on the default accent fill', () => {
    expectContrast(theme, 'on-accent', 'accent', AA_TEXT)
  })

  // Session state is the most important signal in the sidebar. At their dark
  // values on a light ground these are 1.48:1–2.67:1 — literally invisible.
  //
  // These are rendered as dots and a spinner — NON-TEXT indicators, WCAG floor 3:1.
  // status-accent is deliberately a vivid green rather than a dark forest one: a
  // 12px spinner tuned to 4.5:1 (as if it were body text) comes out so dark it reads
  // as "dark", not "green". The point of a status colour is to be recognisable at a
  // glance, and green on white cannot be both vivid AND clear 4.5:1.
  it.each(['status-accent', 'status-waiting', 'status-idle'] as Token[])(
    '%s is a visible non-text indicator on every surface',
    (token) => {
      for (const surface of SURFACES) expectContrast(theme, token, surface, AA_NON_TEXT)
    }
  )

  // status-error is the exception: it is also rendered as TEXT (error messages,
  // destructive-action hover), so it is held to the 4.5:1 text bar.
  it('status-error is readable as text on every surface', () => {
    for (const surface of SURFACES) expectContrast(theme, 'status-error', surface, AA_TEXT)
  })

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


/**
 * The accent is chosen at RUNTIME, so the static palette above cannot cover it. Every
 * preset must stay legible in every theme after fitting — both as a fill under its
 * label, and against the background.
 *
 * This is the test that would have caught the leak where the derived label (black,
 * for a light accent) was also being applied to the red/green/purple semantic
 * buttons.
 */
describe('user-chosen accents', () => {
  const cases = THEME_NAMES.flatMap((theme) =>
    ACCENT_PRESETS.map((preset) => ({ theme, preset }))
  )

  it.each(cases)('$preset.name stays legible in $theme', ({ theme, preset }) => {
    const { accent, onAccent, contrastVsBg, contrastLabelOnFill } = deriveAccent(preset.hex, theme)
    const min = theme === 'hc' || theme === 'hc-light' ? 7 : AA_TEXT

    expect(contrastVsBg, `${preset.name} on ${theme} bg is ${contrastVsBg.toFixed(2)}:1`).toBeGreaterThanOrEqual(min)
    expect(
      contrastLabelOnFill,
      `label on ${preset.name} fill is ${contrastLabelOnFill.toFixed(2)}:1`
    ).toBeGreaterThanOrEqual(AA_TEXT)

    // The fitted accent must still be a colour, not a clipped black or white.
    expect(accent.some((c, i) => c !== onAccent[i])).toBe(true)
  })
})

/**
 * Status colours are chosen at RUNTIME too — "Match accent" or a custom pick — so like
 * the accents they must stay a visible NON-TEXT indicator after fitting: 3:1, or 4.5:1 in
 * high contrast. This is the runtime counterpart of the static status-accent token check
 * above, and the reason the dot is held to the non-text floor and NOT the 4.5:1 text bar.
 */
describe('user-chosen status colours', () => {
  const cases = THEME_NAMES.flatMap((theme) =>
    ['#4ade80', '#ff00ff', '#4a9eff', '#f59e0b', '#14b8a6'].map((hex) => ({ theme, hex }))
  )

  it.each(cases)('$hex stays a visible non-text indicator in $theme', ({ theme, hex }) => {
    const min = theme === 'hc' || theme === 'hc-light' ? 4.5 : 3
    const { contrastVsBg } = deriveStatusColor(hex, theme)
    expect(contrastVsBg, `${hex} on ${theme} is ${contrastVsBg.toFixed(2)}:1`).toBeGreaterThanOrEqual(min - 0.01)
  })
})
