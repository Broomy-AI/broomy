// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { Terminal } from '@xterm/xterm'
import { createTerminalLinkHandlers } from './terminalLinkHandler'

/**
 * Integration guard for the OSC 8 file-link path (#164). Claude Code emits `[file]`/`[image]` chips as
 * OSC 8 `file://` hyperlinks; xterm attaches the link to the CELLS, so it survives a hard-wrap `\r\n`
 * (the wrap the old text-detector couldn't link), and calls the terminal's `linkHandler.activate` when
 * a covered cell on ANY row is clicked.
 *
 * xterm exposes no public API for per-cell hyperlinks, and jsdom can't hit-test rendered cells, so this
 * drives a REAL `Terminal`, then reads xterm's INTERNAL buffer + OSC link service (private — treated as
 * a test-only coupling) to prove the wrap-immunity directly, and exercises our handler for the click →
 * openPath behaviour and the gates.
 */
type XtermInternals = {
  _core: {
    _bufferService: {
      buffer: { lines: { get(y: number): { _extendedAttrs?: Record<number, { urlId?: number } | undefined> } | undefined } }
    }
    _oscLinkService: { getLinkData(id: number): { uri?: string } | undefined }
  }
}

const OSC = '\x1b]8;;'
const ST = '\x1b\\'
const FILE = 'file:///Users/x/very/long/quiz-layout.png'
const mod = { button: 0, metaKey: true, ctrlKey: true } as MouseEvent // both modifiers → platform-independent
const write = (term: Terminal, data: string) => new Promise<void>((resolve) => term.write(data, resolve))

function makeTerminal(allowFileUris = true) {
  const openPath = vi.fn()
  const openExternal = vi.fn()
  const handlers = createTerminalLinkHandlers({ isMac: true, openExternal, openPath, allowFileUris })
  const term = new Terminal({ cols: 40, rows: 10, linkHandler: handlers.linkHandler, allowProposedApi: true })
  return { term, handlers, openPath, openExternal }
}

/** The distinct OSC 8 link ids attached to the cells of buffer row `y`. */
function urlIdsOnRow(term: Terminal, y: number): number[] {
  const line = (term as unknown as XtermInternals)._core._bufferService.buffer.lines.get(y)
  const ext = line?._extendedAttrs
  const ids = new Set<number>()
  if (ext) for (let x = 0; x < term.cols; x++) { const id = ext[x]?.urlId; if (id) ids.add(id) }
  return [...ids]
}
const linkUri = (term: Terminal, id: number): string | undefined =>
  (term as unknown as XtermInternals)._core._oscLinkService.getLinkData(id)?.uri

describe('OSC 8 file link (integration)', () => {
  it('keeps ONE file:// hyperlink across a hard-wrap, and opens the decoded path on activate', async () => {
    const { term, handlers, openPath } = makeTerminal(true)
    // A chip whose visible text hard-wraps (a real \r\n + hanging indent) INSIDE one OSC 8 hyperlink.
    await write(term, `${OSC}${FILE}${ST}[image]/Users/x/very/long/qu\r\n    iz-layout.png (495.3KB)${OSC}${ST}`)

    // The chip's visible text landed across two buffer rows...
    expect(term.buffer.active.getLine(0)?.translateToString(true)).toContain('[image]')
    expect(term.buffer.active.getLine(1)?.translateToString(true)).toContain('iz-layout.png')
    // ...and BOTH rows carry the SAME OSC 8 link id pointing at our file:// URI — the link rode the wrap.
    const [anchorId] = urlIdsOnRow(term, 0)
    const [continuationId] = urlIdsOnRow(term, 1)
    expect(anchorId).toBeGreaterThan(0)
    expect(continuationId).toBe(anchorId)
    expect(linkUri(term, anchorId)).toBe(FILE)

    // xterm invokes linkHandler.activate with that URI when a covered cell (either row) is clicked.
    handlers.linkHandler.activate(mod, FILE)
    expect(openPath).toHaveBeenCalledExactlyOnceWith('/Users/x/very/long/quiz-layout.png')

    term.dispose()
  })

  it('does not open without the modifier, ignores an unsupported scheme, and refuses file:// when isolated', () => {
    const host = makeTerminal(true)
    host.handlers.linkHandler.activate({ button: 0, metaKey: false, ctrlKey: false } as MouseEvent, FILE)
    host.handlers.linkHandler.activate(mod, 'javascript:alert(1)')
    expect(host.openPath).not.toHaveBeenCalled()
    host.term.dispose()

    const isolated = makeTerminal(false)
    expect(isolated.handlers.linkHandler.allowNonHttpProtocols).toBe(false)
    isolated.handlers.linkHandler.activate(mod, FILE)
    expect(isolated.openPath).not.toHaveBeenCalled()
    isolated.term.dispose()
  })
})
