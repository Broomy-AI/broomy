/**
 * Replays an asciinema cast through @xterm/headless and dumps the resulting
 * buffer state to a deterministic string. This is the foundation of the
 * terminal-rendering regression harness: any cast that exhibits a rendering
 * bug in a real Broomy session should produce a snapshot that captures the
 * bug, so we can iterate on parser/renderer fixes without re-running Claude.
 */
import { Terminal as HeadlessTerminal } from '@xterm/headless'
import { parseCast, parseResize, type ParsedCast } from './cast'

export interface ReplayResult {
  cols: number
  rows: number
  /** All rendered lines in the scrollback + viewport, joined by '\n'. */
  text: string
  /** Cursor position at end of replay. */
  cursorX: number
  cursorY: number
  /** baseY at end of replay (scroll position). */
  baseY: number
}

export interface ReplayOptions {
  /** Override the cast's recorded dimensions. */
  cols?: number
  rows?: number
}

function writeAsync(terminal: HeadlessTerminal, data: string): Promise<void> {
  return new Promise((resolve) => {
    terminal.write(data, () => resolve())
  })
}

export async function replayCast(cast: ParsedCast, options: ReplayOptions = {}): Promise<ReplayResult> {
  const cols = options.cols ?? cast.header.width
  const rows = options.rows ?? cast.header.height

  const terminal = new HeadlessTerminal({
    cols, rows,
    scrollback: 5000,
    allowProposedApi: true,
  })

  try {
    for (const ev of cast.events) {
      if (ev.kind === 'o') {
        await writeAsync(terminal, ev.data)
      } else if (ev.kind === 'r') {
        const { cols: c, rows: r } = parseResize(ev.data)
        terminal.resize(c, r)
      }
    }

    const buf = terminal.buffer.active
    const total = buf.length
    const lines: string[] = []
    for (let y = 0; y < total; y++) {
      const line = buf.getLine(y)
      lines.push(line ? line.translateToString(true) : '')
    }

    return {
      cols: terminal.cols,
      rows: terminal.rows,
      text: lines.join('\n'),
      cursorX: buf.cursorX,
      cursorY: buf.cursorY,
      baseY: buf.baseY,
    }
  } finally {
    terminal.dispose()
  }
}

export async function replayCastText(text: string, options: ReplayOptions = {}): Promise<ReplayResult> {
  return replayCast(parseCast(text), options)
}

export function formatReplayResult(r: ReplayResult): string {
  const header = `# cols=${r.cols} rows=${r.rows} cursorX=${r.cursorX} cursorY=${r.cursorY} baseY=${r.baseY}`
  return `${header}\n${r.text}\n`
}
