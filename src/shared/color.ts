/**
 * Colour maths: WCAG contrast, and OKLCH for fitting a user-chosen accent.
 *
 * Lives in `shared` because both the renderer (rendering the accent, asserting
 * palette contrast in tests) and the main process (window background, xterm and
 * Monaco themes) need it.
 */

export type Rgb = [number, number, number]

export function parseTriplet(triplet: string): Rgb {
  const parts = triplet.trim().split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`Invalid colour triplet: "${triplet}"`)
  }
  return [parts[0], parts[1], parts[2]]
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Invalid hex colour: "${hex}"`)
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`
}

export const rgbToTriplet = ([r, g, b]: Rgb): string => `${r} ${g} ${b}`

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  const f = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** WCAG contrast ratio, 1..21. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** Composite `fg` at `alpha` over `bg`, so an alpha tint can be contrast-checked. */
export function composite(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha))) as Rgb
}

// ── OKLCH ────────────────────────────────────────────────────────────
//
// Lightness fitting must happen in a perceptually uniform space. HSL preserves the
// hue *angle* but not the hue you see: darkening a rose in HSL slides it into
// crimson. OKLCH holds hue and chroma steady while L moves, so a magenta stays a
// magenta.

const toLinear = (c: number) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const toSrgb = (c: number) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.round(Math.max(0, Math.min(1, v)) * 255)
}

/** sRGB → OKLCH: [L 0..1, C, hue radians]. */
export function rgbToOklch([r8, g8, b8]: Rgb): [number, number, number] {
  const r = toLinear(r8)
  const g = toLinear(g8)
  const b = toLinear(b8)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.sqrt(A * A + B * B), Math.atan2(B, A)]
}

/**
 * Perceptual distance between two sRGB colours in OKLab (ΔE-OK). ~0 = identical; roughly, >0.02 is
 * just-noticeable and >0.08 reads as clearly different. Unlike raw sRGB distance it judges hues the
 * way the eye does (a lighter red still reads "red"), so it's the right metric for keeping the
 * repo-rail palette entries visibly distinct from each other and from the status LEDs.
 */
export function oklabDistance(x: Rgb, y: Rgb): number {
  const toLab = (rgb: Rgb): [number, number, number] => {
    const [L, C, h] = rgbToOklch(rgb)
    return [L, C * Math.cos(h), C * Math.sin(h)]
  }
  const [l1, a1, b1] = toLab(x)
  const [l2, a2, b2] = toLab(y)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

function oklchToLinear(L: number, C: number, h: number): [number, number, number] {
  const A = C * Math.cos(h)
  const B = C * Math.sin(h)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** OKLCH → sRGB, reducing chroma until the colour is actually representable. */
export function oklchToRgb(L: number, C: number, h: number): Rgb {
  let c = C
  for (let i = 0; i < 40 && c > 0; i++) {
    const lin = oklchToLinear(L, c, h)
    if (lin.every((v) => v >= -0.001 && v <= 1.001)) break
    c *= 0.94
  }
  const [r, g, b] = oklchToLinear(L, c, h)
  return [toSrgb(r), toSrgb(g), toSrgb(b)]
}

/**
 * Move `color` along its OKLCH lightness until it clears `target` contrast against
 * `bg`, holding hue and chroma. Stops at the first value that clears the bar, so
 * the result stays as close to the chosen colour as possible.
 *
 * This is what lets "pick any colour you like" and "buttons stay readable" both be
 * true: #4a9eff is a fine accent on #1a1a1a (6.3:1) and an unreadable one on
 * #fbfbfa (2.66:1).
 */
export function fitContrast(color: Rgb, bg: Rgb, target: number): Rgb {
  if (contrast(color, bg) >= target) return color

  const [L0, C, h] = rgbToOklch(color)
  const bgIsLight = luminance(bg) > 0.18
  let best = color
  let bestRatio = contrast(color, bg)

  for (let i = 1; i <= 100; i++) {
    const step = i / 100
    const L = bgIsLight ? L0 * (1 - step) : L0 + (1 - L0) * step
    const candidate = oklchToRgb(Math.max(0, Math.min(1, L)), C, h)
    const ratio = contrast(candidate, bg)
    if (ratio > bestRatio) {
      best = candidate
      bestRatio = ratio
    }
    if (ratio >= target) return candidate
  }
  return best
}

/** White or black, whichever is more readable on the given fill. */
export function bestLabelOn(fill: Rgb): Rgb {
  const white: Rgb = [255, 255, 255]
  const black: Rgb = [0, 0, 0]
  return contrast(white, fill) >= contrast(black, fill) ? white : black
}
