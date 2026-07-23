import { describe, it, expect } from 'vitest'
import { hashRepoId, railColorsForGroups, RAIL_PALETTE } from './repoRail'
import type { RepoGroup } from './repoGroups'
import { STATUS_LED } from './statusLed'
import { THEMES, type ThemeName } from '../../../shared/theme'
import { hexToRgb, oklabDistance, type Rgb } from '../../../shared/color'

function dist(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** Perceptual floor: every rail colour must be at least this far (OKLab ΔE) from every other. */
const DISTINCT = 0.08

const g = (repoId: string | undefined, kind: RepoGroup['kind'] = 'repo'): RepoGroup => ({
  key: repoId ? `repo:${repoId}` : 'ungrouped',
  label: repoId ?? 'No repo',
  kind,
  repoId,
  sessions: [],
})

/** Two repo ids that prefer the SAME palette slot, returned sorted by id (lo < hi). */
function twoCollidingIds(len: number): [string, string] {
  const seenBySlot = new Map<number, string>()
  for (let i = 0; ; i++) {
    const id = `id${i}`
    const slot = hashRepoId(id) % len
    const prev = seenBySlot.get(slot)
    if (prev) return prev < id ? [prev, id] : [id, prev]
    seenBySlot.set(slot, id)
  }
}

describe('hashRepoId', () => {
  it('is deterministic and non-negative', () => {
    expect(hashRepoId('abc')).toBe(hashRepoId('abc'))
    expect(hashRepoId('abc')).toBeGreaterThanOrEqual(0)
    expect(hashRepoId('abc')).not.toBe(hashRepoId('abd'))
  })
})

// The palette assertions below lean entirely on oklabDistance as their perceptual oracle, so pin
// down its own behaviour first — otherwise a regression that returned a constant (or Infinity) would
// let every "distinct enough" check pass vacuously.
describe('oklabDistance (the oracle behind the palette checks)', () => {
  const black: Rgb = [0, 0, 0]
  const white: Rgb = [255, 255, 255]
  const red: Rgb = [255, 0, 0]

  it('is zero only for identical colours', () => {
    expect(oklabDistance(red, red)).toBe(0)
    expect(oklabDistance(red, [254, 0, 0])).toBeGreaterThan(0)
  })

  it('is symmetric', () => {
    expect(oklabDistance(black, red)).toBeCloseTo(oklabDistance(red, black), 12)
  })

  it('is finite and grows with a bigger perceptual gap', () => {
    const near = oklabDistance(red, [255, 12, 12])
    const far = oklabDistance(red, [0, 128, 0])
    expect(Number.isFinite(near)).toBe(true)
    expect(Number.isFinite(far)).toBe(true)
    expect(far).toBeGreaterThan(near)
  })

  it('matches the known black→white lightness span (pure ΔL ≈ 1)', () => {
    // Both ends are achromatic (C≈0), so ΔE-OK collapses to the OKLab lightness delta, ≈ 1.0.
    expect(oklabDistance(black, white)).toBeCloseTo(1, 1)
  })

  it('matches a known chromatic reference (red→green ΔE-OK ≈ 0.52)', () => {
    // A purely-lightness oracle (e.g. Euclidean sRGB) can fake the checks above; a trusted chromatic
    // pair pins the a/b conversion too. sRGB red→green is ≈ 0.52 in OKLab.
    expect(oklabDistance(red, [0, 255, 0])).toBeCloseTo(0.52, 1)
  })
})

describe('RAIL_PALETTE', () => {
  it('every colour is perceptually distinct from every other (no near-duplicate hues)', () => {
    for (const { id: theme } of THEMES) {
      const cols = RAIL_PALETTE[theme].map(hexToRgb)
      let min = Infinity
      let pair = ''
      for (let i = 0; i < cols.length; i++) {
        for (let j = i + 1; j < cols.length; j++) {
          const d = oklabDistance(cols[i], cols[j])
          if (d < min) { min = d; pair = `${RAIL_PALETTE[theme][i]} vs ${RAIL_PALETTE[theme][j]}` }
        }
      }
      expect(min, `${theme}: closest pair ${pair} ΔE=${min.toFixed(3)}`).toBeGreaterThan(DISTINCT)
    }
  })

  it('every colour stays perceptually clear of the status LED fills (rail never reads as status)', () => {
    for (const { id: theme } of THEMES) {
      const statusFills = Object.values(STATUS_LED[theme]).map((s) => hexToRgb(s.fill))
      for (const hex of RAIL_PALETTE[theme]) {
        const rail = hexToRgb(hex)
        for (const status of statusFills) {
          // Perceptual (OKLab ΔE), not raw sRGB: a rail must clearly not read as a status light.
          expect(oklabDistance(rail, status), `${theme} ${hex} vs status`).toBeGreaterThan(DISTINCT)
          expect(dist(rail, status), `${theme} ${hex} vs status (rgb)`).toBeGreaterThan(35) // regression guard
        }
      }
    }
  })
})

describe('railColorsForGroups', () => {
  const theme: ThemeName = 'light'

  it('gives every resolved repo a DISTINCT, well-separated colour (up to palette size)', () => {
    const groups = Array.from({ length: RAIL_PALETTE[theme].length }, (_, i) => g(`repo-${i}`))
    const map = railColorsForGroups(theme, groups, true)
    const colours = groups.map((gr) => map.get(gr.key)!)
    expect(new Set(colours).size).toBe(groups.length) // all distinct
    const rgbs = colours.map(hexToRgb)
    for (let i = 0; i < rgbs.length; i++) {
      for (let j = i + 1; j < rgbs.length; j++) {
        expect(oklabDistance(rgbs[i], rgbs[j])).toBeGreaterThan(DISTINCT)
      }
    }
  })

  it('resolves deliberate hash collisions to different colours', () => {
    const len = RAIL_PALETTE[theme].length
    // find two ids that prefer the same slot
    let a = '', b = ''
    for (let i = 0; !b; i++) {
      const id = `x${i}`
      const slot = hashRepoId(id) % len
      for (let k = 0; k < i; k++) {
        if (hashRepoId(`x${k}`) % len === slot) { a = `x${k}`; b = id; break }
      }
    }
    const map = railColorsForGroups(theme, [g(a), g(b)], true)
    expect(map.get(`repo:${a}`)).not.toBe(map.get(`repo:${b}`))
  })

  it('is repoId-ordered, not label- or input-ordered (the tie-break that fixes #148)', () => {
    const len = RAIL_PALETTE[theme].length
    const [lo, hi] = twoCollidingIds(len) // both prefer the same slot, so ordering decides the winner
    const pref = hashRepoId(lo) % len // === hashRepoId(hi) % len

    // Labels are deliberately REVERSED against id order: lo carries the last-sorting label, hi the
    // first. A label- or input-ordered allocator would hand the preferred slot to hi; the correct
    // repoId-ordered one gives it to lo. So these fixtures can actually tell the two apart.
    const pair = (a: string, la: string, b: string, lb: string): RepoGroup[] => [
      { ...g(a), label: la },
      { ...g(b), label: lb },
    ]
    const base = pair(lo, 'zzz', hi, 'aaa')
    const shuffled = pair(hi, 'aaa', lo, 'zzz') // same set, opposite input order
    const m1 = railColorsForGroups(theme, base, true)
    const m2 = railColorsForGroups(theme, shuffled, true)

    // Input order is irrelevant.
    expect(m1.get(`repo:${lo}`)).toBe(m2.get(`repo:${lo}`))
    expect(m1.get(`repo:${hi}`)).toBe(m2.get(`repo:${hi}`))

    // The smaller repoId keeps the hashed slot despite its later-sorting label; the larger id is the
    // one bumped to the next free slot. This pins the tie-break to the id, never the label.
    expect(m1.get(`repo:${lo}`)).toBe(RAIL_PALETTE[theme][pref])
    expect(m1.get(`repo:${hi}`)).not.toBe(RAIL_PALETTE[theme][pref])

    // Renaming labels (here: swapping them) must not reshuffle a single colour.
    const renamed = pair(lo, 'aaa', hi, 'zzz')
    const m3 = railColorsForGroups(theme, renamed, true)
    expect(m3.get(`repo:${lo}`)).toBe(m1.get(`repo:${lo}`))
    expect(m3.get(`repo:${hi}`)).toBe(m1.get(`repo:${hi}`))
  })

  it('wraps past palette capacity (documented overflow) without crashing', () => {
    const n = RAIL_PALETTE[theme].length + 3
    const groups = Array.from({ length: n }, (_, i) => g(`o-${i}`))
    const map = railColorsForGroups(theme, groups, true)
    expect(map.size).toBe(n)
    // the first `len` distinct repos still fully cover the palette
    expect(new Set(groups.map((gr) => map.get(gr.key))).size).toBe(RAIL_PALETTE[theme].length)
  })

  it('applies the null / grey precedence', () => {
    const groups = [g('kept'), g('gone', 'unknown'), g(undefined, 'ungrouped')]
    const on = railColorsForGroups(theme, groups, true)
    expect(on.get('ungrouped')).toBeNull()
    // unknown (deleted repo) → grey
    const greyRgb = hexToRgb(on.get('repo:gone')!)
    expect(Math.max(...greyRgb) - Math.min(...greyRgb)).toBeLessThan(24)
    // colour toggle off → every repo grey, including the resolved one
    const off = railColorsForGroups(theme, groups, false)
    expect(off.get('repo:kept')).toBe(on.get('repo:gone'))
  })
})
