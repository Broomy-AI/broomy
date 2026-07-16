import { describe, it, expect, vi, afterEach } from 'vitest'
import { extractDroppedPaths, formatPathsForShell } from './droppedFilePaths'
import { FILE_PATH_MIME } from '../../../../shared/dnd'

/** Minimal DataTransfer stand-in. */
function dt(init: { files?: { path: string }[]; mime?: Record<string, string> }): DataTransfer {
  return {
    files: init.files ?? [],
    getData: (t: string) => init.mime?.[t] ?? '',
  } as unknown as DataTransfer
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('extractDroppedPaths', () => {
  it('extracts OS file paths (multiple), preferring them over the MIME', () => {
    const transfer = dt({
      files: [{ path: '/a/one.txt' }, { path: '/b/two.txt' }],
      mime: { [FILE_PATH_MIME]: '/ignored.txt' },
    })
    expect(extractDroppedPaths(transfer)).toEqual(['/a/one.txt', '/b/two.txt'])
  })

  it('falls back to a single FILE_PATH_MIME path when there are no OS files', () => {
    expect(extractDroppedPaths(dt({ mime: { [FILE_PATH_MIME]: '/x/y.ts' } }))).toEqual(['/x/y.ts'])
  })

  it('does not newline-split the MIME value (filenames may contain \\n... but control chars are dropped)', () => {
    // A path with an embedded newline is a control-char path → dropped entirely.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(extractDroppedPaths(dt({ mime: { [FILE_PATH_MIME]: '/a/b\nc' } }))).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('drops paths containing control characters (ESC) and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const transfer = dt({ files: [{ path: '/ok.txt' }, { path: '/bad\x1b[31m.txt' }] })
    expect(extractDroppedPaths(transfer)).toEqual(['/ok.txt'])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('drops paths containing C1 controls (U+009B CSI) that xterm could interpret', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // U+009B is the C1 CSI introducer; a filename could smuggle it past a C0-only filter.
    const transfer = dt({ files: [{ path: '/ok.txt' }, { path: '/spoof\u009b2J.txt' }] })
    expect(extractDroppedPaths(transfer)).toEqual(['/ok.txt'])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('returns empty when nothing was dropped', () => {
    expect(extractDroppedPaths(dt({}))).toEqual([])
  })
})

describe('formatPathsForShell', () => {
  it('quotes per shell, space-joins, and adds a trailing space', () => {
    expect(formatPathsForShell(['/a/b c.txt'], 'posix')).toBe("'/a/b c.txt' ")
    expect(formatPathsForShell(['/a/one', '/b/two'], 'posix')).toBe('/a/one /b/two ')
    expect(formatPathsForShell(['C:\\a\\b c.txt'], 'cmd')).toBe('"C:\\a\\b c.txt" ')
  })

  it('skips cmd paths that cannot be safely encoded', () => {
    expect(formatPathsForShell(['C:\\ok.txt', 'C:\\%TEMP%.txt'], 'cmd')).toBe('"C:\\ok.txt" ')
  })

  it('returns an empty string when nothing survives (all cmd paths rejected)', () => {
    expect(formatPathsForShell(['C:\\%A%', 'C:\\b!c'], 'cmd')).toBe('')
  })

  it('returns an empty string for no paths', () => {
    expect(formatPathsForShell([], 'posix')).toBe('')
  })
})
