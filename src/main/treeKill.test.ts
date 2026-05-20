import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
  execFile: vi.fn((_cmd, _args, _opts, cb: () => void) => { cb() }),
}))

vi.mock('./platform', () => ({ isWindows: false }))

import { execFileSync } from 'child_process'
import { parsePsSnapshot, collectDescendants, treeKill } from './treeKill'

const T_A = 'Mon Jan  1 00:00:01 2024'
const T_B = 'Mon Jan  1 00:00:02 2024'
const T_RECYCLED = 'Mon Jan  1 09:00:00 2024'

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
    // Default: ps for the descendant snapshot. Tests that need lstart= override
    // execFileSync to return the right output for whichever args ps gets called
    // with.
    vi.mocked(execFileSync).mockReturnValue(
      '  100  1  100\n  200  100  100\n  300  200  100\n  400  1  100\n'
    )
  })

  afterEach(() => {
    killSpy.mockRestore()
    vi.clearAllMocks()
  })

  /** Drive both `ps -axo pid=,ppid=,pgid=` and `ps -axo pid=,lstart=` from a single setup. */
  function setupPsResponses(opts: {
    tree?: string
    /** Map of pid -> lstart string to return for the identity probe. */
    identities?: Record<number, string>
  } = {}) {
    const tree = opts.tree ?? ''
    const identities = opts.identities ?? {}
    vi.mocked(execFileSync).mockImplementation((_cmd: string, args?: readonly string[]) => {
      const fmt = args?.[1] ?? ''
      if (fmt.includes('lstart')) {
        const lines = Object.entries(identities).map(([pid, lstart]) => `  ${pid}  ${lstart}`)
        return `${lines.join('\n')}\n`
      }
      return tree
    })
  }

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

  it('unions extraPids into the kill set when their startTime still matches', async () => {
    setupPsResponses({
      tree: '  100  1  100\n  200  100  100\n',
      identities: { 999: T_A, 888: T_B },
    })
    await treeKill(100, 0, [
      { pid: 999, startTime: T_A },
      { pid: 888, startTime: T_B },
    ])
    const terms = killed.filter((k) => k.signal === 'SIGTERM').map((k) => k.pid).sort((a, b) => a - b)
    expect(terms).toEqual([100, 200, 888, 999])
  })

  it('skips an extraPid whose startTime no longer matches (PID reuse)', async () => {
    setupPsResponses({
      tree: '  100  1  100\n  200  100  100\n',
      // PID 999 was tracked with T_A but is now T_RECYCLED — the kernel has
      // reassigned it to a different process. Must not be killed.
      identities: { 999: T_RECYCLED, 888: T_B },
    })
    await treeKill(100, 0, [
      { pid: 999, startTime: T_A },
      { pid: 888, startTime: T_B },
    ])
    const terms = killed.filter((k) => k.signal === 'SIGTERM').map((k) => k.pid).sort((a, b) => a - b)
    expect(terms).toEqual([100, 200, 888])
    expect(terms).not.toContain(999)
  })

  it('skips an extraPid whose startTime was never observed', async () => {
    setupPsResponses({
      tree: '  100  1  100\n  200  100  100\n',
      identities: { 999: T_A },
    })
    await treeKill(100, 0, [
      { pid: 999, startTime: '' }, // never recorded a startTime; cannot verify
    ])
    const terms = killed.filter((k) => k.signal === 'SIGTERM').map((k) => k.pid).sort((a, b) => a - b)
    expect(terms).toEqual([100, 200])
  })

  it('skips an extraPid that is no longer alive', async () => {
    setupPsResponses({
      tree: '  100  1  100\n',
      identities: {}, // PID 999 not present
    })
    await treeKill(100, 0, [
      { pid: 999, startTime: T_A },
    ])
    const terms = killed.filter((k) => k.signal === 'SIGTERM').map((k) => k.pid).sort((a, b) => a - b)
    expect(terms).toEqual([100])
  })

  it('still kills extraPids when root is invalid (shell already gone)', async () => {
    setupPsResponses({
      tree: '',
      identities: { 123: T_A, 456: T_B },
    })
    await treeKill(NaN, 0, [
      { pid: 123, startTime: T_A },
      { pid: 456, startTime: T_B },
    ])
    const terms = killed.filter((k) => k.signal === 'SIGTERM').map((k) => k.pid).sort((a, b) => a - b)
    expect(terms).toEqual([123, 456])
  })

  it('ignores invalid extraPids (<=1) silently', async () => {
    setupPsResponses({
      tree: '',
      identities: { 100: T_A },
    })
    await treeKill(NaN, 0, [
      { pid: 0, startTime: T_A },
      { pid: 1, startTime: T_A },
      { pid: -5, startTime: T_A },
      { pid: 100, startTime: T_A },
    ])
    const terms = killed.filter((k) => k.signal === 'SIGTERM').map((k) => k.pid)
    expect(terms).toEqual([100])
  })

  it('deduplicates pid that appears in both descendants and extraPids', async () => {
    setupPsResponses({
      tree: '  100  1  100\n  200  100  100\n',
      identities: { 200: T_A, 300: T_B },
    })
    await treeKill(100, 0, [
      { pid: 200, startTime: T_A },
      { pid: 300, startTime: T_B },
    ])
    const terms = killed.filter((k) => k.signal === 'SIGTERM').map((k) => k.pid).sort((a, b) => a - b)
    expect(terms).toEqual([100, 200, 300])
  })
})
