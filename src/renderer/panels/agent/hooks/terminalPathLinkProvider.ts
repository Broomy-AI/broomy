/**
 * Terminal file-path links (#153): ⌘/⌃-click an EXISTING path printed in the terminal to open it
 * (document/media → OS default app) or reveal it in the file manager (everything else). Modeled on
 * iTerm2 Semantic History — only paths that resolve to an existing file are linkified.
 *
 * The soft-wrap line reconstruction and cell-accurate string-offset → buffer-position mapping
 * (`getWindowedLineStrings` / `mapStrIdx`) are adapted from `@xterm/addon-web-links` `LinkComputer`
 * (MIT © 2019 The xterm.js authors), with the URL regex + `isUrl` filter replaced by path detection
 * and an asynchronous existence gate added.
 */
import type { Terminal, ILink, ILinkProvider, IDisposable, IBuffer } from '@xterm/xterm'
import { hasOpenModifier, type TerminalLinkClick } from './terminalLinkHandler'

const MAX_PATH_LEN = 4096
/** Matches the main `shell:pathExists` per-call cap; larger candidate sets are chunked. */
const PATHS_PER_BATCH = 64

// A path candidate at a token boundary. The boundary (start-of-line / whitespace / opening
// delimiter) is NOT captured — only group 1, the path, is. The relative first segment excludes `:`
// (so `https:/…` / `x:/…` can't match), and requiring a boundary before the leading `/` keeps this
// out of `https://x/y` (its `//` follows a `:`).
const PATH_RE = /(?:^|[\s'"`([{<])((?:~\/|\/|[^\s/:'"`([{<]+\/)[^\s'"`)\]}>]*)/g
const LINE_SUFFIX_RE = /:\d+(?::\d+)?$/
const TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]+$/

/**
 * Find file-path candidates in a (reconstructed, possibly soft-wrapped) line. Matches absolute
 * `/…`, `~/…`, and relative `seg/…` tokens; strips a trailing `:line[:col]` suffix and trailing
 * punctuation. Returns each path's exact text and its `[start, end)` offsets in `line`. These are
 * only candidates — existence is checked separately.
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

// --- Adapted from @xterm/addon-web-links LinkComputer (MIT © 2019 The xterm.js authors) ---

/** Reconstruct the wrapped logical line containing 0-based `lineIndex`. Returns [rows, topIndex]. */
function getWindowedLineStrings(lineIndex: number, terminal: Terminal): [string[], number] {
  let line = terminal.buffer.active.getLine(lineIndex)
  let topIdx = lineIndex
  let bottomIdx = lineIndex
  let length = 0
  let content = ''
  const lines: string[] = []

  if (line) {
    const currentContent = line.translateToString(true)
    // expand up while wrapped, stopping at a space or > 2048 chars
    if (line.isWrapped && !currentContent.startsWith(' ')) {
      length = 0
      while ((line = terminal.buffer.active.getLine(--topIdx)) && length < 2048) {
        content = line.translateToString(true)
        length += content.length
        lines.push(content)
        if (!line.isWrapped || content.includes(' ')) break
      }
      lines.reverse()
    }
    lines.push(currentContent)
    // expand down while wrapped
    length = 0
    while ((line = terminal.buffer.active.getLine(++bottomIdx)) && line.isWrapped && length < 2048) {
      content = line.translateToString(true)
      length += content.length
      lines.push(content)
      if (content.includes(' ')) break
    }
  }
  return [lines, topIdx]
}

/** +1 when the last cell of a row held an early-wrapped wide char whose continuation starts the next row. */
function earlyWrappedWideCorrection(buf: IBuffer, lineIndex: number): number {
  const next = buf.getLine(lineIndex + 1)
  if (!next?.isWrapped) return 0
  const cell = buf.getNullCell()
  next.getCell(0, cell)
  return cell.getWidth() === 2 ? 1 : 0
}

/** Map a string index in the reconstructed line to 0-based buffer `[lineIndex, columnIndex]`, or `[-1,-1]`. */
function mapStrIdx(terminal: Terminal, lineIndex: number, rowIndex: number, stringIndex: number): [number, number] {
  const buf = terminal.buffer.active
  const cell = buf.getNullCell()
  let start = rowIndex
  while (stringIndex) {
    const line = buf.getLine(lineIndex)
    if (!line) return [-1, -1]
    for (let i = start; i < line.length; ++i) {
      line.getCell(i, cell)
      const chars = cell.getChars()
      if (cell.getWidth()) {
        stringIndex -= chars.length || 1
        if (i === line.length - 1 && chars === '') stringIndex += earlyWrappedWideCorrection(buf, lineIndex)
      }
      if (stringIndex < 0) return [lineIndex, i]
    }
    lineIndex++
    start = 0
  }
  return [lineIndex, start]
}

// --- end adapted section ---

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
  /** Batch existence check (main resolves + lstats). One boolean per input, in input order. */
  pathExists: (paths: string[]) => Promise<boolean[]>
  /** Open (or reveal) the clicked path. */
  openPath: (path: string) => void
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
    const [rows, topIdx] = getWindowedLineStrings(bufferLineNumber - 1, this._terminal)
    const candidates = detectPathCandidates(rows.join(''))
    if (candidates.length === 0) {
      callback(undefined)
      return
    }
    const mapped = candidates
      .map((c) => this._toLink(c, topIdx))
      .filter((l): l is ILink => l !== null)
    if (mapped.length === 0) {
      callback(undefined)
      return
    }

    // Emit the existing links. Guarded by `stale()`: a superseded (newer hover), disposed, or
    // buffer-mutated request must NOT touch the cache or call cb — a stale cb writes into xterm's
    // current reply map and would clobber the newer request's result.
    const stale = (): boolean => this._disposed || myEpoch !== this._epoch
    const emit = (): void => {
      const links = mapped.filter((l) => this._cacheGet(l.text, Date.now()) === true)
      callback(links.length ? links : undefined)
    }

    const now = Date.now()
    const needed = [...new Set(mapped.map((l) => l.text).filter((t) => this._cacheGet(t, now) === undefined))]
    if (needed.length === 0) {
      if (!stale()) emit()
      return
    }
    // Batch to the handler's per-call cap so candidates past the cap aren't misread as nonexistent.
    const batches: string[][] = []
    for (let i = 0; i < needed.length; i += PATHS_PER_BATCH) batches.push(needed.slice(i, i + PATHS_PER_BATCH))
    Promise.all(batches.map((b) => this._deps.pathExists(b)))
      .then((results) => {
        if (stale()) return
        const flat = results.flat()
        const stamp = Date.now()
        needed.forEach((t, i) => this._cacheSet(t, flat[i] ?? false, stamp))
        emit()
      })
      .catch(() => {
        if (!stale()) callback(undefined)
      })
  }

  private _toLink(c: { text: string; start: number; end: number }, topIdx: number): ILink | null {
    const [sy, sx] = mapStrIdx(this._terminal, topIdx, 0, c.start)
    if (sy === -1 || sx === -1) return null
    const [ey, ex] = mapStrIdx(this._terminal, sy, sx, c.text.length)
    if (ey === -1 || ex === -1) return null
    return {
      text: c.text,
      range: { start: { x: sx + 1, y: sy + 1 }, end: { x: ex, y: ey + 1 } },
      decorations: { underline: true, pointerCursor: true },
      activate: (event: MouseEvent, uri: string) => {
        if (hasOpenModifier(event as TerminalLinkClick, this._deps.isMac)) this._deps.openPath(uri)
      },
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
    if (this._cache.size >= CACHE_MAX) {
      const oldest = this._cache.keys().next().value
      if (oldest !== undefined) this._cache.delete(oldest)
    }
    this._cache.set(this._key(rawToken), { exists, ts })
  }
}

/**
 * Register the file-path link provider on a terminal, wired to `window.shell`. Returns a single
 * disposable that tears down both the provider (stopping late callbacks) and its registration.
 * `baseCwd` is the session's worktree dir — relative paths resolve against it (in main).
 */
export function registerFilePathLinks(terminal: Terminal, baseCwd: string): IDisposable {
  const provider = new FilePathLinkProvider(terminal, {
    isMac: navigator.userAgent.includes('Mac'),
    baseCwd,
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
