/**
 * Ring buffer that records terminal scroll events for debugging.
 *
 * Each terminal instance gets its own ScrollLog. Events are tagged with
 * a source (what triggered the scroll) and capture both the xterm buffer
 * state and the DOM viewport state at the time of the event.
 *
 * Logs are retrieved via the global scrollLogRegistry for inclusion in
 * the Cmd+Shift+C debug dump.
 */

export type ScrollSource =
  | 'wheel-up'
  | 'wheel-down'
  | 'key-pageup'
  | 'key-pagedown'
  | 'key-shift-arrow'
  | 'xterm-scroll'       // onScroll event with no recent user gesture
  | 'scroll-to-bottom'   // explicit handleScrollToBottom call
  | 'resize'             // fitAddon.fit() / terminal.resize()

export interface ScrollEvent {
  t: number             // timestamp (ms since terminal creation)
  source: ScrollSource
  viewportY: number
  baseY: number
  /** DOM scrollTop of .xterm-viewport (if available). */
  scrollTop?: number
  /** DOM scrollHeight of .xterm-viewport (if available). */
  scrollHeight?: number
  /** DOM clientHeight of .xterm-viewport (if available). */
  clientHeight?: number
  following: boolean
  /** Extra context, e.g. "jumped from 450 to 0". */
  detail?: string
}

const MAX_EVENTS = 100

export class ScrollLog {
  private events: ScrollEvent[] = []
  private startTime: number

  constructor() {
    this.startTime = Date.now()
  }

  add(event: Omit<ScrollEvent, 't'>) {
    const entry: ScrollEvent = { t: Date.now() - this.startTime, ...event }
    this.events.push(entry)
    if (this.events.length > MAX_EVENTS) {
      this.events.shift()
    }
  }

  format(): string {
    if (this.events.length === 0) return '(no scroll events recorded)'
    const lines = this.events.map((e) => {
      const ts = `${(e.t / 1000).toFixed(2)}s`
      const pos = `vY=${e.viewportY} bY=${e.baseY}`
      const dom = e.scrollTop !== undefined
        ? ` dom(sT=${e.scrollTop} sH=${e.scrollHeight} cH=${e.clientHeight})`
        : ''
      const fol = e.following ? ' [following]' : ' [scrolled-up]'
      const det = e.detail ? ` -- ${e.detail}` : ''
      return `  ${ts} ${e.source.padEnd(18)} ${pos}${dom}${fol}${det}`
    })
    return lines.join('\n')
  }
}

// ── Global registry so debug copy can access logs ──────────────────

const logs = new Map<string, ScrollLog>()

export const scrollLogRegistry = {
  register(sessionId: string, log: ScrollLog) {
    logs.set(sessionId, log)
  },
  unregister(sessionId: string) {
    logs.delete(sessionId)
  },
  get(sessionId: string): ScrollLog | undefined {
    return logs.get(sessionId)
  },
  format(sessionId: string): string {
    return logs.get(sessionId)?.format() ?? '(no scroll log)'
  },
}
