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

/** Kept clear of the window edges when the hint has to be pushed back inside. */
const VIEWPORT_MARGIN_PX = 4

/**
 * Longest target spelled out in the hint. Paths that reach the hint are long by nature — that a
 * chip's path wraps is the whole reason it needs a hyperlink — and the hint is one nowrap line.
 */
const MAX_DETAIL_CHARS = 72

/**
 * Shorten from the MIDDLE, so both ends survive: the leading `/Users/…` says which tree it is and
 * the trailing segment is the filename — the part the user is actually checking before ⌘-clicking.
 * A tail-truncating ellipsis (CSS `text-overflow`) would drop exactly that.
 */
export function middleEllipsis(text: string, max = MAX_DETAIL_CHARS): string {
  if (text.length <= max) return text
  const keepEnd = Math.ceil((max - 1) * 0.6) // favour the filename end
  return `${text.slice(0, max - 1 - keepEnd)}…${text.slice(text.length - keepEnd)}`
}

const HINT_CLASSES =
  'xterm-hover fixed z-50 pointer-events-none px-1.5 py-0.5 rounded border border-border ' +
  'bg-bg-tertiary text-text-secondary text-2xs whitespace-nowrap shadow-lg ' +
  // Belt-and-braces for a window narrower than the hint itself: the clamp below can only push the
  // hint back to the left edge, it cannot make it fit.
  'max-w-[calc(100vw-8px)] overflow-hidden text-ellipsis'

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
      el.textContent = detail
        ? `${modifierSymbol}click to open ${middleEllipsis(detail)}`
        : `${modifierSymbol}click to open`
      el.style.display = ''
      // Anchored below-right of the pointer. `fixed` means viewport coordinates, which is exactly
      // what clientX/clientY are, so no ancestor needs to be positioned.
      //
      // Then clamped back inside the window: the hint is one nowrap line, so a long target hovered
      // near the right edge would otherwise run off-screen — and the end that falls off is the
      // filename. Measured after the text is set and `display` cleared, so `offsetWidth` is real.
      const maxLeft = window.innerWidth - el.offsetWidth - VIEWPORT_MARGIN_PX
      const maxTop = window.innerHeight - el.offsetHeight - VIEWPORT_MARGIN_PX
      el.style.left = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(event.clientX + CURSOR_OFFSET_PX, maxLeft))}px`
      el.style.top = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(event.clientY + CURSOR_OFFSET_PX, maxTop))}px`
    },
    hide(): void {
      el.style.display = 'none'
    },
    dispose(): void {
      el.remove()
    },
  }
}
