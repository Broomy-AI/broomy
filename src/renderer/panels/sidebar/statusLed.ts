/**
 * Dedicated non-text colours for the session status LED (the app's original
 * spinner + dot shapes, only brightened).
 *
 * A status LED is a NON-TEXT graphic (WCAG 1.4.11 → 3:1), so the fills are kept
 * BRIGHT and are NEVER darkened to hit text contrast — that is what muddied the
 * green. These are dedicated to the indicator and do NOT reuse the text tokens
 * `success-fg` / `status-error`.
 *
 * On the standard LIGHT theme a bright fill can't clear 3:1 on the near-white card,
 * so each LED gets a thin darker-hue BEZEL ring (box-shadow) that carries the edge
 * while the fill stays vivid. `hc` / `hc-light` keep high-contrast fills and need no
 * bezel (their palette already clears contrast).
 *
 * Contrast is asserted against the real composited card surface in statusLed.test.ts.
 */
import type { ThemeName } from '../../../shared/theme'

export type LedState = 'working' | 'idle' | 'unread' | 'error' | 'initializing'

export interface LedSpec {
  /** Bright fill (dot background / spinner arc). */
  fill: string
  /** Light-theme only: a darker same-hue ring carrying the 3:1 edge. */
  bezel?: string
  /** Unread only: a soft glow halo (rgba), the single glowing state. */
  glow?: string
}

export const STATUS_LED: Record<ThemeName, Record<LedState, LedSpec>> = {
  dark: {
    working: { fill: '#4ADE80' },
    unread: { fill: '#4ADE80', glow: 'rgba(74,222,128,0.5)' },
    idle: { fill: '#7C848F' },
    error: { fill: '#FF5B52' },
    initializing: { fill: '#4A9EFF' },
  },
  light: {
    working: { fill: '#16A34A', bezel: '#006622' },
    unread: { fill: '#16A34A', bezel: '#006622', glow: 'rgba(22,163,74,0.42)' },
    idle: { fill: '#6B7280', bezel: '#4B5563' },
    error: { fill: '#EF4444', bezel: '#B21A11' },
    initializing: { fill: '#1E86F0', bezel: '#145FB0' },
  },
  hc: {
    working: { fill: '#5CFF9E' },
    unread: { fill: '#5CFF9E', glow: 'rgba(92,255,158,0.5)' },
    idle: { fill: '#C8C8CC' },
    error: { fill: '#FF6B6B' },
    initializing: { fill: '#8ECBFF' },
  },
  'hc-light': {
    working: { fill: '#0A7D3C' },
    unread: { fill: '#0A7D3C', glow: 'rgba(10,125,60,0.4)' },
    idle: { fill: '#3D3D3D' },
    error: { fill: '#B00710' },
    initializing: { fill: '#003D99' },
  },
}

export function ledSpec(theme: ThemeName, state: LedState): LedSpec {
  return STATUS_LED[theme][state]
}
