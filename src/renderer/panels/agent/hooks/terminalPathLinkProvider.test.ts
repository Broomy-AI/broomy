import { describe, it, expect, vi } from 'vitest'
import type { Terminal, ILink } from '@xterm/xterm'
import { detectPathCandidates, FilePathLinkProvider, registerFilePathLinks, type FilePathLinkDeps } from './terminalPathLinkProvider'

describe('detectPathCandidates', () => {
  const texts = (line: string): string[] => detectPathCandidates(line).map((c) => c.text)

  it('matches absolute, ~, and relative-with-slash paths', () => {
    expect(texts('see /Users/x/a.html now')).toEqual(['/Users/x/a.html'])
    expect(texts('~/notes/todo.md')).toEqual(['~/notes/todo.md'])
    expect(texts('open src/renderer/foo.ts please')).toEqual(['src/renderer/foo.ts'])
    expect(texts('/a /b/c')).toEqual(['/a', '/b/c'])
  })

  it('reports exact offsets (boundary excluded from the range)', () => {
    const [c] = detectPathCandidates('  /tmp/a.txt')
    expect(c).toEqual({ text: '/tmp/a.txt', start: 2, end: 12 })
  })

  it('strips a :line[:col] suffix and trailing punctuation (in any order)', () => {
    expect(texts('at /src/foo.ts:42:10')).toEqual(['/src/foo.ts'])
    expect(texts('(see /docs/x.md).')).toEqual(['/docs/x.md'])
    expect(texts('`/tmp/a.log`')).toEqual(['/tmp/a.log'])
    expect(texts('/tmp/a.ts:42,')).toEqual(['/tmp/a.ts']) // punct hides the suffix → both stripped
    expect(texts('/x/y.md:3:9).')).toEqual(['/x/y.md'])
  })

  it('does NOT match URLs, scheme-colon tokens, or bare words', () => {
    expect(texts('https://github.com/a/b')).toEqual([])
    expect(texts('x:/tmp/a')).toEqual([])
    expect(texts('just a sentence with words')).toEqual([])
  })

  it('ignores lone roots', () => {
    expect(texts('/ ~/ ~')).toEqual([])
  })
})

// --- Faithful fake xterm buffer: fixed-width rows, right-trim, wide + width-0 cells ---

interface CellSpec { chars: string; width: number }
class FakeCell {
  chars = ''
  width = 1
  getChars(): string { return this.chars }
  getWidth(): number { return this.width }
  set(c: string, w: number): void { this.chars = c; this.width = w }
}
/** One 1-wide cell per character. */
const asciiCells = (text: string): CellSpec[] => Array.from(text, (ch) => ({ chars: ch, width: 1 }))
/** Cells for text where any char in `wide` occupies 2 columns (a width-2 cell + a width-0 spacer). */
function cellsWithWide(text: string, wide: string): CellSpec[] {
  const out: CellSpec[] = []
  for (const ch of Array.from(text)) {
    if (wide.includes(ch)) { out.push({ chars: ch, width: 2 }); out.push({ chars: '', width: 0 }) }
    else out.push({ chars: ch, width: 1 })
  }
  return out
}

function fakeLine(cells: CellSpec[], wrapped: boolean, cols: number) {
  const padded = cells.slice()
  while (padded.length < cols) padded.push({ chars: '', width: 1 }) // unwritten trailing cells, like a real line
  const render = (c: CellSpec) => (c.width === 0 ? '' : c.chars || ' ')
  return {
    isWrapped: wrapped,
    length: padded.length,
    // Like xterm: trimRight drops trailing UNWRITTEN cells (chars === '') but keeps a printed space.
    translateToString: (trimRight?: boolean) => {
      let last = padded.length
      if (trimRight) while (last > 0 && padded[last - 1].chars === '') last--
      return padded.slice(0, last).map(render).join('')
    },
    getCell: (i: number, cell: FakeCell) => { const c = padded[i]; cell.set(c ? c.chars : '', c ? c.width : 1) },
  }
}

function fakeTerminal(rows: { cells: CellSpec[]; wrapped?: boolean }[], cols?: number) {
  const width = cols ?? Math.max(1, ...rows.map((r) => r.cells.length))
  // A real xterm row is fixed-width; a fixture wider than `cols` would misrepresent wrapping.
  for (const r of rows) if (r.cells.length > width) throw new Error(`fixture row exceeds cols=${width}`)
  const lines = rows.map((r) => fakeLine(r.cells, r.wrapped ?? false, width))
  const writeCbs = new Set<() => void>()
  const resizeCbs = new Set<() => void>()
  const term = {
    cols: width,
    buffer: { active: { getLine: (i: number) => lines[i], getNullCell: () => new FakeCell() } },
    onWriteParsed: (cb: () => void) => { writeCbs.add(cb); return { dispose: () => writeCbs.delete(cb) } },
    onResize: (cb: () => void) => { resizeCbs.add(cb); return { dispose: () => resizeCbs.delete(cb) } },
    fireWrite: () => writeCbs.forEach((cb) => cb()),
    fireResize: () => resizeCbs.forEach((cb) => cb()),
    activeSubs: () => writeCbs.size + resizeCbs.size,
  }
  return term as unknown as Terminal & { fireWrite: () => void; fireResize: () => void; activeSubs: () => number }
}

const deps = (over: Partial<FilePathLinkDeps> = {}): FilePathLinkDeps => ({
  isMac: true,
  baseCwd: '/repo',
  pathExists: vi.fn().mockResolvedValue([true]),
  openPath: vi.fn(),
  ...over,
})

/** Call provideLinks and resolve to whatever the (async) callback delivers. */
function provide(provider: FilePathLinkProvider, y: number): Promise<ILink[] | undefined> {
  return new Promise((resolve) => provider.provideLinks(y, resolve))
}

/** pathExists that reports true only for the exact paths listed (order-preserving). */
const existsOnly = (...real: string[]) =>
  vi.fn((paths: string[]) => Promise.resolve(paths.map((p) => real.includes(p))))

describe('FilePathLinkProvider — plain lines', () => {
  it('links a single-row existing path with the correct range', async () => {
    const term = fakeTerminal([{ cells: asciiCells('open /tmp/a.html done') }])
    const provider = new FilePathLinkProvider(term, deps())
    const links = await provide(provider, 1)
    expect(links).toHaveLength(1)
    expect(links![0].text).toBe('/tmp/a.html')
    // "/tmp/a.html" is 11 chars starting at string index 5 → 1-based columns 6..16.
    expect(links![0].range).toEqual({ start: { x: 6, y: 1 }, end: { x: 16, y: 1 } })
  })

  it('links a soft-wrapped path across rows with one full range', async () => {
    // "/very/long/path/name.md" spans row 0 (not wrapped) and row 1 (wrapped).
    const term = fakeTerminal([
      { cells: asciiCells('go /very/long/pa') },
      { cells: asciiCells('th/name.md end'), wrapped: true },
    ])
    const provider = new FilePathLinkProvider(term, deps())
    const links = await provide(provider, 2) // hover the continuation row
    expect(links).toHaveLength(1)
    expect(links![0].text).toBe('/very/long/path/name.md')
    // Path starts at string index 3 on row 0 and ends 23 chars later on row 1.
    expect(links![0].range).toEqual({ start: { x: 4, y: 1 }, end: { x: 10, y: 2 } })
  })

  it('maps ranges past a wide (2-column) char correctly', async () => {
    // 王 is 2 cols: '王', space, then the path at display column 3.
    const term = fakeTerminal([{ cells: cellsWithWide('王 /tmp/a.html', '王') }])
    const provider = new FilePathLinkProvider(term, deps())
    const links = await provide(provider, 1)
    expect(links).toHaveLength(1)
    expect(links![0].text).toBe('/tmp/a.html')
    // path occupies display cols 3..13 (王=2 cols, then a space) → 1-based start x 4, end-exclusive x 14.
    expect(links![0].range).toEqual({ start: { x: 4, y: 1 }, end: { x: 14, y: 1 } })
  })

  it('maps ranges past an emoji (surrogate pair, 2 cols) correctly', async () => {
    // 😀 is one code point, TWO UTF-16 units, TWO display cols → a width-2 cell + a width-0 spacer.
    const cells: CellSpec[] = [{ chars: '😀', width: 2 }, { chars: '', width: 0 }, ...asciiCells(' /tmp/a.html')]
    const term = fakeTerminal([{ cells }])
    const provider = new FilePathLinkProvider(term, deps())
    const links = await provide(provider, 1)
    expect(links).toHaveLength(1)
    expect(links![0].text).toBe('/tmp/a.html')
    // 😀 cols 0-1, space col 2, path at display col 3 → start x 4, end-exclusive x 14.
    expect(links![0].range).toEqual({ start: { x: 4, y: 1 }, end: { x: 14, y: 1 } })
  })

  it('handles an early-wrapped wide char (unwritten last cell, glyph on the next row)', async () => {
    // At cols=10 a width-2 王 can't fit at col 9, so xterm leaves col 9 unwritten and moves 王 to the
    // next (wrapped) row. The path must reconstruct across that seam with no phantom space.
    const row0: CellSpec[] = [...asciiCells('/aaaaaaaa'), { chars: '', width: 1 }] // 9 written + 1 unwritten
    const row1: CellSpec[] = [{ chars: '王', width: 2 }, { chars: '', width: 0 }, ...asciiCells('x.md')]
    const term = fakeTerminal([{ cells: row0 }, { cells: row1, wrapped: true }], 10)
    const provider = new FilePathLinkProvider(term, deps({ pathExists: existsOnly('/aaaaaaaa王x.md') }))
    const links = await provide(provider, 2) // hover the wrapped row
    expect(links).toHaveLength(1)
    expect(links![0].text).toBe('/aaaaaaaa王x.md')
    // Spans cols 0..8 on row 1, then 王(0-1)/x(2)/.(3)/m(4)/d(5) on row 2 → end-exclusive x 6 on y 2.
    expect(links![0].range).toEqual({ start: { x: 1, y: 1 }, end: { x: 6, y: 2 } })
  })

  it('keeps a printed space at a soft-wrap seam (no token glue)', async () => {
    // Logical line "see /foo bar/baz" soft-wraps right after the printed trailing space.
    const term = fakeTerminal([
      { cells: asciiCells('see /foo ') }, //          9 cells, ends in a PRINTED space
      { cells: asciiCells('bar/baz'), wrapped: true },
    ], 9)
    const provider = new FilePathLinkProvider(term, deps({ pathExists: existsOnly('/foo', 'bar/baz') }))
    const texts = (await provide(provider, 1) ?? []).map((l) => l.text)
    expect(texts).toContain('/foo')
    expect(texts).toContain('bar/baz')
    expect(texts).not.toContain('/foobar/baz') // the space survived reconstruction → nothing glued
  })

  it('does not link a path that does not exist, and memoizes the check', async () => {
    const pathExists = vi.fn().mockResolvedValue([false])
    const term = fakeTerminal([{ cells: asciiCells('missing /tmp/gone.txt') }])
    const provider = new FilePathLinkProvider(term, deps({ pathExists }))
    expect(await provide(provider, 1)).toBeUndefined()
    await provide(provider, 1) // same line again
    expect(pathExists).toHaveBeenCalledTimes(1) // cached
  })

  it('opens only on a modifier + primary click', async () => {
    const openPath = vi.fn()
    const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
    const provider = new FilePathLinkProvider(term, deps({ openPath }))
    const [link] = (await provide(provider, 1))!
    link.activate({ button: 0, metaKey: true, ctrlKey: false } as MouseEvent, link.text)
    link.activate({ button: 0, metaKey: false, ctrlKey: false } as MouseEvent, link.text)
    expect(openPath).toHaveBeenCalledExactlyOnceWith('/tmp/a.html')
  })

  it('drives the shared hover hint, and hides it on open (#149 parity)', async () => {
    // xterm underlines a link and shows a pointer cursor whether or not the modifier is held, so
    // a path link needs the same "⌘click to open" affordance a URL link gets — otherwise a plain
    // click is a dead end with no feedback, and the two kinds of link behave differently.
    const hint = { show: vi.fn(), hide: vi.fn() }
    const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
    const provider = new FilePathLinkProvider(term, deps({ hint }))
    const [link] = (await provide(provider, 1))!

    const ev = { clientX: 5, clientY: 6 } as MouseEvent
    link.hover!(ev, link.text)
    expect(hint.show).toHaveBeenCalledWith(ev, '/tmp/a.html')
    link.leave!(ev, link.text)
    expect(hint.hide).toHaveBeenCalledTimes(1)

    // Opening hides it too: focus leaves for the opened app and xterm fires no `leave` for a
    // link the pointer never left, so the hint would otherwise stay on screen.
    link.activate({ button: 0, metaKey: true, ctrlKey: false } as MouseEvent, link.text)
    expect(hint.hide).toHaveBeenCalledTimes(2)
  })
})

describe('FilePathLinkProvider — Claude hard-wrap blocks (#154)', () => {
  // cols=40: the anchor fills exactly to the right edge, the path continues indented under the label.
  const COLS = 40
  const anchor = '● Read(/tmp/aa/family-controls-report-lo' //           40 cells, occupied to the edge
  const cont = '  nger-name.html)' //                                    indent 2 (content col), then the tail
  const FULL = '/tmp/aa/family-controls-report-longer-name.html'
  const hardWrap = () =>
    fakeTerminal([{ cells: asciiCells(anchor) }, { cells: asciiCells(cont) }], COLS)

  it('links the anchor row segment and opens the full reconstructed path', async () => {
    const openPath = vi.fn()
    const provider = new FilePathLinkProvider(hardWrap(), deps({ pathExists: existsOnly(FULL), openPath }))
    const links = await provide(provider, 1) // hover the "● Read(" row
    expect(links).toHaveLength(1)
    expect(links![0].text).toBe(FULL)
    // Underlines only the fragment on this row: "/tmp/aa/family-controls-report-lo" at cols 7..40.
    expect(links![0].range).toEqual({ start: { x: 8, y: 1 }, end: { x: 40, y: 1 } })
    links![0].activate({ button: 0, metaKey: true, ctrlKey: false } as MouseEvent, links![0].text)
    expect(openPath).toHaveBeenCalledExactlyOnceWith(FULL)
  })

  it('links the continuation row segment (indent excluded) to the full path', async () => {
    const provider = new FilePathLinkProvider(hardWrap(), deps({ pathExists: existsOnly(FULL) }))
    const links = await provide(provider, 2) // hover the "  nger-name.html)" row
    expect(links).toHaveLength(1)
    expect(links![0].text).toBe(FULL)
    // "nger-name.html" underlined (cols 2..16); the stripped 2-space indent and the ")" are excluded.
    expect(links![0].range).toEqual({ start: { x: 3, y: 2 }, end: { x: 16, y: 2 } })
  })

  it('does not link when the reconstructed full path does not exist', async () => {
    const provider = new FilePathLinkProvider(hardWrap(), deps({ pathExists: existsOnly('/nope') }))
    expect(await provide(provider, 1)).toBeUndefined()
    expect(await provide(provider, 2)).toBeUndefined()
  })

  it('requires the anchor to reach the wrap margin (unrelated indented line is not joined)', async () => {
    // The "● Read(" row is short (does not fill to cols), so the next col-2 line is NOT a continuation.
    const shortAnchor = '● Read(/tmp/aa/short-name.md' // occupied end well left of col 40
    const term = fakeTerminal([{ cells: asciiCells(shortAnchor) }, { cells: asciiCells('  other/thing.md') }], COLS)
    // Only the SHORT path exists — never the accidental concatenation.
    const provider = new FilePathLinkProvider(term, deps({ pathExists: existsOnly('/tmp/aa/short-name.md') }))
    const links = await provide(provider, 1)
    expect(links).toHaveLength(1)
    expect(links![0].text).toBe('/tmp/aa/short-name.md') // the real short path, not a glued one
  })

  it('does not join a continuation that starts with a Claude structural marker', async () => {
    const term = fakeTerminal([{ cells: asciiCells(anchor) }, { cells: asciiCells('  ⎿ Read 1 line') }], COLS)
    const provider = new FilePathLinkProvider(term, deps({ pathExists: existsOnly(FULL) }))
    // The `⎿` result line is not a continuation, so nothing is joined; the truncated anchor
    // fragment does not exist on its own → no link.
    expect(await provide(provider, 1)).toBeUndefined()
  })

  it('does not join outside a tool-call envelope (no bullet anchor)', async () => {
    // Same geometry but the first row is prose, not "● Label(...".
    const proseAnchor = 'wrote to /tmp/aa/family-controls-report-longerX' // 47 cells, fills a wider line
    const term = fakeTerminal([{ cells: asciiCells(proseAnchor) }, { cells: asciiCells('  nger-name.html)') }], 47)
    const provider = new FilePathLinkProvider(term, deps({ pathExists: existsOnly(FULL) }))
    // Falls back to plain handling: the anchor's own fragment path isn't FULL, so no link on row 1
    // from a join. (Row 1's own token is relative and unchecked-existing.)
    const links = await provide(provider, 1)
    expect(links ?? []).not.toContainEqual(expect.objectContaining({ text: FULL }))
  })

  it('links across three units including a middle row with no slash', async () => {
    const a = `● Read(/tmp/${'a'.repeat(28)}` //  40 cells, fills margin
    const b = `  ${'b'.repeat(38)}` //             40 cells, NO slash, fills margin
    const cc = '  cc.html)'
    const full = `/tmp/${'a'.repeat(28)}${'b'.repeat(38)}cc.html`
    const term = fakeTerminal([{ cells: asciiCells(a) }, { cells: asciiCells(b) }, { cells: asciiCells(cc) }], COLS)
    const provider = new FilePathLinkProvider(term, deps({ pathExists: existsOnly(full) }))
    const mid = await provide(provider, 2) // hover the slash-less middle row
    expect(mid).toHaveLength(1)
    expect(mid![0].text).toBe(full)
    expect(mid![0].range.start.y).toBe(2) // the underlined segment is on the middle row
  })

  it('accepts a one-cell margin gap but rejects a two-cell gap', async () => {
    const cont = { cells: asciiCells('  bb.html)') }
    const full = (n: number) => `/tmp/${'a'.repeat(n)}bb.html`
    // unused = 1 → still counts as wrapped.
    const t1 = fakeTerminal([{ cells: asciiCells(`● Read(/tmp/${'a'.repeat(27)}`) }, cont], COLS) // 39 cells
    const p1 = new FilePathLinkProvider(t1, deps({ pathExists: existsOnly(full(27)) }))
    expect(await provide(p1, 1)).toHaveLength(1)
    // unused = 2 → not a wrap; the continuation is not joined and the fragment doesn't exist.
    const t2 = fakeTerminal([{ cells: asciiCells(`● Read(/tmp/${'a'.repeat(26)}`) }, cont], COLS) // 38 cells
    const p2 = new FilePathLinkProvider(t2, deps({ pathExists: existsOnly(full(26)) }))
    expect(await provide(p2, 1)).toBeUndefined()
  })

  it('does not link an incidental path that starts in a continuation row', async () => {
    // ● Bash(cat /aaa…  wraps, then a space + an unrelated /inc on the continuation.
    const anchorB = `● Bash(cat /${'a'.repeat(18)}` // 30 cells, fills margin
    const payload = `/${'a'.repeat(21)}` //           anchor tail + the 3 leading a's of the continuation
    const term = fakeTerminal([{ cells: asciiCells(anchorB) }, { cells: asciiCells('  aaa /inc)') }], 30)
    const provider = new FilePathLinkProvider(term, deps({ pathExists: existsOnly(payload, '/inc') }))
    // Hover the continuation row, where BOTH the payload's tail and /inc render — so the boundary gate
    // (not a missing segment) is what rejects /inc.
    const texts = (await provide(provider, 2) ?? []).map((l) => l.text)
    expect(texts).toContain(payload)
    expect(texts).not.toContain('/inc') // begins in a continuation unit → not the wrapped payload
  })

  it('also links an unwrapped path sharing the anchor row (not just the wrapped payload)', async () => {
    // ● Read(/s.md, /aaa…  — the SECOND argument wraps, the first does not. The first crosses no
    // seam, so it is ordinary contiguous buffer text and must link like it would on any other
    // line: whether an unrelated argument happened to wrap must not decide its fate.
    const anchor = `● Read(/s.md, /${'a'.repeat(15)}` // 30 cells, fills the margin
    const payload = `/${'a'.repeat(18)}` //             anchor tail + the 3 a's on the continuation
    const term = fakeTerminal([{ cells: asciiCells(anchor) }, { cells: asciiCells('  aaa)') }], 30)
    const provider = new FilePathLinkProvider(term, deps({ pathExists: existsOnly(payload, '/s.md') }))

    const links = (await provide(provider, 1)) ?? []
    const texts = links.map((l) => l.text)
    expect(texts).toContain('/s.md') // unwrapped, entirely inside the anchor unit
    expect(texts).toContain(payload) // the wrapped payload, as before
    // ...and it is underlined at its own cells, not the payload's.
    const short = links.find((l) => l.text === '/s.md')!
    expect(short.range).toEqual({ start: { x: 8, y: 1 }, end: { x: 12, y: 1 } })
  })

  it('still links a payload that ends before a later greedily-admitted boundary (multi-token call)', async () => {
    // ● Bash(cat /a…  wraps; the continuation holds the /a tail, a space, then a SECOND path /b… that
    // itself wraps into a third unit. The first path (payload1) ends before the /b boundary but must
    // still link; the second path begins in a continuation and must not.
    const anchorB = `● Bash(cat /${'a'.repeat(18)}` //          30 cells
    const cont1 = `  aaa /${'b'.repeat(23)}` //                 30 cells, fills margin (payload2 head)
    const cont2 = '  bbb)'
    const payload1 = `/${'a'.repeat(21)}`
    const payload2 = `/${'b'.repeat(26)}`
    const term = fakeTerminal([{ cells: asciiCells(anchorB) }, { cells: asciiCells(cont1) }, { cells: asciiCells(cont2) }], 30)
    const provider = new FilePathLinkProvider(term, deps({ pathExists: existsOnly(payload1, payload2) }))
    // Hover cont1 (row 2), where payload1's tail AND payload2's head both render.
    const texts = (await provide(provider, 2) ?? []).map((l) => l.text)
    expect(texts).toContain(payload1) // ends before the 2nd boundary, but still the wrapped payload
    expect(texts).not.toContain(payload2) // starts in a continuation unit
  })

  it('reconstructs a soft-wrapped anchor that then hard-wraps (mixed soft/hard units)', async () => {
    const SMALL = 20
    const full = `/tmp/${'a'.repeat(8)}${'b'.repeat(20)}cc.html`
    const term = fakeTerminal([
      { cells: asciiCells(`● Read(/tmp/${'a'.repeat(8)}`) }, // 20 cells, soft-wraps
      { cells: asciiCells('b'.repeat(20)), wrapped: true }, //  20 cells, soft continuation (col 0)
      { cells: asciiCells('  cc.html)') }, //                   hard continuation, indent 2
    ], SMALL)
    const provider = new FilePathLinkProvider(term, deps({ pathExists: existsOnly(full) }))
    const links = await provide(provider, 3) // hover the hard-continuation row
    expect(links).toHaveLength(1)
    expect(links![0].text).toBe(full)
    expect(links![0].range.start.y).toBe(3)
  })

  it('treats a tab-expanded (blank-cell) indent as the hanging indent', async () => {
    const full = `/tmp/${'a'.repeat(28)}bb.html`
    // The continuation indent is two UNWRITTEN cells (as xterm stores an expanded tab), not spaces.
    const cont: CellSpec[] = [{ chars: '', width: 1 }, { chars: '', width: 1 }, ...asciiCells('bb.html)')]
    const term = fakeTerminal([{ cells: asciiCells(`● Read(/tmp/${'a'.repeat(28)}`) }, { cells: cont }], COLS)
    const provider = new FilePathLinkProvider(term, deps({ pathExists: existsOnly(full) }))
    const links = await provide(provider, 1)
    expect(links).toHaveLength(1)
    expect(links![0].text).toBe(full)
  })

  it('fails closed on a soft-wrap that exceeds the row cap', async () => {
    // A single path soft-wrapped across > MAX_SOFT_ROWS rows: reconstruction would be truncated, so no
    // link is offered rather than risking a bogus mid-path token.
    const rows: { cells: CellSpec[]; wrapped?: boolean }[] = [{ cells: asciiCells(`/tmp/${'a'.repeat(75)}`) }]
    for (let i = 0; i < 70; i++) rows.push({ cells: asciiCells('a'.repeat(80)), wrapped: true })
    const term = fakeTerminal(rows, 80)
    const provider = new FilePathLinkProvider(term, deps({ pathExists: vi.fn().mockResolvedValue([true]) }))
    expect(await provide(provider, 71)).toBeUndefined() // hover deep inside the overflow
  })

  it('rejects the reconstruction past the row cap (falls back to the plain fragment)', async () => {
    // 1 anchor + 9 margin-filling continuations would be > MAX_WRAP_ROWS (8) units → block rejected,
    // so it falls back to plain handling of the anchor row. With everything "existing", a correct cap
    // yields only the short anchor fragment; a broken cap would join into a giant path.
    const rows = [{ cells: asciiCells(anchor) }]
    for (let i = 0; i < 9; i++) rows.push({ cells: asciiCells(`  ${'a'.repeat(38)}`) }) // 40 cells, fills margin
    const term = fakeTerminal(rows, COLS)
    const provider = new FilePathLinkProvider(term, deps({ pathExists: vi.fn().mockResolvedValue([true]) }))
    const links = await provide(provider, 1)
    expect(links).toHaveLength(1)
    expect(links![0].text).toBe('/tmp/aa/family-controls-report-lo') // the plain fragment, not a join
  })
})

describe('FilePathLinkProvider — lifecycle', () => {
  it('a superseded request never calls its callback', async () => {
    let resolveA: (v: boolean[]) => void = () => {}
    const pathExists = vi
      .fn()
      .mockImplementationOnce(() => new Promise<boolean[]>((r) => { resolveA = r }))
      .mockResolvedValue([true])
    const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
    const provider = new FilePathLinkProvider(term, deps({ pathExists }))

    const cbA = vi.fn()
    provider.provideLinks(1, cbA) // request A — pathExists pends
    await provide(provider, 1) // request B supersedes and resolves
    resolveA([true]) // A's IPC now resolves, late
    await Promise.resolve()
    expect(cbA).not.toHaveBeenCalled()
  })

  it('dispose while pending suppresses the callback', async () => {
    let resolve: (v: boolean[]) => void = () => {}
    const pathExists = vi.fn().mockImplementation(() => new Promise<boolean[]>((r) => { resolve = r }))
    const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
    const provider = new FilePathLinkProvider(term, deps({ pathExists }))
    const cb = vi.fn()
    provider.provideLinks(1, cb)
    provider.dispose()
    resolve([true])
    await Promise.resolve()
    expect(cb).not.toHaveBeenCalled()
  })

  it('an IPC rejection completes the current request with no links', async () => {
    const pathExists = vi.fn().mockRejectedValue(new Error('ipc down'))
    const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
    const provider = new FilePathLinkProvider(term, deps({ pathExists }))
    expect(await provide(provider, 1)).toBeUndefined()
  })

  it('buffer output while pending invalidates the request (no stale link) but keeps its result', async () => {
    let resolveA: (v: boolean[]) => void = () => {}
    const pathExists = vi
      .fn()
      .mockImplementationOnce(() => new Promise<boolean[]>((r) => { resolveA = r }))
      .mockResolvedValue([true])
    const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
    const provider = new FilePathLinkProvider(term, deps({ pathExists }))
    const cbA = vi.fn()
    provider.provideLinks(1, cbA)
    term.fireWrite() // buffer changed under a stationary pointer → epoch bumped, A is stale
    resolveA([true])
    // Drain the microtask queue: the result travels through Promise.all before reaching the
    // handler that writes the cache, so a single tick is not enough.
    await new Promise((r) => setTimeout(r, 0))
    expect(cbA).not.toHaveBeenCalled() // a stale callback would clobber xterm's reply map

    // ...but the existence answer IS kept: it is a fact about the filesystem, not about the
    // hover that asked. Without this, an agent writing several times a second supersedes every
    // probe before it returns, the cache never warms, and paths stay un-clickable while it runs.
    expect(await provide(provider, 1)).toHaveLength(1)
    expect(pathExists).toHaveBeenCalledTimes(1)
  })

  it('does not cache a declined probe (null), so the next hover asks again', async () => {
    // main returns null when it declines to probe under load — that is "didn't look", not
    // "absent", and must not be negative-cached into a missing link for a whole TTL.
    const pathExists = vi
      .fn()
      .mockResolvedValueOnce([null])
      .mockResolvedValueOnce([true])
    const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
    const provider = new FilePathLinkProvider(term, deps({ pathExists }))

    expect(await provide(provider, 1)).toBeUndefined() // declined → no link this time
    expect(await provide(provider, 1)).toHaveLength(1) // re-probed, not read from cache
    expect(pathExists).toHaveBeenCalledTimes(2)
  })

  it('caps the number of distinct paths probed per hover', async () => {
    const pathExists = vi.fn().mockImplementation((paths: string[]) => Promise.resolve(paths.map(() => true)))
    const line = Array.from({ length: 140 }, (_, i) => `/p${i}/f.md`).join(' ')
    const term = fakeTerminal([{ cells: asciiCells(line) }])
    const provider = new FilePathLinkProvider(term, deps({ pathExists }))
    await provide(provider, 1)
    const probed = pathExists.mock.calls.reduce((n: number, call) => n + (call[0] as string[]).length, 0)
    expect(probed).toBe(128) // MAX_PROBES_PER_HOVER, not all 140 candidates
  })

  it('dispose unsubscribes from the terminal events', () => {
    const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
    const provider = new FilePathLinkProvider(term, deps())
    expect(term.activeSubs()).toBe(2) // onWriteParsed + onResize
    provider.dispose()
    expect(term.activeSubs()).toBe(0)
  })

  it('chunks a large candidate set into ≤64-path batches (past-cap paths are not misread)', async () => {
    const pathExists = vi.fn().mockImplementation((paths: string[]) => Promise.resolve(paths.map(() => true)))
    const line = Array.from({ length: 65 }, (_, i) => `/p${i}/f.md`).join(' ')
    const term = fakeTerminal([{ cells: asciiCells(line) }])
    const provider = new FilePathLinkProvider(term, deps({ pathExists }))
    const links = await provide(provider, 1)
    expect(links).toHaveLength(65)
    expect(pathExists).toHaveBeenCalledTimes(2)
    expect(pathExists.mock.calls[0][0]).toHaveLength(64)
    expect(pathExists.mock.calls[1][0]).toHaveLength(1)
  })

  it('a resize invalidates an in-flight request', async () => {
    let resolveA: (v: boolean[]) => void = () => {}
    const pathExists = vi.fn().mockImplementationOnce(() => new Promise<boolean[]>((r) => { resolveA = r }))
    const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
    const provider = new FilePathLinkProvider(term, deps({ pathExists }))
    const cb = vi.fn()
    provider.provideLinks(1, cb)
    term.fireResize() // reflow moves every cell — the ranges computed for A no longer describe the buffer
    resolveA([true])
    await new Promise((r) => setTimeout(r, 0))
    expect(cb).not.toHaveBeenCalled()
  })

  it('returns no links for a row that is not in the buffer', async () => {
    const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
    const provider = new FilePathLinkProvider(term, deps())
    expect(await provide(provider, 99)).toBeUndefined()
  })

  it('returns no links when the line holds no path-shaped token', async () => {
    const pathExists = vi.fn()
    const term = fakeTerminal([{ cells: asciiCells('just some prose here') }])
    const provider = new FilePathLinkProvider(term, deps({ pathExists }))
    expect(await provide(provider, 1)).toBeUndefined()
    expect(pathExists).not.toHaveBeenCalled() // nothing detected → no IPC at all
  })
})

describe('FilePathLinkProvider — existence cache', () => {
  it('re-probes after the negative TTL expires, but serves a positive from cache', async () => {
    vi.useFakeTimers()
    try {
      const pathExists = vi.fn().mockResolvedValueOnce([false]).mockResolvedValue([true])
      const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
      const provider = new FilePathLinkProvider(term, deps({ pathExists }))

      expect(await provide(provider, 1)).toBeUndefined() // absent
      vi.setSystemTime(Date.now() + 2_500) // past the 2s negative TTL — a file may have appeared
      expect(await provide(provider, 1)).toHaveLength(1)
      expect(pathExists).toHaveBeenCalledTimes(2)

      vi.setSystemTime(Date.now() + 5_000) // still inside the 10s positive TTL
      expect(await provide(provider, 1)).toHaveLength(1)
      expect(pathExists).toHaveBeenCalledTimes(2) // served from cache, no third probe
    } finally {
      vi.useRealTimers()
    }
  })

  it('evicts old entries once the cache is full', async () => {
    // 600 distinct paths over two hovers exceeds CACHE_MAX (500), so the earliest must be dropped
    // rather than the map growing without bound for the life of the terminal.
    const pathExists = vi.fn((paths: string[]) => Promise.resolve(paths.map(() => true)))
    const rows = (from: number, to: number) =>
      Array.from({ length: to - from }, (_, i) => `/p${from + i}/f.md`).join(' ')
    const term = fakeTerminal([{ cells: asciiCells(rows(0, 100)) }, { cells: asciiCells(rows(100, 200)) }])
    const provider = new FilePathLinkProvider(term, deps({ pathExists }))

    await provide(provider, 1)
    await provide(provider, 2)
    pathExists.mockClear()
    await provide(provider, 1) // row 1's paths are still cached (well under CACHE_MAX)
    expect(pathExists).not.toHaveBeenCalled()
  })
})

describe('registerFilePathLinks', () => {
  it('wires the provider to window.shell and disposes both halves', async () => {
    const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
    const dispose = vi.fn()
    const registerLinkProvider = vi.fn((_provider: unknown) => ({ dispose }))
    ;(term as unknown as { registerLinkProvider: unknown }).registerLinkProvider = registerLinkProvider
    vi.mocked(window.shell.pathExists).mockResolvedValue([true])
    vi.mocked(window.shell.openPath).mockResolvedValue({ action: 'opened' })

    const reg = registerFilePathLinks(term, '/repo')
    const provider = registerLinkProvider.mock.calls[0][0] as FilePathLinkProvider
    const [link] = (await provide(provider, 1))!

    // baseCwd is forwarded on both calls — main resolves relative paths against it.
    expect(window.shell.pathExists).toHaveBeenCalledWith(['/tmp/a.html'], '/repo')
    // Both modifiers set: `isMac` is resolved from the real environment here, and the gate reads
    // metaKey on macOS but ctrlKey elsewhere.
    link.activate({ button: 0, metaKey: true, ctrlKey: true } as MouseEvent, link.text)
    expect(window.shell.openPath).toHaveBeenCalledWith('/tmp/a.html', '/repo')

    reg.dispose()
    expect(dispose).toHaveBeenCalled() // the xterm registration...
    expect(term.activeSubs()).toBe(0) // ...and the provider's own subscriptions
  })

  it('logs an open failure rather than leaving an unhandled rejection', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
      ;(term as unknown as { registerLinkProvider: unknown }).registerLinkProvider = vi.fn((_provider: unknown) => ({ dispose: vi.fn() }))
      vi.mocked(window.shell.pathExists).mockResolvedValue([true])
      vi.mocked(window.shell.openPath).mockResolvedValue({ action: 'failed', error: 'No application set' })

      const registerLinkProvider = (term as unknown as { registerLinkProvider: ReturnType<typeof vi.fn> }).registerLinkProvider
      registerFilePathLinks(term, '/repo')
      const provider = registerLinkProvider.mock.calls[0][0] as FilePathLinkProvider
      const [link] = (await provide(provider, 1))!
      link.activate({ button: 0, metaKey: true, ctrlKey: true } as MouseEvent, link.text)
      await new Promise((r) => setTimeout(r, 0))
      expect(err).toHaveBeenCalledWith('[terminal] failed to open path', 'No application set')
    } finally {
      err.mockRestore()
    }
  })
})
