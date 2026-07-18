/**
 * Pure logic for the terminal's ⌘/⌃-click-to-open-URL behaviour (#149).
 *
 * Kept free of xterm and the DOM so it can be unit-tested directly. `useTerminalSetup`
 * wires it into `@xterm/addon-web-links`, whose click handler is invoked with the raw
 * `MouseEvent` and the detected URI.
 */

/** The parts of a `MouseEvent` the open-decision depends on. */
export interface TerminalLinkClick {
  button: number
  metaKey: boolean
  ctrlKey: boolean
}

/**
 * Whether a click on a detected terminal link should open it.
 *
 * Requires the PRIMARY button plus the platform modifier — ⌘ on macOS, Ctrl elsewhere.
 * (Ctrl-click on macOS is the context-menu gesture, so it must not open; middle/right
 * clicks are excluded via the button check.) A plain click returns false, leaving xterm's
 * normal selection/cursor behaviour untouched.
 *
 * The scheme is re-checked here even though the addon only detects http(s): agent output
 * is untrusted, so this mirrors the renderer-side guard at
 * `shared/utils/markdownComponents.tsx` (the main process restricts it further still).
 */
export function shouldOpenTerminalLink(
  event: TerminalLinkClick,
  uri: string,
  isMac: boolean
): boolean {
  if (event.button !== 0) return false
  const modifierHeld = isMac ? event.metaKey : event.ctrlKey
  if (!modifierHeld) return false
  return /^https?:\/\//i.test(uri)
}

/**
 * Build the click handler passed to `new WebLinksAddon(...)`. Opens qualifying links
 * through the injected `openExternal` (which the main process further restricts to http(s)).
 */
export function createWebLinkHandler(deps: {
  isMac: boolean
  openExternal: (uri: string) => void
}): (event: MouseEvent, uri: string) => void {
  return (event, uri) => {
    if (shouldOpenTerminalLink(event, uri, deps.isMac)) {
      deps.openExternal(uri)
    }
  }
}

/**
 * Build both link hooks the terminal needs, gated by the same rule:
 *  - `onClick` for `@xterm/addon-web-links` (URL-shaped text), and
 *  - `linkHandler` for xterm's core OSC 8 hyperlinks.
 *
 * Both must be wired: without a `linkHandler`, OSC 8 links fall back to xterm's default —
 * a blocking `confirm()` then `window.open` on any plain click — which would open some
 * terminal links without the modifier, contradicting the feature. `allowNonHttpProtocols`
 * stays false so xterm also refuses non-http(s) OSC 8 links before they reach the handler.
 */
export function createTerminalLinkHandlers(deps: {
  isMac: boolean
  openExternal: (uri: string) => void
}): {
  onClick: (event: MouseEvent, uri: string) => void
  linkHandler: { activate: (event: MouseEvent, uri: string) => void; allowNonHttpProtocols: false }
} {
  const onClick = createWebLinkHandler(deps)
  return {
    onClick,
    linkHandler: { activate: onClick, allowNonHttpProtocols: false },
  }
}
