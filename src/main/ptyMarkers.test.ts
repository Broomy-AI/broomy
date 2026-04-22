import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return { ...actual, homedir: () => join(actual.tmpdir(), 'broomy-pid-markers-test', 'home') }
})

const treeKillCalls: number[] = []
vi.mock('./treeKill', () => ({
  treeKill: async (pid: number) => { treeKillCalls.push(pid) },
}))

import { recordPtyMarker, removePtyMarker, clearOwnMarkers, sweepOrphanedPtys, MARKERS_ROOT } from './ptyMarkers'

const fakeRoot = join(tmpdir(), 'broomy-pid-markers-test')

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

  it('tree-kills every shell pid in dead-owner directories and removes them', async () => {
    const deadOwnerDir = join(MARKERS_ROOT, '999999')
    mkdirSync(deadOwnerDir, { recursive: true })
    writeFileSync(join(deadOwnerDir, 'pty-a'), '111', 'utf-8')
    writeFileSync(join(deadOwnerDir, 'pty-b'), '222', 'utf-8')
    const swept = await sweepOrphanedPtys()
    expect(swept).toBe(2)
    expect(treeKillCalls.sort()).toEqual([111, 222])
    expect(existsSync(deadOwnerDir)).toBe(false)
  })

  it('ignores non-numeric directory entries', async () => {
    mkdirSync(join(MARKERS_ROOT, 'README'), { recursive: true })
    expect(await sweepOrphanedPtys()).toBe(0)
  })
})
