/**
 * Platform detection for the renderer.
 *
 * The same `navigator.userAgent.includes('Mac')` line had been copied into four modules,
 * one of which drifted to a case-insensitive variant — so "is this a Mac?" could in
 * principle answer differently in two places. It decides both what modifier the UI
 * *displays* (⌘ vs Ctrl) and what modifier the terminal's link handling *accepts*, so the
 * two must agree by construction.
 *
 * The `typeof navigator` guard keeps this importable from non-DOM test environments.
 */
export const isMac =
  typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().includes('MAC')

/** The platform's primary modifier, as a symbol for display: `⌘` on macOS, `Ctrl+` elsewhere. */
export const modifierSymbol = isMac ? '⌘' : 'Ctrl+'

/** The platform's primary modifier, spelled out for prose and shortcut tables. */
export const modifierName = isMac ? 'Cmd' : 'Ctrl'
