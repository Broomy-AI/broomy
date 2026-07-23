/**
 * Pure logic for the terminal's ⌘/⌃-click-to-open-URL behaviour (#149).
 *
 * Kept free of xterm and the DOM so it can be unit-tested directly. `useTerminalSetup`
 * wires it into `@xterm/addon-web-links`, whose click handler is invoked with the raw
 * `MouseEvent` and the detected URI. The hover hint that tells the user a modifier is
 * required is the one DOM-touching piece, and lives in `terminalLinkHint.ts`.
 */

/** The parts of a `MouseEvent` the open-decision depends on. */
export interface TerminalLinkClick {
  button: number
  metaKey: boolean
  ctrlKey: boolean
}

/** The hover affordance, injected so this module stays DOM-free. */
export interface TerminalLinkHint {
  show(event: MouseEvent, uri: string): void
  hide(): void
}

/**
 * Whether a URI is one the terminal will open at all.
 *
 * Re-checked here even though the addon only detects http(s): agent output is untrusted,
 * so this mirrors the renderer-side guard at `shared/utils/markdownComponents.tsx` (the
 * main process restricts it further still). It also gates the hover hint, so the terminal
 * never offers to open something it would then refuse.
 */
export function isOpenableTerminalUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri)
}

/**
 * Whether a click on a detected terminal link should open it.
 *
 * Requires the PRIMARY button plus the platform modifier — ⌘ on macOS, Ctrl elsewhere.
 * (Ctrl-click on macOS is the context-menu gesture, so it must not open; middle/right
 * clicks are excluded via the button check.) A plain click returns false, leaving xterm's
 * normal selection/cursor behaviour untouched.
 */
export function shouldOpenTerminalLink(
  event: TerminalLinkClick,
  uri: string,
  isMac: boolean
): boolean {
  if (event.button !== 0) return false
  const modifierHeld = isMac ? event.metaKey : event.ctrlKey
  if (!modifierHeld) return false
  return isOpenableTerminalUri(uri)
}

export interface TerminalLinkDeps {
  isMac: boolean
  openExternal: (uri: string) => void
  /** Optional so callers without a container (and most tests) can skip the affordance. */
  hint?: TerminalLinkHint
}

/** The click handler shared by the web-links addon and xterm's OSC 8 `linkHandler`. */
function createWebLinkHandler(deps: TerminalLinkDeps): (event: MouseEvent, uri: string) => void {
  return (event, uri) => {
    if (shouldOpenTerminalLink(event, uri, deps.isMac)) {
      // Hide first: focus leaves for the browser and xterm fires no `leave` for a link the
      // pointer never left, so the hint would otherwise stay on screen.
      deps.hint?.hide()
      deps.openExternal(uri)
    }
  }
}

/**
 * Build every link hook the terminal needs, all gated by the same rule:
 *  - `onClick` / `linkProviderOptions` for `@xterm/addon-web-links` (URL-shaped text), and
 *  - `linkHandler` for xterm's core OSC 8 hyperlinks.
 *
 * Both paths must be wired: without a `linkHandler`, OSC 8 links fall back to xterm's
 * default — a blocking `confirm()` then `window.open` on any plain click — which would open
 * some terminal links without the modifier, contradicting the feature. `allowNonHttpProtocols`
 * stays false so xterm also refuses non-http(s) OSC 8 links before they reach the handler.
 *
 * The hover hooks exist because xterm underlines a link and shows a pointer cursor whether
 * or not the modifier is held: without a hint, a plain click is a dead end with no feedback.
 * Both paths share the hint for the same reason they share the gate.
 */
export function createTerminalLinkHandlers(deps: TerminalLinkDeps): {
  onClick: (event: MouseEvent, uri: string) => void
  linkProviderOptions: {
    hover: (event: MouseEvent, uri: string) => void
    leave: () => void
  }
  linkHandler: {
    activate: (event: MouseEvent, uri: string) => void
    hover: (event: MouseEvent, uri: string) => void
    leave: () => void
    allowNonHttpProtocols: false
  }
} {
  const onClick = createWebLinkHandler(deps)
  const hover = (event: MouseEvent, uri: string): void => {
    if (isOpenableTerminalUri(uri)) deps.hint?.show(event, uri)
  }
  const leave = (): void => deps.hint?.hide()

  return {
    onClick,
    linkProviderOptions: { hover, leave },
    linkHandler: { activate: onClick, hover, leave, allowNonHttpProtocols: false },
  }
}
