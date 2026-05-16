/**
 * Minimal parser/serializer for asciinema cast v2 files.
 *
 * Spec: https://docs.asciinema.org/manual/asciicast/v2/
 *
 * A cast file is JSONL: line 1 is a header object, every subsequent non-empty
 * line is a 3-element array [time_seconds, kind, data]. `kind` is "o"
 * (output), "i" (input), or "r" (resize, data is "COLSxROWS"). We ignore "i"
 * events for replay since they don't affect rendered output.
 */

export interface CastHeader {
  version: 2
  width: number
  height: number
  timestamp?: number
  env?: Record<string, string>
  /** Broomy extension: indicates the ring buffer dropped earlier events. */
  truncated?: boolean
}

export interface CastEvent {
  tSec: number
  kind: 'o' | 'i' | 'r'
  data: string
}

export interface ParsedCast {
  header: CastHeader
  events: CastEvent[]
}

export function parseCast(text: string): ParsedCast {
  const lines = text.split('\n').filter(l => l.length > 0)
  if (lines.length === 0) throw new Error('Empty cast file')

  const header = JSON.parse(lines[0]) as CastHeader
  if (header.version !== 2) throw new Error(`Unsupported cast version: ${String(header.version)}`)
  if (typeof header.width !== 'number' || typeof header.height !== 'number') {
    throw new Error('Cast header missing width/height')
  }

  const events: CastEvent[] = []
  for (let i = 1; i < lines.length; i++) {
    const raw = JSON.parse(lines[i]) as unknown
    if (!Array.isArray(raw) || raw.length < 3) {
      throw new Error(`Invalid cast event on line ${i + 1}: ${lines[i]}`)
    }
    const [t, k, d] = raw as [number, string, string]
    if (k !== 'o' && k !== 'i' && k !== 'r') {
      throw new Error(`Invalid cast event kind on line ${i + 1}: ${k}`)
    }
    events.push({ tSec: t, kind: k, data: d })
  }
  return { header, events }
}

export function parseResize(data: string): { cols: number; rows: number } {
  const match = /^(\d+)x(\d+)$/.exec(data)
  if (!match) throw new Error(`Invalid resize payload: ${data}`)
  return { cols: parseInt(match[1], 10), rows: parseInt(match[2], 10) }
}
