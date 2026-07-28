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

/** Windows detection, used to name the OS file manager (Explorer). Mac is checked first, so a
 * "Macintosh" UA that also contained "WIN" could never be misread as Windows. */
export const isWindows =
  !isMac && typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().includes('WIN')

/** The OS file manager's name, for labels like "Open in Finder". */
export const fileManagerName = isMac ? 'Finder' : isWindows ? 'File Explorer' : 'File Manager'

/** The platform's primary modifier, as a symbol for display: `⌘` on macOS, `Ctrl+` elsewhere. */
export const modifierSymbol = isMac ? '⌘' : 'Ctrl+'

/** The platform's primary modifier, spelled out for prose and shortcut tables. */
export const modifierName = isMac ? 'Cmd' : 'Ctrl'
