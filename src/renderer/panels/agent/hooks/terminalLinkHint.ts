/**
 * The "⌘ click to open" hint shown while the pointer is over a terminal link (#149).
 *
 * xterm underlines a link and switches the cursor to a pointer as soon as the mouse is over
 * it, with no way to say "…but you need a modifier". Without this hint the first plain click
 * is a dead end: the link *looks* clickable, nothing happens, and there is nothing to tell
 * the user why. VS Code and iTerm2 solve it the same way.
 *
 * The element carries xterm's `xterm-hover` class as its docs require, so it does not swallow
 * mouse events into the terminal beneath (belt-and-braces with `pointer-events-none`), and is
 * positioned from the pointer rather than the buffer range — the `MouseEvent` is right there,
 * and cell-to-pixel maths would have to track font size and zoom.
 */
import { modifierSymbol } from '../../../shared/utils/platform'

/** Kept off the pointer so the hint never covers the link it describes. */
const CURSOR_OFFSET_PX = 12

const HINT_CLASSES =
  'xterm-hover fixed z-50 pointer-events-none px-1.5 py-0.5 rounded border border-border ' +
  'bg-bg-tertiary text-text-secondary text-2xs whitespace-nowrap shadow-lg'

export interface TerminalLinkHintElement {
  /** `detail` (a file link's decoded path) is appended so a deceptive label can't hide the target. */
  show(event: MouseEvent, detail?: string): void
  hide(): void
  dispose(): void
}

/**
 * Create the hint inside `container` (the element xterm is opened on).
 *
 * `dispose` must be called with the terminal — the setup effect's cleanup kills the PTY and
 * the terminal together, and a detached hint would outlive both.
 */
export function createTerminalLinkHint(container: HTMLElement): TerminalLinkHintElement {
  const el = document.createElement('div')
  el.className = HINT_CLASSES
  el.style.display = 'none'
  container.appendChild(el)

  return {
    show(event: MouseEvent, detail?: string): void {
      // `textContent` (never innerHTML) — the decoded path is untrusted agent output.
      el.textContent = detail ? `${modifierSymbol}click to open ${detail}` : `${modifierSymbol}click to open`
      el.style.display = ''
      // Anchored above-right of the pointer. `fixed` means viewport coordinates, which is
      // exactly what clientX/clientY are, so no ancestor needs to be positioned.
      el.style.left = `${event.clientX + CURSOR_OFFSET_PX}px`
      el.style.top = `${event.clientY + CURSOR_OFFSET_PX}px`
    },
    hide(): void {
      el.style.display = 'none'
    },
    dispose(): void {
      el.remove()
    },
  }
}
