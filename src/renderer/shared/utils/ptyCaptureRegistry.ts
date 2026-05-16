/**
 * Records the raw PTY byte stream + resize events for each agent session so
 * Cmd+Shift+C can dump a reproducible terminal-rendering fixture.
 *
 * Unlike `terminalBufferRegistry` (which exposes xterm's serialized render
 * state), this registry captures what xterm receives BEFORE it parses or
 * renders anything. Replaying these bytes into a fresh xterm at the recorded
 * dimensions reproduces any rendering bug the original session exhibited.
 *
 * Format on dump: asciinema cast v2 (see https://docs.asciinema.org/manual/asciicast/v2/).
 *
 * Storage: per-session ring buffer of CaptureEvents, capped by total byte
 * count. When the cap is exceeded, oldest events are evicted (FIFO). The
 * dump's relative timestamps are re-anchored so the first surviving event
 * is at t=0, with a `truncated: true` field in the header so the harness
 * knows the stream is partial.
 */

export interface CaptureEvent {
  /** ms since recording started (before any truncation re-anchoring). */
  tMs: number
  kind: 'o' | 'r'
  /** For 'o': raw bytes as a string. For 'r': "COLSxROWS". */
  data: string
}

export interface AsciinemaHeader {
  version: 2
  width: number
  height: number
  timestamp: number
  env?: Record<string, string>
  /** Non-standard: present when the ring buffer evicted earlier events. */
  truncated?: boolean
}

interface SessionRecorder {
  startWallTime: number
  initialCols: number
  initialRows: number
  events: CaptureEvent[]
  totalBytes: number
  maxBytes: number
  truncated: boolean
  env: Record<string, string>
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

const recorders = new Map<string, SessionRecorder>()

function byteLength(s: string): number {
  // Renderer always has TextEncoder; node test env (vitest with environment: 'node') does too.
  return new TextEncoder().encode(s).length
}

function evictUntilUnderCap(rec: SessionRecorder): void {
  while (rec.totalBytes > rec.maxBytes && rec.events.length > 1) {
    const dropped = rec.events.shift()!
    rec.totalBytes -= byteLength(dropped.data)
    rec.truncated = true
  }
}

export const ptyCaptureRegistry = {
  init(key: string, cols: number, rows: number, env: Record<string, string> = {}, maxBytes = DEFAULT_MAX_BYTES): void {
    recorders.set(key, {
      startWallTime: Date.now(),
      initialCols: cols,
      initialRows: rows,
      events: [],
      totalBytes: 0,
      maxBytes,
      truncated: false,
      env: { ...env },
    })
  },

  recordOutput(key: string, data: string): void {
    const rec = recorders.get(key)
    if (!rec || data.length === 0) return
    rec.events.push({ tMs: Date.now() - rec.startWallTime, kind: 'o', data })
    rec.totalBytes += byteLength(data)
    evictUntilUnderCap(rec)
  },

  recordResize(key: string, cols: number, rows: number): void {
    const rec = recorders.get(key)
    if (!rec) return
    const last = rec.events.length > 0 ? rec.events[rec.events.length - 1] : null
    const lastDims = last?.kind === 'r' ? last.data : `${rec.initialCols}x${rec.initialRows}`
    const data = `${cols}x${rows}`
    if (data === lastDims) return
    rec.events.push({ tMs: Date.now() - rec.startWallTime, kind: 'r', data })
    rec.totalBytes += byteLength(data)
    evictUntilUnderCap(rec)
  },

  dispose(key: string): void {
    recorders.delete(key)
  },

  /** For diagnostics / tests. */
  hasRecorder(key: string): boolean {
    return recorders.has(key)
  },

  serializeAsciinema(key: string): string | null {
    const rec = recorders.get(key)
    if (!rec) return null

    const earliest = rec.events.length > 0 ? rec.events[0].tMs : 0
    const header: AsciinemaHeader = {
      version: 2,
      width: rec.initialCols,
      height: rec.initialRows,
      timestamp: Math.floor(rec.startWallTime / 1000),
      env: Object.keys(rec.env).length > 0 ? rec.env : undefined,
    }
    if (rec.truncated) header.truncated = true

    const lines: string[] = [JSON.stringify(header)]
    for (const ev of rec.events) {
      const tSec = Math.max(0, ev.tMs - earliest) / 1000
      lines.push(JSON.stringify([Number(tSec.toFixed(6)), ev.kind, ev.data]))
    }
    return `${lines.join('\n')}\n`
  },
}

declare global {
  interface Window {
    __ptyCaptureRegistry?: typeof ptyCaptureRegistry
  }
}

if (typeof window !== 'undefined') {
  window.__ptyCaptureRegistry = ptyCaptureRegistry
}
