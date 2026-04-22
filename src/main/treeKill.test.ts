import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
  execFile: vi.fn((_cmd, _args, _opts, cb: () => void) => { cb() }),
}))

vi.mock('./platform', () => ({ isWindows: false }))

import { execFileSync } from 'child_process'
import { parsePsSnapshot, collectDescendants, treeKill } from './treeKill'

describe('parsePsSnapshot', () => {
  it('parses well-formed lines and ignores junk', () => {
    const out = '  100  1  100\n  200  100  100\nnot a row\n  300  200  300\n'
    expect(parsePsSnapshot(out)).toEqual([
      { pid: 100, ppid: 1, pgid: 100 },
      { pid: 200, ppid: 100, pgid: 100 },
      { pid: 300, ppid: 200, pgid: 300 },
    ])
  })
})

describe('collectDescendants', () => {
  const snapshot = [
    { pid: 100, ppid: 1, pgid: 100 },     // shell
    { pid: 200, ppid: 100, pgid: 100 },   // direct child
    { pid: 300, ppid: 200, pgid: 100 },   // grandchild, still in shell's group
    { pid: 400, ppid: 1, pgid: 100 },     // orphaned to init but in shell's group (the firebase case)
    { pid: 500, ppid: 200, pgid: 500 },   // grandchild that called setsid
    { pid: 999, ppid: 1, pgid: 999 },     // unrelated process
  ]

  it('walks the parent-pid tree from the root', () => {
    const result = collectDescendants(snapshot, 100)
    expect(result.has(100)).toBe(true)
    expect(result.has(200)).toBe(true)
    expect(result.has(300)).toBe(true)
    expect(result.has(500)).toBe(true)
  })

  it('includes processes orphaned to init that share the root PGID', () => {
    const result = collectDescendants(snapshot, 100)
    expect(result.has(400)).toBe(true)
  })

  it('excludes unrelated processes', () => {
    const result = collectDescendants(snapshot, 100)
    expect(result.has(999)).toBe(false)
  })

  it('returns just the root when there are no descendants', () => {
    expect(collectDescendants([], 42)).toEqual(new Set([42]))
  })
})

describe('treeKill', () => {
  let killSpy: ReturnType<typeof vi.spyOn>
  const killed: { pid: number; signal: string | number }[] = []

  beforeEach(() => {
    killed.length = 0
    killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: string | number) => {
      killed.push({ pid, signal: signal ?? 'SIGTERM' })
      return true
    })
    vi.mocked(execFileSync).mockReturnValue(
      '  100  1  100\n  200  100  100\n  300  200  100\n  400  1  100\n'
    )
  })

  afterEach(() => {
    killSpy.mockRestore()
    vi.clearAllMocks()
  })

  it('SIGTERMs all descendants then SIGKILLs survivors', async () => {
    await treeKill(100, 0)
    const terms = killed.filter((k) => k.signal === 'SIGTERM').map((k) => k.pid).sort()
    expect(terms).toEqual([100, 200, 300, 400])
    const kills = killed.filter((k) => k.signal === 'SIGKILL').map((k) => k.pid).sort()
    expect(kills).toEqual([100, 200, 300, 400])
  })

  it('does not SIGKILL processes that already exited', async () => {
    killSpy.mockRestore()
    const exited = new Set([200, 300])
    killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: string | number) => {
      killed.push({ pid, signal: signal ?? 'SIGTERM' })
      if (signal === 0 && exited.has(pid)) throw new Error('ESRCH')
      return true
    })
    await treeKill(100, 0)
    const kills = killed.filter((k) => k.signal === 'SIGKILL').map((k) => k.pid).sort()
    expect(kills).toEqual([100, 400])
  })

  it('refuses to signal init or invalid PIDs', async () => {
    await treeKill(0)
    await treeKill(1)
    await treeKill(NaN)
    expect(killed).toEqual([])
  })

  it('swallows errors from individual kill calls', async () => {
    killSpy.mockRestore()
    killSpy = vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('EPERM') })
    await expect(treeKill(100, 0)).resolves.toBeUndefined()
  })
})
