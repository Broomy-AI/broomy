/**
 * Pure logic for the terminal's ⌘/⌃-click-to-open behaviour (#149, #164).
 *
 * Kept free of xterm and the DOM so it can be unit-tested directly. `useTerminalSetup`
 * wires it into `@xterm/addon-web-links` (URL-shaped text) and xterm's core `linkHandler`
 * (OSC 8 hyperlinks). Two schemes open:
 *  - `http(s)` URLs → `openExternal` (the OS browser), as before.
 *  - `file://` OSC 8 hyperlinks → `openPath` (the same gated file opener the bare-path link
 *    provider uses). Claude Code emits its `[file]`/`[image]` chips as `file://` OSC 8 links, so
 *    honoring them makes even a hard-wrapped chip clickable — the link rides on the cells (#164).
 * Every other scheme reaches `activate` but opens nothing.
 *
 * The hover hint (`terminalLinkHint.ts`) is the one DOM-touching piece; for an OSC 8 link whose
 * label doesn't already show its target it spells the target out, so a deceptive label can't hide
 * where the click goes (`linkHintDetail`).
 */

/** The parts of a `MouseEvent` the open-decision depends on. */
export interface TerminalLinkClick {
  button: number
  metaKey: boolean
  ctrlKey: boolean
}

/** The hover affordance, injected so this module stays DOM-free. `detail` (the link's real target)
 *  is appended to the "⌘click to open" hint, and is passed ONLY when the link's own visible text
 *  doesn't already show it — see `linkHintDetail`. */
export interface TerminalLinkHint {
  show(event: MouseEvent, detail?: string): void
  hide(): void
}

/**
 * Structural stand-in for xterm's `IBufferRange`, so this module stays xterm-free. `y` is the
 * 1-based ABSOLUTE buffer row xterm reports for an OSC 8 link (`buffer.active.getLine(y - 1)`).
 */
export interface TerminalLinkRange {
  start: { x: number; y: number }
  end: { x: number; y: number }
}

/**
 * Convert a `file://` URL to a local filesystem path, or `null` if it isn't one we should open.
 * macOS/POSIX-only (a Windows build would need drive-letter/UNC handling). Fails closed on anything
 * that doesn't match the main-process `resolveTerminalPath` contract, so the hover hint never offers
 * to open something the opener would reject:
 *  - reject the RAW input up front for a backslash or any control char (`\p{Cc}`) — WHATWG `URL`
 *    silently rewrites `\` to `/` and strips raw TAB/CR/LF, so these must never reach the parser — and
 *    for overlong input;
 *  - requires canonical `file:///…` or `file://localhost/…` with a SINGLE slash after the authority
 *    (rejects `file:` shorthand and `file:////…` — `new URL('file:x').pathname` is `/x`, which would
 *    look absolute);
 *  - rejects a remote host, any query/fragment, and an encoded slash `%2f` (an encoded separator);
 *  - decodes the pathname EXACTLY once, so `%20`→space and `%2520`→the literal `%20` are both valid;
 *  - requires an absolute path ≤ 4096 with no control char (`\p{Cc}` — incl. DEL / C1, matching
 *    `resolveTerminalPath`).
 */
export function fileUriToPath(uri: string): string | null {
  if (uri.length > 16384) return null
  if (/[\\\p{Cc}]/u.test(uri)) return null // raw backslash or control char — before URL normalizes them
  if (!/^file:\/\/(localhost)?\/(?!\/)/i.test(uri)) return null // canonical, single slash after authority
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return null
  }
  if (url.protocol !== 'file:') return null
  if (url.hostname !== '' && url.hostname.toLowerCase() !== 'localhost') return null
  if (url.search !== '' || url.hash !== '') return null
  if (/%2f/i.test(url.pathname)) return null // encoded separator — never build a path from it
  let path: string
  try {
    path = decodeURIComponent(url.pathname) // exactly once
  } catch {
    return null // malformed %-escape
  }
  if (!path.startsWith('/')) return null
  if (/\p{Cc}/u.test(path)) return null // control chars, incl. NUL / DEL / C1
  if (path.length > 4096) return null
  return path
}

/**
 * Whether a URI is one the terminal will open at all — `http(s)` always, `file://` only when
 * `allowFileUris` (host terminals; an isolated/container session's paths don't map to the host).
 * Re-checked here because agent output is untrusted and it also gates the hover hint, so the terminal
 * never offers to open something it would then refuse.
 */
export function isOpenableTerminalUri(uri: string, allowFileUris: boolean): boolean {
  if (/^https?:\/\//i.test(uri)) return true
  return allowFileUris && fileUriToPath(uri) !== null
}

/** Whitespace-insensitive, because a hard-wrapped chip splits its path across rows with an indent. */
const squash = (text: string): string => text.replace(/\s+/g, '')

/**
 * The link's real target, to append to the hover hint — or `undefined` when the link's own visible
 * text already shows it and the hint would just repeat the terminal.
 *
 * This is the anti-spoofing check (#164). An OSC 8 hyperlink's LABEL is arbitrary agent output and
 * need not match its URI: a chip reading `[image]/safe.png` can point at `file:///…/other.html`,
 * and an `https` link reading `docs.example.com` can point anywhere. `rowText` is the terminal row
 * the pointer is on; when the target isn't visible in it, the hint spells the target out before the
 * user ⌘-clicks. Fails toward SHOWING: an unreadable row, or a hard-wrapped chip whose path is only
 * half on this row, shows the full target rather than trusting the label.
 */
export function linkHintDetail(
  uri: string,
  rowText: string | undefined,
  allowFileUris: boolean,
): string | undefined {
  const target = /^https?:\/\//i.test(uri) ? uri : allowFileUris ? fileUriToPath(uri) : null
  if (target === null) return undefined
  if (rowText !== undefined && squash(rowText).includes(squash(target))) return undefined
  return target
}

/**
 * Whether a click carries the "open" intent: the PRIMARY button plus the platform modifier —
 * ⌘ on macOS, Ctrl elsewhere. (Ctrl-click on macOS is the context-menu gesture, so it must not
 * open; middle/right clicks are excluded via the button check.) A plain click returns false,
 * leaving xterm's normal selection/cursor behaviour untouched.
 *
 * Scheme-agnostic, because it is shared by both kinds of terminal link: URLs/file OSC links (below)
 * and the bare file paths in `terminalPathLinkProvider.ts`. The two must agree on the gesture — a
 * modifier that opened one but not the other would be indistinguishable from a broken link.
 */
export function hasOpenModifier(event: TerminalLinkClick, isMac: boolean): boolean {
  if (event.button !== 0) return false
  return isMac ? event.metaKey : event.ctrlKey
}

/**
 * Whether a click on a detected terminal link should open it: the open gesture, plus a URI this
 * terminal will open at all.
 */
export function shouldOpenTerminalLink(
  event: TerminalLinkClick,
  uri: string,
  isMac: boolean,
  allowFileUris: boolean,
): boolean {
  return hasOpenModifier(event, isMac) && isOpenableTerminalUri(uri, allowFileUris)
}

export interface TerminalLinkDeps {
  isMac: boolean
  /** Open an http(s) URL in the OS browser. */
  openExternal: (uri: string) => void
  /** Open (or reveal) a local file — the target of a `file://` OSC 8 link. */
  openPath: (path: string) => void
  /** Whether `file://` OSC 8 links may open (host terminals only; false for isolated sessions). */
  allowFileUris: boolean
  /**
   * Read terminal row `row` (1-based, as xterm reports it in an OSC 8 link's range) as plain text,
   * so the hint can tell whether the link's target is already visible. Optional: without it every
   * OSC 8 link's target is spelled out.
   */
  readRow?: (row: number) => string | undefined
  /** Optional so callers without a container (and most tests) can skip the affordance. */
  hint?: TerminalLinkHint
}

/** The click handler shared by the web-links addon and xterm's OSC 8 `linkHandler`. */
function createWebLinkHandler(deps: TerminalLinkDeps): (event: MouseEvent, uri: string) => void {
  return (event, uri) => {
    if (!shouldOpenTerminalLink(event, uri, deps.isMac, deps.allowFileUris)) return
    // Hide first: focus leaves for the browser / opened app and xterm fires no `leave` for a link the
    // pointer never left, so the hint would otherwise stay on screen.
    deps.hint?.hide()
    if (/^https?:\/\//i.test(uri)) {
      deps.openExternal(uri)
      return
    }
    // Non-http and it passed the gate → a `file://` link with `allowFileUris`, so this is non-null.
    const path = fileUriToPath(uri)
    if (path) deps.openPath(path)
  }
}

/**
 * Build every link hook the terminal needs, all gated by the same rule:
 *  - `onClick` / `linkProviderOptions` for `@xterm/addon-web-links` (URL-shaped text), and
 *  - `linkHandler` for xterm's core OSC 8 hyperlinks.
 *
 * Both paths must be wired: without a `linkHandler`, OSC 8 links fall back to xterm's default — a
 * blocking `confirm()` then `window.open` on any plain click. Because a handler is always present,
 * that default never runs; `allowNonHttpProtocols` only controls WHICH schemes xterm delivers to
 * `activate`. It is `true` for host terminals so `file://` OSC 8 links reach us (we open only
 * `file://`; other schemes are ignored), and `false` for isolated sessions (`file://` refused
 * outright — container paths must not resolve to host paths).
 *
 * The hover hooks exist because xterm underlines a link and shows a pointer cursor whether or not the
 * modifier is held: without a hint, a plain click is a dead end with no feedback. The two paths hint
 * differently only where they must: the addon's label is the URI itself, while an OSC 8 label is
 * arbitrary agent output, so the latter spells out a target the row doesn't already show.
 */
export function createTerminalLinkHandlers(deps: TerminalLinkDeps): {
  onClick: (event: MouseEvent, uri: string) => void
  linkProviderOptions: {
    hover: (event: MouseEvent, uri: string) => void
    leave: () => void
  }
  linkHandler: {
    activate: (event: MouseEvent, uri: string) => void
    hover: (event: MouseEvent, uri: string, range?: TerminalLinkRange) => void
    leave: () => void
    allowNonHttpProtocols: boolean
  }
} {
  const onClick = createWebLinkHandler(deps)

  // Detected URL TEXT: the link's label IS the URI (that is what the addon matched), so the target
  // is already on screen and spelling it out would only repeat the terminal.
  const textHover = (event: MouseEvent, uri: string): void => {
    if (isOpenableTerminalUri(uri, deps.allowFileUris)) deps.hint?.show(event)
  }

  // OSC 8: the label is arbitrary and may not match the URI, so show the target unless the hovered
  // row already contains it.
  const oscHover = (event: MouseEvent, uri: string, range?: TerminalLinkRange): void => {
    if (!isOpenableTerminalUri(uri, deps.allowFileUris)) return
    const rowText = range ? deps.readRow?.(range.start.y) : undefined
    deps.hint?.show(event, linkHintDetail(uri, rowText, deps.allowFileUris))
  }

  const leave = (): void => deps.hint?.hide()

  return {
    onClick,
    linkProviderOptions: { hover: textHover, leave },
    linkHandler: { activate: onClick, hover: oscHover, leave, allowNonHttpProtocols: deps.allowFileUris },
  }
}
