/**
 * Drift guard: the CSS custom properties in index.css must match PALETTE in
 * src/shared/theme.ts exactly.
 *
 * Nothing else enforces this. The CSS is what the browser paints; PALETTE is what
 * TypeScript reads when it needs a real hex (Electron's window background, the
 * xterm theme, the Monaco theme). If they drift, the window chrome and the app
 * disagree about what colour they are, and no existing test notices.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { PALETTE, TOKENS, hexFromTriplet } from '../shared/theme'

const css = readFileSync(join(__dirname, 'index.css'), 'utf-8')

/** Pull `--color-x: a b c;` declarations out of a selector's block. */
function readVars(selector: string): Record<string, string> {
  const start = css.indexOf(selector + ' {')
  expect(start, `selector "${selector}" not found in index.css`).toBeGreaterThan(-1)
  const block = css.slice(start, css.indexOf('}', start))
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/--color-([\w-]+):\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim()
  }
  return out
}

describe('theme tokens', () => {
  const rootVars = readVars(':root')

  it('declares every token from the palette', () => {
    expect(Object.keys(rootVars).sort()).toEqual([...TOKENS].sort())
  })

  it.each(TOKENS)('dark %s matches PALETTE', (name) => {
    expect(rootVars[name]).toBe(PALETTE.dark[name])
  })

  it('stores triplets, not hex — Tailwind consumes them as rgb(var(--x) / <alpha-value>)', () => {
    for (const value of Object.values(rootVars)) {
      expect(value, `"${value}" must be three 0-255 channels`).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
    }
  })

  it('defaults --app-text-scale to 1 so the type scale is unchanged', () => {
    expect(css).toMatch(/--app-text-scale:\s*1\s*;/)
  })

  it('never uses prefers-color-scheme — it would repaint every Storybook story', () => {
    // Strip comments first: the rule is documented in this file, and the guard is
    // about the at-rule actually being applied, not the words being written down.
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(withoutComments).not.toMatch(/@media[^{]*prefers-color-scheme/)
  })
})

describe('hexFromTriplet', () => {
  it('round-trips the palette', () => {
    expect(hexFromTriplet(PALETTE.dark['bg-primary'])).toBe('#1a1a1a')
    expect(hexFromTriplet(PALETTE.dark['text-primary'])).toBe('#e0e0e0')
    expect(hexFromTriplet(PALETTE.dark['accent'])).toBe('#4a9eff')
  })

  it('rejects malformed input rather than emitting a broken colour', () => {
    expect(() => hexFromTriplet('26 26')).toThrow()
    expect(() => hexFromTriplet('26 26 300')).toThrow()
    expect(() => hexFromTriplet('#1a1a1a')).toThrow()
  })
})
