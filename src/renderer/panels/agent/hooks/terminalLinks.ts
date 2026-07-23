/**
 * Wires ⌘-click (⌃-click on Win/Linux) an http(s) URL to open it externally (#149) into an
 * xterm instance. The single entry point `useTerminalSetup` needs — it composes the three
 * pieces so the setup effect stays a one-liner:
 *
 *   terminalLinkHandler.ts — the gate (pure: no xterm, no DOM)
 *   terminalLinkHint.ts    — the "⌘click to open" affordance (DOM)
 *   this module            — the xterm bindings for both of xterm's link paths
 *
 * Both paths must be wired. Detected URL text goes through the web-links addon; OSC 8
 * hyperlinks go through the core `linkHandler`, and without one they fall back to xterm's
 * default (a blocking `confirm()` then `window.open` on *any* plain click), which would open
 * some links with no modifier at all. They share one gate and one hint so the two kinds of
 * link are indistinguishable to the user.
 */
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { ILinkHandler } from '@xterm/xterm'

import { isMac } from '../../../shared/utils/platform'
import { createTerminalLinkHandlers } from './terminalLinkHandler'
import { createTerminalLinkHint, type TerminalLinkHintElement } from './terminalLinkHint'

export interface TerminalLinkWiring {
  /** Passed to the `XTerm` constructor — covers OSC 8 hyperlinks. */
  linkHandler: ILinkHandler
  /** `loadAddon` this — covers URL-shaped text. */
  addon: WebLinksAddon
  /**
   * The shared hover affordance. Handed to the file-path link provider (#153) so a path link
   * and a URL link are indistinguishable to the user: same gesture, same "⌘click to open".
   */
  hint: TerminalLinkHintElement
  /** Belongs in the setup effect's cleanup, beside `terminal.dispose()`. */
  dispose: () => void
}

/**
 * Build the link wiring for a terminal mounted on `container`.
 *
 * The gate wants the platform modifier plus the primary button, and re-checks the scheme —
 * the main process restricts `shell.openExternal` to http(s) as well, since terminal output
 * is untrusted. Open failures are logged rather than left as an unhandled rejection: a plain
 * click still positions the cursor, so a failed open must not break the terminal.
 */
export function createLinkWiring(container: HTMLElement): TerminalLinkWiring {
  const hint = createTerminalLinkHint(container)
  const handlers = createTerminalLinkHandlers({
    isMac,
    hint,
    openExternal: (uri) => {
      window.shell.openExternal(uri).catch((err: unknown) => {
        console.error('[terminal] failed to open link', err)
      })
    },
  })

  return {
    linkHandler: handlers.linkHandler,
    addon: new WebLinksAddon(handlers.onClick, handlers.linkProviderOptions),
    hint,
    dispose: () => hint.dispose(),
  }
}
