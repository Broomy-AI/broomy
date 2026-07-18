import { describe, it, expect, vi } from 'vitest'
import type { Terminal, ILink } from '@xterm/xterm'
import { detectPathCandidates, FilePathLinkProvider, type FilePathLinkDeps } from './terminalPathLinkProvider'

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

// --- Faithful fake xterm buffer (ASCII 1-width cells, plus explicit wide cells) ---

interface CellSpec { chars: string; width: number }
class FakeCell {
  chars = ''
  width = 1
  getChars(): string { return this.chars }
  getWidth(): number { return this.width }
  set(c: string, w: number): void { this.chars = c; this.width = w }
}
const asciiCells = (text: string): CellSpec[] => Array.from(text, (ch) => ({ chars: ch, width: 1 }))

function fakeLine(cells: CellSpec[], wrapped = false) {
  return {
    isWrapped: wrapped,
    length: cells.length,
    translateToString: () => cells.map((c) => c.chars).join(''),
    getCell: (i: number, cell: FakeCell) => { const c = cells[i]; cell.set(c ? c.chars : '', c ? c.width : 1) },
  }
}

function fakeTerminal(rows: { cells: CellSpec[]; wrapped?: boolean }[]) {
  const lines = rows.map((r) => fakeLine(r.cells, r.wrapped))
  const writeCbs = new Set<() => void>()
  const resizeCbs = new Set<() => void>()
  const term = {
    buffer: { active: { getLine: (i: number) => lines[i], getNullCell: () => new FakeCell() } },
    onWriteParsed: (cb: () => void) => { writeCbs.add(cb); return { dispose: () => writeCbs.delete(cb) } },
    onResize: (cb: () => void) => { resizeCbs.add(cb); return { dispose: () => resizeCbs.delete(cb) } },
    fireWrite: () => writeCbs.forEach((cb) => cb()),
    activeSubs: () => writeCbs.size + resizeCbs.size,
  }
  return term as unknown as Terminal & { fireWrite: () => void; activeSubs: () => number }
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

describe('FilePathLinkProvider', () => {
  it('links a single-row existing path with the correct range', async () => {
    const term = fakeTerminal([{ cells: asciiCells('open /tmp/a.html done') }])
    const provider = new FilePathLinkProvider(term, deps())
    const links = await provide(provider, 1)
    expect(links).toHaveLength(1)
    expect(links![0].text).toBe('/tmp/a.html')
    // "/tmp/a.html" is 11 chars starting at string index 5 → 1-based columns 6..16.
    expect(links![0].range).toEqual({ start: { x: 6, y: 1 }, end: { x: 16, y: 1 } })
  })

  it('links a soft-wrapped path from a continuation row', async () => {
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

  it('lifecycle: a superseded request never calls its callback', async () => {
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

  it('lifecycle: dispose while pending suppresses the callback', async () => {
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

  it('lifecycle: an IPC rejection completes the current request with no links', async () => {
    const pathExists = vi.fn().mockRejectedValue(new Error('ipc down'))
    const term = fakeTerminal([{ cells: asciiCells('/tmp/a.html') }])
    const provider = new FilePathLinkProvider(term, deps({ pathExists }))
    expect(await provide(provider, 1)).toBeUndefined()
  })

  it('lifecycle: buffer output while pending invalidates the request (no stale link, no stale cache)', async () => {
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
    await Promise.resolve()
    expect(cbA).not.toHaveBeenCalled()
    // A must NOT have cached its result — the next hover re-probes (2nd pathExists call).
    expect(await provide(provider, 1)).toHaveLength(1)
    expect(pathExists).toHaveBeenCalledTimes(2)
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
})
