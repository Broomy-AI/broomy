import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
  execFile: vi.fn((_cmd, _args, _opts, cb: () => void) => { cb() }),
}))

interface RecordedMarker {
  id: string
  shellPid: number
  shellStartTime: string
  descendants: { pid: number; startTime: string }[]
}
const recordedMarkers: RecordedMarker[] = []
vi.mock('./ptyMarkers', () => ({
  recordPtyMarker: (
    id: string,
    shellPid: number,
    shellStartTime = '',
    descendants: readonly { pid: number; startTime: string }[] = [],
  ) => {
    recordedMarkers.push({
      id,
      shellPid,
      shellStartTime,
      descendants: descendants.map((d) => ({ ...d })),
    })
  },
}))

import { execFileSync } from 'child_process'
import {
  parsePsStatSnapshot,
  trackPty,
  untrackPty,
  getHistoricalDescendants,
  getAllStats,
  _resetForTesting,
  _tickForTesting,
} from './descendantsTracker'

const T1 = 'Mon Jan  1 00:00:01 2024'
const T2 = 'Mon Jan  1 00:00:02 2024'
const T3 = 'Mon Jan  1 00:00:03 2024'

beforeEach(() => {
  recordedMarkers.length = 0
  vi.mocked(execFileSync).mockReset()
  _resetForTesting()
})

afterEach(() => {
  _resetForTesting()
})

describe('parsePsStatSnapshot', () => {
  it('parses pid, ppid, pgid, rss, cpu, and lstart rows', () => {
    const out =
      `  100  1  100  4096  1.5  ${T1}\n` +
      `  200  100  100  8192  0.2  ${T2}\n` +
      `rubbish\n` +
      `  300  200  100  16384  12.7  ${T3}\n`
    expect(parsePsStatSnapshot(out)).toEqual([
      { pid: 100, ppid: 1, pgid: 100, rssKb: 4096, cpuPct: 1.5, startTime: T1 },
      { pid: 200, ppid: 100, pgid: 100, rssKb: 8192, cpuPct: 0.2, startTime: T2 },
      { pid: 300, ppid: 200, pgid: 100, rssKb: 16384, cpuPct: 12.7, startTime: T3 },
    ])
  })
})

describe('tracker lifecycle', () => {
  it('records the shell PID immediately on trackPty (startTime unknown until first tick)', () => {
    trackPty('pty-1', 5000)
    expect(getHistoricalDescendants('pty-1')).toEqual([{ pid: 5000, startTime: '' }])
  })

  it('untrack removes the entry', () => {
    trackPty('pty-1', 5000)
    untrackPty('pty-1')
    expect(getHistoricalDescendants('pty-1')).toEqual([])
  })

  it('a tracking pass records descendants with their lstart times and persists them', () => {
    trackPty('pty-1', 100)
    vi.mocked(execFileSync).mockReturnValue(
      `  100  1  100  10240  0.5  ${T1}\n` +
      `  200  100  100  20480  1.0  ${T2}\n` +
      `  300  200  100  4096  2.0  ${T3}\n`
    )
    _tickForTesting()
    const hist = [...getHistoricalDescendants('pty-1')].sort((a, b) => a.pid - b.pid)
    expect(hist).toEqual([
      { pid: 100, startTime: T1 },
      { pid: 200, startTime: T2 },
      { pid: 300, startTime: T3 },
    ])
    expect(recordedMarkers).toHaveLength(1)
    expect(recordedMarkers[0].id).toBe('pty-1')
    expect(recordedMarkers[0].shellPid).toBe(100)
    expect(recordedMarkers[0].shellStartTime).toBe(T1)
    const persisted = recordedMarkers[0].descendants.slice().sort((a, b) => a.pid - b.pid)
    expect(persisted).toEqual([
      { pid: 100, startTime: T1 },
      { pid: 200, startTime: T2 },
      { pid: 300, startTime: T3 },
    ])
  })

  it('keeps remembering descendants that have since exited', () => {
    trackPty('pty-1', 100)
    vi.mocked(execFileSync).mockReturnValueOnce(
      `  100  1  100  10240  0.5  ${T1}\n` +
      `  200  100  100  20480  1.0  ${T2}\n`
    )
    _tickForTesting()
    vi.mocked(execFileSync).mockReturnValueOnce(
      `  100  1  100  10240  0.5  ${T1}\n`
    )
    _tickForTesting()
    const hist = [...getHistoricalDescendants('pty-1')].sort((a, b) => a.pid - b.pid)
    expect(hist).toEqual([
      { pid: 100, startTime: T1 },
      { pid: 200, startTime: T2 },
    ])
  })

  it('does not overwrite a recorded startTime if the PID gets recycled', () => {
    trackPty('pty-1', 100)
    vi.mocked(execFileSync).mockReturnValueOnce(
      `  100  1  100  10240  0.5  ${T1}\n` +
      `  200  100  100  20480  1.0  ${T2}\n`
    )
    _tickForTesting()
    // Second tick: pid 200 is now a totally different process (different lstart,
    // not a descendant of 100). Tracker should keep the original startTime so
    // treeKill's verification still rejects it.
    vi.mocked(execFileSync).mockReturnValueOnce(
      `  100  1  100  10240  0.5  ${T1}\n` +
      `  200  1  500  1024  0.0  ${T3}\n`
    )
    _tickForTesting()
    const entry = [...getHistoricalDescendants('pty-1')].find((e) => e.pid === 200)
    expect(entry?.startTime).toBe(T2)
  })

  it('aggregates RSS and CPU across the live tree', () => {
    trackPty('pty-1', 100)
    vi.mocked(execFileSync).mockReturnValue(
      `  100  1  100  10240  0.5  ${T1}\n` +
      `  200  100  100  20480  1.5  ${T2}\n` +
      `  300  200  100  4096  2.0  ${T3}\n`
    )
    _tickForTesting()
    const stats = getAllStats()
    expect(stats['pty-1'].rssMb).toBe(Math.round((10240 + 20480 + 4096) / 1024))
    expect(stats['pty-1'].cpuPct).toBeCloseTo(4.0, 5)
    expect(stats['pty-1'].liveCount).toBe(3)
    expect(stats['pty-1'].shellPid).toBe(100)
  })

  it('tracks multiple PTYs independently', () => {
    trackPty('pty-a', 100)
    trackPty('pty-b', 500)
    vi.mocked(execFileSync).mockReturnValue(
      `  100  1  100  10000  0.0  ${T1}\n` +
      `  200  100  100  20000  0.0  ${T2}\n` +
      `  500  1  500  30000  0.0  ${T1}\n` +
      `  600  500  500  40000  0.0  ${T2}\n`
    )
    _tickForTesting()
    const histA = [...getHistoricalDescendants('pty-a')].map((e) => e.pid).sort((a, b) => a - b)
    const histB = [...getHistoricalDescendants('pty-b')].map((e) => e.pid).sort((a, b) => a - b)
    expect(histA).toEqual([100, 200])
    expect(histB).toEqual([500, 600])
  })

  it('skips tracking pass when nothing is tracked', () => {
    _tickForTesting()
    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled()
  })
})
