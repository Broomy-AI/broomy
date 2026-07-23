/**
 * Terminal file-path links (#153): ⌘/⌃-click an EXISTING path printed in the terminal to open it
 * (document/media → OS default app) or reveal it in the file manager (everything else). Modeled on
 * iTerm2 Semantic History — only paths that resolve to an existing file are linkified.
 *
 * Two line shapes are reconstructed before detection:
 *  - xterm SOFT wraps (`ILine.isWrapped`) — a logical line the terminal split at its right edge.
 *  - Claude Code HARD wraps — Ink prints a long tool-call argument as a real `\n` + a hanging indent
 *    aligned under the tool label (`● Read(/very/long/…` → `           …/name.html)`), so the path
 *    lands on several `isWrapped === false` rows. These are stitched only inside a `● Label( … )`
 *    tool-call envelope, gated by the wrap margin, a consistent content-start indent, and existence,
 *    so an ordinary indented line can't be mis-joined (#154 follow-up).
 *
 * Everything is reconstructed into one canonical string `T` with a span table mapping each UTF-16
 * code unit back to its `{row, cell}` origin, so detection runs once and every link gets an exact,
 * honest cell range (per-row segments for hard wraps, where the stripped indent must not be
 * underlined). The cell/text walker is shared by both shapes. Adapted in spirit from
 * `@xterm/addon-web-links` `LinkComputer` (MIT © 2019 The xterm.js authors).
 */
import type { Terminal, ILink, ILinkProvider, IDisposable, IBuffer, IBufferLine, IBufferCell } from '@xterm/xterm'
import { isMac } from '../../../shared/utils/platform'
import { hasOpenModifier, type TerminalLinkClick, type TerminalLinkHint } from './terminalLinkHandler'

const MAX_PATH_LEN = 4096
/** Matches the main `shell:pathExists` per-call cap; larger candidate sets are chunked. */
const PATHS_PER_BATCH = 64
/**
 * Most distinct paths one hover will probe. A 128-row soft-wrapped line dense in `word/word`
 * tokens would otherwise fan out into many concurrent IPC calls; main's semaphore contains the
 * damage either way, but the renderer should state its own bound rather than lean on that.
 */
const MAX_PROBES_PER_HOVER = 128
/** Most unused display cells a row may have and still count as "wrapped at the right edge". */
const WRAP_MARGIN_TOL = 1
/** Hard-wrap logical units we'll stitch into one block before giving up (a scan bound, not a proof). */
const MAX_WRAP_ROWS = 8
/** Physical rows a single soft-wrap unit may span before we stop expanding (bounds hover work). */
const MAX_SOFT_ROWS = 64

// A path candidate at a token boundary. The boundary (start-of-line / whitespace / opening
// delimiter) is NOT captured — only group 1, the path, is. The relative first segment excludes `:`
// (so `https:/…` / `x:/…` can't match), and requiring a boundary before the leading `/` keeps this
// out of `https://x/y` (its `//` follows a `:`).
const PATH_RE = /(?:^|[\s'"`([{<])((?:~\/|\/|[^\s/:'"`([{<]+\/)[^\s'"`)\]}>]*)/g
const LINE_SUFFIX_RE = /:\d+(?::\d+)?$/
const TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]+$/
/** A "path-ish" char — same class as PATH_RE's tail (used to detect a token cut across a hard wrap). */
const PATH_CHAR_RE = /[^\s'"`)\]}>]/
/** A Claude Code tool-call header: optional nesting, a bullet, a label, then the opening paren. */
const ANCHOR_RE = /^(\s*)[●⏺] \S+\(/
/** Claude structural markers a hard-wrap continuation must never start with. */
const STRUCT_MARKER_RE = /^[⎿●⏺]/

/**
 * Find file-path candidates in a (reconstructed) line. Matches absolute `/…`, `~/…`, and relative
 * `seg/…` tokens; strips a trailing `:line[:col]` suffix and trailing punctuation. Returns each
 * path's exact text and its `[start, end)` offsets in `line`. These are only candidates — existence
 * is checked separately.
 */
export function detectPathCandidates(line: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = []
  PATH_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PATH_RE.exec(line))) {
    const start = m.index + (m[0].length - m[1].length)
    // Strip a trailing :line[:col] suffix and trailing punctuation, alternating until stable so
    // `/a.ts:42,` (punct hides the suffix) and `/a.md).` both reduce fully.
    let text = m[1]
    let prev = ''
    while (text !== prev) {
      prev = text
      text = text.replace(LINE_SUFFIX_RE, '').replace(TRAILING_PUNCT_RE, '')
    }
    if (text.length < 2 || text.length > MAX_PATH_LEN || !text.includes('/') || text === '~/') continue
    out.push({ text, start, end: start + text.length })
  }
  return out
}

// --- Line reconstruction: soft-wrap units, hard-wrap blocks, and the shared cell/span walker ---

/** Where one UTF-16 code unit of the reconstructed text came from: buffer row `y`, half-open cells. */
interface Span { y: number; x1: number; x2: number }
/**
 * A physical buffer row contributing to the reconstruction, with `skip` leading cells (indent)
 * dropped. `unitStart` marks the first row of a hard-wrap continuation unit — a hard boundary the
 * linked path must cross.
 */
interface RowSpec { y: number; skip: number; unitStart?: boolean }

/**
 * End-exclusive display column after a line's last WRITTEN cell — matching xterm's
 * `translateToString(true)`, which trims trailing unwritten cells (`getChars() === ''`) but KEEPS a
 * printed trailing space. Using this as the reconstruction boundary preserves a space at a wrap seam,
 * so two tokens can never be glued into a bogus path.
 */
function occupiedEnd(line: IBufferLine, cell: IBufferCell): number {
  let end = 0
  for (let i = 0; i < line.length; i++) {
    line.getCell(i, cell)
    if (cell.getWidth() === 0) continue
    if (cell.getChars() !== '') end = i + cell.getWidth() // written (a printed space counts)
  }
  return end
}

/** Number of leading blank cells (the hanging-indent width). */
function leadingIndent(line: IBufferLine, cell: IBufferCell): number {
  let i = 0
  for (; i < line.length; i++) {
    line.getCell(i, cell)
    const ch = cell.getChars()
    if (ch !== ' ' && ch !== '') break
  }
  return i
}

/**
 * Physical row range [top, bottom] of the xterm soft-wrap logical line containing `y`, bounded to
 * `MAX_SOFT_ROWS` in each direction. `overflow` is set when the cap was hit before the wrap ended, so
 * callers can fail closed rather than treat a truncated middle of a giant path as a whole line.
 */
function softUnitBounds(buf: IBuffer, y: number): { top: number; bottom: number; overflow: boolean } {
  let top = y
  let overflow = false
  for (let n = 0; top > 0 && buf.getLine(top)?.isWrapped; n++) {
    if (n >= MAX_SOFT_ROWS) { overflow = true; break }
    top--
  }
  let bottom = y
  for (let n = 0; buf.getLine(bottom + 1)?.isWrapped; n++) {
    if (n >= MAX_SOFT_ROWS) { overflow = true; break }
    bottom++
  }
  return { top, bottom, overflow }
}

/**
 * Whether the unit starting at `belowTop` is a Claude hard-wrap continuation of the unit ending at
 * `aboveBottom`: the upper row fills to the wrap margin and ends mid-token (path-ish, no trailing
 * space), and the lower row is indented then continues with a path-ish char (not a `⎿/●/⏺` marker).
 */
function isHardContinuation(buf: IBuffer, aboveBottom: number, belowTop: number, cell: IBufferCell, cols: number): boolean {
  const a = buf.getLine(aboveBottom)
  const b = buf.getLine(belowTop)
  if (!a || !b) return false
  const unused = cols - occupiedEnd(a, cell)
  if (unused < 0 || unused > WRAP_MARGIN_TOL) return false // fills the right edge (fail closed if negative)
  const aStr = a.translateToString(true)
  if (aStr.length === 0 || !PATH_CHAR_RE.test(aStr[aStr.length - 1])) return false // cut mid-token
  const indent = leadingIndent(b, cell)
  if (indent < 1) return false
  const bStr = b.translateToString(true)
  if (indent >= bStr.length) return false // all-blank continuation
  const first = bStr[indent]
  return !STRUCT_MARKER_RE.test(first) && PATH_CHAR_RE.test(first)
}

/**
 * If `q` sits inside a wrapped `● Label( … )` tool call, return the full ordered row set (continuation
 * rows carry `skip` = the content-start indent to strip) plus the anchor row. Returns `null` when it
 * is not such a block, so the caller falls back to the plain soft-wrap line.
 */
function collectBlock(term: Terminal, qUnit: { top: number; bottom: number }): { rows: RowSpec[] } | null {
  const buf = term.buffer.active
  const cell = buf.getNullCell()
  const cols = term.cols

  const units: { top: number; bottom: number }[] = [qUnit]
  // Walk up to the anchor across hard-wrap continuations.
  for (let guard = 0; guard < MAX_WRAP_ROWS; guard++) {
    const first = units[0]
    if (first.top <= 0) break
    const above = softUnitBounds(buf, first.top - 1)
    if (above.overflow || !isHardContinuation(buf, above.bottom, first.top, cell, cols)) break
    units.unshift(above)
  }

  const anchorY = units[0].top
  const anchorLine = buf.getLine(anchorY)
  if (!anchorLine) return null
  const m = ANCHOR_RE.exec(anchorLine.translateToString(true))
  if (!m) return null
  const N = m[1].length
  anchorLine.getCell(N, cell)
  const contentCol = N + (cell.getWidth() || 1) + 1 // where the label (and its hanging indent) starts

  // Every continuation collected on the way up must align exactly at the content column.
  for (let u = 1; u < units.length; u++) {
    if (leadingIndent(buf.getLine(units[u].top)!, cell) !== contentCol) return null
  }

  // Walk down across further continuations.
  for (let guard = 0; guard < MAX_WRAP_ROWS; guard++) {
    const last = units[units.length - 1]
    const nextIdx = last.bottom + 1
    if (!buf.getLine(nextIdx)) break
    const below = softUnitBounds(buf, nextIdx)
    if (below.overflow || !isHardContinuation(buf, last.bottom, below.top, cell, cols)) break
    if (leadingIndent(buf.getLine(below.top)!, cell) !== contentCol) break
    units.push(below)
  }

  if (units.length < 2 || units.length > MAX_WRAP_ROWS) return null // not wrapped (or past the scan cap)

  const rows: RowSpec[] = []
  for (let u = 0; u < units.length; u++) {
    for (let y = units[u].top; y <= units[u].bottom; y++) {
      const unitStart = y === units[u].top
      rows.push({ y, skip: u > 0 && unitStart ? contentCol : 0, unitStart: u > 0 && unitStart })
    }
  }
  return { rows }
}

/** Rows for the plain (non-block) case: the given soft-wrap logical line, nothing stripped. */
function plainRows(qUnit: { top: number; bottom: number }): RowSpec[] {
  const rows: RowSpec[] = []
  for (let y = qUnit.top; y <= qUnit.bottom; y++) rows.push({ y, skip: 0 })
  return rows
}

/**
 * Reconstruct the text of `rows` and a parallel span table. One entry per UTF-16 code unit; each
 * occupied cell contributes its `getChars()` once (empty width>0 cells render as a space, matching
 * `translateToString(true)`), width-0 continuation cells are skipped, and display width advances once
 * per cell — so wide (CJK/emoji) and zero-width cells map to exact half-open cell ranges.
 */
function buildBlockText(buf: IBuffer, rows: RowSpec[]): { text: string; spans: Span[]; boundaries: number[] } {
  const cell = buf.getNullCell()
  let text = ''
  const spans: Span[] = []
  const boundaries: number[] = [] // text offset at the start of each hard-wrap continuation unit
  for (const { y, skip, unitStart } of rows) {
    const line = buf.getLine(y)
    if (!line) continue
    if (unitStart) boundaries.push(text.length)
    const end = occupiedEnd(line, cell)
    for (let i = skip; i < end; i++) {
      line.getCell(i, cell)
      const w = cell.getWidth()
      if (w === 0) continue
      const chars = cell.getChars() || ' '
      const x2 = i + w
      // One span per UTF-16 code unit (not per code point) so detect's string offsets map back
      // exactly; a for-of over `chars` would collapse a surrogate pair and desync the count.
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let u = 0; u < chars.length; u++) spans.push({ y, x1: i, x2 })
      text += chars
    }
  }
  return { text, spans, boundaries }
}

// --- end reconstruction section ---

interface CacheEntry {
  exists: boolean
  ts: number
}
const POSITIVE_TTL = 10_000
const NEGATIVE_TTL = 2_000
const CACHE_MAX = 500

export interface FilePathLinkDeps {
  isMac: boolean
  /** Session worktree dir; relative paths resolve against it (in main). Part of the cache key. */
  baseCwd: string
  /**
   * Batch existence check (main resolves + lstats). One entry per input, in input order:
   * `true`/`false` for a completed probe, `null` when main declined to probe under load.
   */
  pathExists: (paths: string[]) => Promise<(boolean | null)[]>
  /** Open (or reveal) the clicked path. */
  openPath: (path: string) => void
  /** The hover affordance shared with URL links; optional so tests can omit it. */
  hint?: TerminalLinkHint
}

/**
 * xterm link provider for existing file paths. Async and lifecycle-safe: a superseded or disposed
 * request never calls its callback (that would clobber xterm's shared reply map), and buffer
 * output / resize invalidates in-flight requests.
 */
export class FilePathLinkProvider implements ILinkProvider {
  private _epoch = 0
  private _disposed = false
  private readonly _cache = new Map<string, CacheEntry>()
  private readonly _subs: IDisposable[] = []

  constructor(
    private readonly _terminal: Terminal,
    private readonly _deps: FilePathLinkDeps,
  ) {
    // Invalidate any in-flight request when the buffer changes under a stationary pointer.
    this._subs.push(_terminal.onWriteParsed(() => { this._epoch++ }))
    this._subs.push(_terminal.onResize(() => { this._epoch++ }))
  }

  dispose(): void {
    this._disposed = true
    this._epoch++
    for (const s of this._subs) s.dispose()
    this._subs.length = 0
    this._cache.clear()
  }

  provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void): void {
    const myEpoch = ++this._epoch
    const q = bufferLineNumber - 1
    const buf = this._terminal.buffer.active
    if (!buf.getLine(q)) { callback(undefined); return }
    // All buffer reads + range mapping happen synchronously here, before the async existence probe.
    const qUnit = softUnitBounds(buf, q)
    if (qUnit.overflow) { callback(undefined); return } // truncated giant wrap → fail closed
    const block = collectBlock(this._terminal, qUnit)
    const rows = block ? block.rows : plainRows(qUnit)
    const { text, spans, boundaries } = buildBlockText(buf, rows)
    const candidates = detectPathCandidates(text)
    if (candidates.length === 0) {
      callback(undefined)
      return
    }

    // A tool-call block only links the wrapped PAYLOAD path: it must start after the anchor's `(`
    // (`● Label(`), begin in the anchor unit, and cross the FIRST hard-wrap boundary — which uniquely
    // selects it (only one detected token can start in the anchor payload and cross that seam), so an
    // incidental token sitting in a continuation row is never linked.
    const blockInfo = block ? { parenOff: text.indexOf('('), boundaries } : null

    const mapped = candidates
      .map((c) => this._toLink(c, spans, text, q, blockInfo))
      .filter((l): l is ILink => l !== null)
    if (mapped.length === 0) {
      callback(undefined)
      return
    }

    // Emit the existing links. Guarded by `stale()`: a superseded (newer hover), disposed, or
    // buffer-mutated request must NOT call cb — a stale cb writes into xterm's current reply map
    // and would clobber the newer request's result.
    //
    // The CACHE is deliberately outside that guard. An `lstat` answer is a fact about the
    // filesystem; it does not depend on which hover asked or on what the buffer did meanwhile,
    // and its freshness is already bounded by the TTLs below. Dropping it on staleness caused a
    // livelock: an agent repaints its status line several times a second, so `onWriteParsed`
    // superseded every probe before its IPC round-trip returned, the cache never warmed, and a
    // path printed by a still-running agent stayed un-clickable — precisely the case the feature
    // exists for. Writing through means the next hover emits synchronously from cache.
    const stale = (): boolean => this._disposed || myEpoch !== this._epoch
    const emit = (): void => {
      const links = mapped.filter((l) => this._cacheGet(l.text, Date.now()) === true)
      callback(links.length ? links : undefined)
    }

    const now = Date.now()
    const needed = [...new Set(mapped.map((l) => l.text).filter((t) => this._cacheGet(t, now) === undefined))]
      .slice(0, MAX_PROBES_PER_HOVER)
    if (needed.length === 0) {
      if (!stale()) emit()
      return
    }
    // Batch to the handler's per-call cap so candidates past the cap aren't misread as nonexistent.
    const batches: string[][] = []
    for (let i = 0; i < needed.length; i += PATHS_PER_BATCH) batches.push(needed.slice(i, i + PATHS_PER_BATCH))
    Promise.all(batches.map((b) => this._deps.pathExists(b)))
      .then((results) => {
        const flat = results.flat()
        const stamp = Date.now()
        // `null` means main declined to probe (backpressure), not "absent" — leave it uncached
        // so the next hover asks again rather than showing no link for a whole negative TTL.
        needed.forEach((t, i) => { if (typeof flat[i] === 'boolean') this._cacheSet(t, flat[i], stamp) })
        if (!stale()) emit()
      })
      .catch(() => {
        if (!stale()) callback(undefined)
      })
  }

  /**
   * Turn a detected candidate into an `ILink`, or null if it doesn't qualify on this row. Plain lines
   * get the full (possibly multi-row soft-wrap) range. A block candidate must be the wrapped payload
   * path — starting after the anchor's `(`, beginning in the anchor unit, crossing the first hard-wrap
   * boundary, and closed by a `)` — with a range covering only its per-row segment, so the stripped
   * hanging indent is never underlined.
   */
  private _toLink(
    c: { text: string; start: number; end: number },
    spans: Span[],
    text: string,
    q: number,
    block: { parenOff: number; boundaries: number[] } | null,
  ): ILink | null {
    let range: ILink['range']
    if (block) {
      // spans has one entry per code unit of `text`, so every offset in a detected candidate maps.
      // A linkable candidate must start after the anchor's `(` and inside the anchor unit — i.e.
      // in real, contiguous buffer text, not in a continuation row whose join we only INFERRED.
      // `first` exists because a block always has ≥1 continuation unit.
      //
      // It may then either cross the first boundary (the wrapped payload — uniquely selected,
      // since only one token can start in the anchor payload and span that seam) or end before it
      // (an ordinary unwrapped path sharing the anchor row, e.g. the first argument of
      // `● Read(/a/short.txt, /a/very/long/…`). The latter crosses no seam, so it carries none of
      // the mis-join risk the boundary rule guards against, and refusing it would have made a path
      // linkable or not depending on whether an unrelated argument happened to wrap.
      const first = block.boundaries[0]
      if (c.start <= block.parenOff || c.start >= first) return null
      if (!text.includes(')', c.end)) return null // the tool call closes after the path
      let x1 = Infinity
      let x2 = -Infinity
      for (let o = c.start; o < c.end; o++) {
        const sp = spans[o]
        if (sp.y === q) { if (sp.x1 < x1) x1 = sp.x1; if (sp.x2 > x2) x2 = sp.x2 }
      }
      if (x2 < 0) return null // no segment on this row
      range = { start: { x: x1 + 1, y: q + 1 }, end: { x: x2, y: q + 1 } }
    } else {
      const s0 = spans[c.start]
      const s1 = spans[c.end - 1]
      range = { start: { x: s0.x1 + 1, y: s0.y + 1 }, end: { x: s1.x2, y: s1.y + 1 } }
    }
    return {
      text: c.text,
      range,
      decorations: { underline: true, pointerCursor: true },
      activate: (event: MouseEvent, uri: string) => {
        if (!hasOpenModifier(event as TerminalLinkClick, this._deps.isMac)) return
        // Hide first: focus leaves for the opened app and xterm fires no `leave` for a link the
        // pointer never left, so the hint would otherwise stay on screen (same as the URL path).
        this._deps.hint?.hide()
        this._deps.openPath(uri)
      },
      // Same affordance as URL links: xterm underlines and shows a pointer cursor whether or not
      // the modifier is held, so without the hint a plain click is a dead end with no feedback.
      hover: (event: MouseEvent) => this._deps.hint?.show(event, c.text),
      leave: () => this._deps.hint?.hide(),
    }
  }

  private _key(rawToken: string): string {
    return `${this._deps.baseCwd}\u0000${rawToken}`
  }

  private _cacheGet(rawToken: string, now: number): boolean | undefined {
    const key = this._key(rawToken)
    const e = this._cache.get(key)
    if (!e) return undefined
    if (now - e.ts > (e.exists ? POSITIVE_TTL : NEGATIVE_TTL)) {
      this._cache.delete(key)
      return undefined
    }
    return e.exists
  }

  private _cacheSet(rawToken: string, exists: boolean, ts: number): void {
    const key = this._key(rawToken)
    // Delete before set: `Map.set` on an existing key keeps its original insertion position, so
    // without this a hot, repeatedly-refreshed path would be evicted ahead of colder later ones.
    this._cache.delete(key)
    if (this._cache.size >= CACHE_MAX) {
      const oldest = this._cache.keys().next().value
      if (oldest !== undefined) this._cache.delete(oldest)
    }
    this._cache.set(key, { exists, ts })
  }
}

/**
 * Register the file-path link provider on a terminal, wired to `window.shell`. Returns a single
 * disposable that tears down both the provider (stopping late callbacks) and its registration.
 * `baseCwd` is the session's worktree dir — relative paths resolve against it (in main).
 * `hint` is the affordance created by `createLinkWiring`, shared so path and URL links look and
 * behave the same; it is owned (and disposed) by that wiring, not by this provider.
 */
export function registerFilePathLinks(terminal: Terminal, baseCwd: string, hint?: TerminalLinkHint): IDisposable {
  const provider = new FilePathLinkProvider(terminal, {
    isMac,
    baseCwd,
    hint,
    pathExists: (paths) => window.shell.pathExists(paths, baseCwd),
    openPath: (p) => {
      window.shell
        .openPath(p, baseCwd)
        .then((r) => { if (r.error) console.error('[terminal] failed to open path', r.error) })
        .catch((err: unknown) => console.error('[terminal] failed to open path', err))
    },
  })
  const reg = terminal.registerLinkProvider(provider)
  return { dispose: () => { provider.dispose(); reg.dispose() } }
}
