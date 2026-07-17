/**
 * Per-repo "wayfinding rail" colour — a thin VIVID line beside each group's cards.
 *
 * Decorative only (the repo NAME on the header is the real, colour-blind-safe
 * identity), so there is no contrast gate. The palette deliberately EXCLUDES the
 * green / red / blue / grey status hues, so a rail can never be mistaken for a
 * status LED. Applied inline via a CSS custom property, never a Tailwind class.
 */
import type { ThemeName } from '../../../shared/theme'

/** Vivid, non-status hues (violet / amber / teal / pink / …), one per theme. */
const RAIL_PALETTE: Record<ThemeName, string[]> = {
  dark: ['#a78bfa', '#fbbf24', '#2dd4bf', '#f472b6', '#c4b5fd', '#fb923c'],
  light: ['#7c3aed', '#f59e0b', '#0d9488', '#db2777', '#6d28d9', '#c2410c'],
  hc: ['#c4b5fd', '#fde047', '#5eead4', '#f9a8d4', '#ddd6fe', '#fdba74'],
  'hc-light': ['#5b21b6', '#a16207', '#115e59', '#9d174d', '#4c1d95', '#9a3412'],
}

/** Neutral rail for a repo whose id no longer resolves (repo deleted). */
const UNKNOWN_RAIL: Record<ThemeName, string> = {
  dark: '#6b7280',
  light: '#9ca3af',
  hc: '#9ca3af',
  'hc-light': '#4b5563',
}

/** Deterministic djb2 hash → a stable palette index for a repo id. */
export function hashRepoId(id: string): number {
  let h = 5381
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h + id.charCodeAt(i)) >>> 0
  }
  return h
}

/**
 * Rail colour for a group. `null` = no rail (the "No repo" group). A resolved repo
 * gets a stable vivid hue from its id; an unresolved (deleted) repo gets a neutral grey.
 * When `colored` is false (the appearance toggle is off), every repo gets the neutral grey.
 */
export function railColorFor(
  theme: ThemeName,
  opts: { repoId?: string; resolved: boolean; colored?: boolean },
): string | null {
  if (!opts.repoId) return null
  if (opts.colored === false || !opts.resolved) return UNKNOWN_RAIL[theme]
  const palette = RAIL_PALETTE[theme]
  return palette[hashRepoId(opts.repoId) % palette.length]
}
