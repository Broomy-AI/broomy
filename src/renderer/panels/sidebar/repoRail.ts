/**
 * Per-repo "wayfinding rail" colour — a thin VIVID line beside each group's cards.
 *
 * Decorative only (the repo NAME on the header is the real, colour-blind-safe identity), so there is
 * no contrast gate. Colours are generated in OKLCH from non-status hue anchors (avoiding the
 * green / red / grey status LEDs) so a rail can never be mistaken for a status light, and are tuned so
 * every entry is perceptually distinct (see repoRail.test.ts). Applied inline via a CSS custom
 * property, never a Tailwind class.
 *
 * Colours are assigned to the WHOLE visible group set at once (`railColorsForGroups`), so distinctness
 * is guaranteed rather than left to hash luck: each resolved repo takes its hashed slot, or the next
 * free one on collision. See the contract on that function.
 */
import type { ThemeName } from '../../../shared/theme'
import { THEMES } from '../../../shared/theme'
import { oklchToRgb, rgbToHex } from '../../../shared/color'
import type { RepoGroup } from './repoGroups'

// Non-status hue anchors (OKLCH degrees): orange, gold, teal, and a spread of purple→magenta→pink,
// all clear of the green (~145°) / red (~29°) / blue-ish status regions. Rendered per theme at a
// mid, vivid lightness/chroma — the extremes (very light/very dark) collapse hues toward each other,
// so the palette is tuned so every pair is perceptually distinct (see repoRail.test.ts).
const RAIL_HUES_DEG = [52, 92, 190, 280, 315, 348]
const RAIL_LC: Record<ThemeName, { L: number; C: number }> = {
  light: { L: 0.55, C: 0.18 },
  dark: { L: 0.74, C: 0.15 },
  hc: { L: 0.72, C: 0.17 },
  'hc-light': { L: 0.52, C: 0.21 },
}
/** Vivid, non-status colours, one list per theme. */
export const RAIL_PALETTE: Record<ThemeName, string[]> = Object.fromEntries(
  THEMES.map(({ id }) => [
    id,
    RAIL_HUES_DEG.map((deg) => rgbToHex(oklchToRgb(RAIL_LC[id].L, RAIL_LC[id].C, (deg * Math.PI) / 180))),
  ]),
) as Record<ThemeName, string[]>

/** Neutral rail for a repo whose id no longer resolves (repo deleted) or when the colour toggle is off. */
const UNKNOWN_RAIL: Record<ThemeName, string> = {
  dark: '#6b7280',
  light: '#9ca3af',
  hc: '#9ca3af',
  'hc-light': '#4b5563',
}

/** Deterministic djb2 hash → a stable preferred palette slot for a repo id. */
export function hashRepoId(id: string): number {
  let h = 5381
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h + id.charCodeAt(i)) >>> 0
  }
  return h
}

/**
 * Rail colours for the WHOLE group set, keyed by `group.key`. `null` = no rail (the "No repo" /
 * ungrouped group); neutral grey = an unresolved repo (deleted) or the colour toggle being off.
 *
 * Resolved repos each get a DISTINCT palette colour: iterating them in stable `repoId` order (so a
 * rename never reshuffles), each takes its hashed slot `hashRepoId % len`, or the next free slot on
 * collision.
 *
 * Contract: for an unchanged resolved-repo set the assignment is deterministic and every repo's
 * colour is distinct up to the palette size; a repo keeps its hashed colour unless a real collision
 * bumps it. Adding/removing a repo can recolour a collision chain. Beyond palette capacity colours
 * wrap and may repeat (documented overflow — far past realistic repo counts).
 */
export function railColorsForGroups(
  theme: ThemeName,
  groups: RepoGroup[],
  colored: boolean,
): Map<string, string | null> {
  const palette = RAIL_PALETTE[theme]
  const slotByRepoId = new Map<string, number>()
  const used = new Set<number>()

  const resolved = groups
    .filter((g): g is RepoGroup & { repoId: string } => g.kind === 'repo' && !!g.repoId)
    .sort((a, b) => (a.repoId < b.repoId ? -1 : a.repoId > b.repoId ? 1 : 0))

  for (const g of resolved) {
    const pref = hashRepoId(g.repoId) % palette.length
    let slot = pref
    if (used.size < palette.length) {
      for (let k = 0; k < palette.length; k++) {
        const cand = (pref + k) % palette.length
        if (!used.has(cand)) {
          slot = cand
          break
        }
      }
    }
    used.add(slot)
    slotByRepoId.set(g.repoId, slot)
  }

  const out = new Map<string, string | null>()
  for (const g of groups) {
    if (g.kind === 'ungrouped') {
      out.set(g.key, null)
    } else if (!colored || g.kind !== 'repo' || !g.repoId) {
      out.set(g.key, UNKNOWN_RAIL[theme])
    } else {
      out.set(g.key, palette[slotByRepoId.get(g.repoId)!])
    }
  }
  return out
}
