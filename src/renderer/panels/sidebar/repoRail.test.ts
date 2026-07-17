import { describe, it, expect } from 'vitest'
import { hashRepoId, railColorFor } from './repoRail'
import { STATUS_LED } from './statusLed'
import { THEMES } from '../../../shared/theme'
import { hexToRgb, type Rgb } from '../../../shared/color'

function dist(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

describe('hashRepoId', () => {
  it('is deterministic and non-negative', () => {
    expect(hashRepoId('abc')).toBe(hashRepoId('abc'))
    expect(hashRepoId('abc')).toBeGreaterThanOrEqual(0)
    expect(hashRepoId('abc')).not.toBe(hashRepoId('abd'))
  })
})

describe('railColorFor', () => {
  it('returns null for an ungrouped (no-repo) group', () => {
    expect(railColorFor('dark', { resolved: false })).toBeNull()
    expect(railColorFor('dark', { repoId: undefined, resolved: true })).toBeNull()
  })

  it('gives an unresolved (deleted) repo a neutral grey, not a hue', () => {
    const grey = railColorFor('light', { repoId: 'gone', resolved: false })!
    // grey => r ≈ g ≈ b
    const [r, g, b] = hexToRgb(grey)
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(24)
  })

  it('is stable per repo id and picks from the theme palette', () => {
    for (const { id: theme } of THEMES) {
      const a = railColorFor(theme, { repoId: 'r-broomy', resolved: true })
      const b = railColorFor(theme, { repoId: 'r-broomy', resolved: true })
      expect(a).toBe(b)
      expect(a).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('gives every repo the neutral grey (not its hue) when the colour toggle is off', () => {
    for (const { id: theme } of THEMES) {
      const off = railColorFor(theme, { repoId: 'r-broomy', resolved: true, colored: false })
      // the same neutral the unresolved-repo path uses...
      expect(off).toBe(railColorFor(theme, { repoId: 'r-broomy', resolved: false }))
      // ...and NOT the per-repo hue it would show when colour is on.
      expect(off).not.toBe(railColorFor(theme, { repoId: 'r-broomy', resolved: true }))
    }
  })

  it('never collides with a status LED colour (rail can\'t read as status)', () => {
    // A rail hue must stay well clear of the green/red/blue/grey status fills, so a
    // coloured line can never be mistaken for a status light.
    for (const { id: theme } of THEMES) {
      const statusFills = Object.values(STATUS_LED[theme]).map((s) => hexToRgb(s.fill))
      for (let i = 0; i < 30; i++) {
        const rail = hexToRgb(railColorFor(theme, { repoId: `repo-${i}`, resolved: true })!)
        for (const status of statusFills) {
          expect(dist(rail, status)).toBeGreaterThan(35)
        }
      }
    }
  })
})
