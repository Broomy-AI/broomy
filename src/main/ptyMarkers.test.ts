import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return { ...actual, homedir: () => join(actual.tmpdir(), 'broomy-pid-markers-test', 'home') }
})

interface TreeKillCall {
  pid: number
  extras: { pid: number; startTime: string }[]
}
const treeKillCalls: TreeKillCall[] = []
vi.mock('./treeKill', () => ({
  treeKill: async (
    pid: number,
    _graceMs?: number,
    extraPids?: Iterable<{ pid: number; startTime: string }>,
  ) => {
    treeKillCalls.push({
      pid,
      extras: extraPids ? [...extraPids].map((e) => ({ ...e })) : [],
    })
  },
}))

import { recordPtyMarker, removePtyMarker, clearOwnMarkers, sweepOrphanedPtys, parseMarker, MARKERS_ROOT } from './ptyMarkers'

const fakeRoot = join(tmpdir(), 'broomy-pid-markers-test')

const T_A = 'Mon Jan  1 00:00:01 2024'
const T_B = 'Mon Jan  1 00:00:02 2024'
const T_C = 'Mon Jan  1 00:00:03 2024'

beforeEach(() => {
  treeKillCalls.length = 0
  rmSync(fakeRoot, { recursive: true, force: true })
  mkdirSync(MARKERS_ROOT, { recursive: true })
})

afterEach(() => {
  rmSync(fakeRoot, { recursive: true, force: true })
})

describe('recordPtyMarker / removePtyMarker', () => {
  it('writes a file under <markers-root>/<main-pid>/<encoded-id>', () => {
    recordPtyMarker('session-1', 4242)
    const dir = join(MARKERS_ROOT, String(process.pid))
    expect(readdirSync(dir)).toEqual(['session-1'])
  })

  it('encodes ids that contain path separators', () => {
    recordPtyMarker('weird/id', 99)
    const dir = join(MARKERS_ROOT, String(process.pid))
    expect(readdirSync(dir)).toEqual([encodeURIComponent('weird/id')])
  })

  it('removePtyMarker is a no-op for missing files', () => {
    expect(() => removePtyMarker('never-existed')).not.toThrow()
  })

  it('clearOwnMarkers wipes only this process\'s directory', () => {
    recordPtyMarker('a', 1)
    mkdirSync(join(MARKERS_ROOT, '999999'), { recursive: true })
    clearOwnMarkers()
    expect(existsSync(join(MARKERS_ROOT, String(process.pid)))).toBe(false)
    expect(existsSync(join(MARKERS_ROOT, '999999'))).toBe(true)
  })
})

describe('sweepOrphanedPtys', () => {
  it('returns 0 when the markers root is missing', async () => {
    rmSync(MARKERS_ROOT, { recursive: true, force: true })
    expect(await sweepOrphanedPtys()).toBe(0)
  })

  it('skips the current process\'s own directory', async () => {
    recordPtyMarker('mine', 12345)
    expect(await sweepOrphanedPtys()).toBe(0)
    expect(treeKillCalls).toEqual([])
    expect(existsSync(join(MARKERS_ROOT, String(process.pid)))).toBe(true)
  })

  it('skips directories whose owner main-pid is still alive', async () => {
    const liveDir = join(MARKERS_ROOT, String(process.ppid))
    mkdirSync(liveDir, { recursive: true })
    writeFileSync(join(liveDir, 'pty-1'), '777', 'utf-8')
    expect(await sweepOrphanedPtys()).toBe(0)
    expect(existsSync(liveDir)).toBe(true)
  })

  it('tree-kills shell PIDs in dead-owner directories (legacy plain-PID format)', async () => {
    const deadOwnerDir = join(MARKERS_ROOT, '999999')
    mkdirSync(deadOwnerDir, { recursive: true })
    writeFileSync(join(deadOwnerDir, 'pty-a'), '111', 'utf-8')
    writeFileSync(join(deadOwnerDir, 'pty-b'), '222', 'utf-8')
    const swept = await sweepOrphanedPtys()
    expect(swept).toBe(2)
    // Legacy plain-PID markers have no startTime, so the shell isn't added to
    // extras — but the sweep still records the call. shellPid is NaN as a
    // signal to treeKill to skip the live-tree walk.
    expect(treeKillCalls).toHaveLength(2)
    for (const call of treeKillCalls) expect(call.extras).toEqual([])
    expect(existsSync(deadOwnerDir)).toBe(false)
  })

  it('passes verified descendants and shell into treeKill so detached daemons get reaped', async () => {
    const deadOwnerDir = join(MARKERS_ROOT, '999998')
    mkdirSync(deadOwnerDir, { recursive: true })
    writeFileSync(
      join(deadOwnerDir, 'pty-x'),
      JSON.stringify({
        shellPid: 333,
        shellStartTime: T_A,
        descendants: [
          { pid: 333, startTime: T_A },
          { pid: 444, startTime: T_B },
          { pid: 555, startTime: T_C },
        ],
      }),
      'utf-8',
    )
    const swept = await sweepOrphanedPtys()
    expect(swept).toBe(1)
    expect(treeKillCalls).toHaveLength(1)
    // NaN root means "shell is gone — skip the live-tree walk and only
    // process the verified extras list."
    expect(Number.isNaN(treeKillCalls[0].pid)).toBe(true)
    const sortedExtras = treeKillCalls[0].extras.slice().sort((a, b) => a.pid - b.pid)
    expect(sortedExtras).toEqual([
      { pid: 333, startTime: T_A },
      { pid: 444, startTime: T_B },
      { pid: 555, startTime: T_C },
    ])
  })

  it('reads mid-format JSON (descendants as bare numbers) with empty startTimes', async () => {
    const deadOwnerDir = join(MARKERS_ROOT, '999997')
    mkdirSync(deadOwnerDir, { recursive: true })
    writeFileSync(
      join(deadOwnerDir, 'pty-x'),
      JSON.stringify({ shellPid: 333, descendants: [444, 555] }),
      'utf-8',
    )
    const swept = await sweepOrphanedPtys()
    expect(swept).toBe(1)
    // Descendants are kept but their startTime is empty — treeKill will skip
    // them rather than risk a PID-reuse kill. That's the safe degradation.
    const extras = treeKillCalls[0].extras.slice().sort((a, b) => a.pid - b.pid)
    expect(extras).toEqual([
      { pid: 444, startTime: '' },
      { pid: 555, startTime: '' },
    ])
  })

  it('ignores non-numeric directory entries', async () => {
    mkdirSync(join(MARKERS_ROOT, 'README'), { recursive: true })
    expect(await sweepOrphanedPtys()).toBe(0)
  })
})

describe('parseMarker', () => {
  it('parses the new JSON format with start times', () => {
    const parsed = parseMarker(JSON.stringify({
      shellPid: 42,
      shellStartTime: T_A,
      descendants: [
        { pid: 42, startTime: T_A },
        { pid: 43, startTime: T_B },
      ],
    }))
    expect(parsed).toEqual({
      shellPid: 42,
      shellStartTime: T_A,
      descendants: [
        { pid: 42, startTime: T_A },
        { pid: 43, startTime: T_B },
      ],
    })
  })

  it('accepts mid-format JSON with bare-number descendants (treats startTime as unknown)', () => {
    const parsed = parseMarker('{"shellPid":42,"descendants":[42,43,44]}')
    expect(parsed).toEqual({
      shellPid: 42,
      shellStartTime: '',
      descendants: [
        { pid: 42, startTime: '' },
        { pid: 43, startTime: '' },
        { pid: 44, startTime: '' },
      ],
    })
  })

  it('accepts the legacy plain-PID format', () => {
    expect(parseMarker('42')).toEqual({ shellPid: 42, shellStartTime: '', descendants: [] })
  })

  it('rejects PID <= 1', () => {
    expect(parseMarker('1')).toBeNull()
    expect(parseMarker('0')).toBeNull()
  })

  it('returns null for empty or malformed input', () => {
    expect(parseMarker('')).toBeNull()
    expect(parseMarker('  ')).toBeNull()
    expect(parseMarker('{"bogus":true}')).toBeNull()
    expect(parseMarker('{not json')).toBeNull()
  })
})

describe('recordPtyMarker with descendants', () => {
  it('serializes descendants with start times into the marker file', () => {
    recordPtyMarker('p1', 7777, T_A, [
      { pid: 7777, startTime: T_A },
      { pid: 8888, startTime: T_B },
      { pid: 9999, startTime: T_C },
    ])
    const file = join(MARKERS_ROOT, String(process.pid), 'p1')
    const contents = readFileSync(file, 'utf-8')
    expect(parseMarker(contents)).toEqual({
      shellPid: 7777,
      shellStartTime: T_A,
      descendants: [
        { pid: 7777, startTime: T_A },
        { pid: 8888, startTime: T_B },
        { pid: 9999, startTime: T_C },
      ],
    })
  })
})
