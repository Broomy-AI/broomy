// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { ptyCaptureRegistry } from './ptyCaptureRegistry'

describe('ptyCaptureRegistry', () => {
  beforeEach(() => {
    ptyCaptureRegistry.dispose('test')
    ptyCaptureRegistry.dispose('a')
    ptyCaptureRegistry.dispose('b')
  })

  it('returns null when serializing a key that was never initialized', () => {
    expect(ptyCaptureRegistry.serializeAsciinema('does-not-exist')).toBeNull()
  })

  it('records output and serializes asciinema v2', () => {
    ptyCaptureRegistry.init('test', 80, 24, { TERM: 'xterm-256color' })
    ptyCaptureRegistry.recordOutput('test', 'hello')
    ptyCaptureRegistry.recordOutput('test', '\r\nworld\r\n')

    const cast = ptyCaptureRegistry.serializeAsciinema('test')
    expect(cast).not.toBeNull()
    const lines = cast!.trim().split('\n')
    const header = JSON.parse(lines[0])
    expect(header.version).toBe(2)
    expect(header.width).toBe(80)
    expect(header.height).toBe(24)
    expect(header.env.TERM).toBe('xterm-256color')
    expect(header.truncated).toBeUndefined()

    expect(lines).toHaveLength(3)
    const ev1 = JSON.parse(lines[1])
    expect(ev1[1]).toBe('o')
    expect(ev1[2]).toBe('hello')
    const ev2 = JSON.parse(lines[2])
    expect(ev2[1]).toBe('o')
    expect(ev2[2]).toBe('\r\nworld\r\n')
    expect(ev2[0]).toBeGreaterThanOrEqual(ev1[0])
  })

  it('ignores empty output writes', () => {
    ptyCaptureRegistry.init('test', 80, 24)
    ptyCaptureRegistry.recordOutput('test', '')
    const cast = ptyCaptureRegistry.serializeAsciinema('test')!
    const lines = cast.trim().split('\n')
    expect(lines).toHaveLength(1)
  })

  it('records resize events and deduplicates no-op resizes', () => {
    ptyCaptureRegistry.init('test', 80, 24)
    ptyCaptureRegistry.recordResize('test', 80, 24)
    ptyCaptureRegistry.recordResize('test', 120, 40)
    ptyCaptureRegistry.recordResize('test', 120, 40)
    ptyCaptureRegistry.recordResize('test', 100, 30)

    const cast = ptyCaptureRegistry.serializeAsciinema('test')!
    const lines = cast.trim().split('\n')
    expect(lines).toHaveLength(3)
    const r1 = JSON.parse(lines[1])
    expect(r1[1]).toBe('r')
    expect(r1[2]).toBe('120x40')
    const r2 = JSON.parse(lines[2])
    expect(r2[2]).toBe('100x30')
  })

  it('drops oldest events when ring buffer cap is exceeded and flags truncated', () => {
    ptyCaptureRegistry.init('test', 80, 24, {}, 32)
    ptyCaptureRegistry.recordOutput('test', 'a'.repeat(20))
    ptyCaptureRegistry.recordOutput('test', 'b'.repeat(20))
    ptyCaptureRegistry.recordOutput('test', 'c'.repeat(20))

    const cast = ptyCaptureRegistry.serializeAsciinema('test')!
    const lines = cast.trim().split('\n')
    const header = JSON.parse(lines[0])
    expect(header.truncated).toBe(true)
    expect(lines.length).toBeLessThan(4)
  })

  it('re-anchors timestamps so the first surviving event starts at t=0', async () => {
    ptyCaptureRegistry.init('test', 80, 24)
    ptyCaptureRegistry.recordOutput('test', 'a')
    await new Promise(r => setTimeout(r, 25))
    ptyCaptureRegistry.recordOutput('test', 'b')

    const cast = ptyCaptureRegistry.serializeAsciinema('test')!
    const lines = cast.trim().split('\n')
    const first = JSON.parse(lines[1])
    const second = JSON.parse(lines[2])
    expect(first[0]).toBe(0)
    expect(second[0]).toBeGreaterThan(0)
  })

  it('omits env from header when none provided', () => {
    ptyCaptureRegistry.init('test', 80, 24)
    ptyCaptureRegistry.recordOutput('test', 'x')
    const cast = ptyCaptureRegistry.serializeAsciinema('test')!
    const header = JSON.parse(cast.trim().split('\n')[0])
    expect(header.env).toBeUndefined()
  })

  it('disposes recorders cleanly', () => {
    ptyCaptureRegistry.init('test', 80, 24)
    expect(ptyCaptureRegistry.hasRecorder('test')).toBe(true)
    ptyCaptureRegistry.dispose('test')
    expect(ptyCaptureRegistry.hasRecorder('test')).toBe(false)
    expect(ptyCaptureRegistry.serializeAsciinema('test')).toBeNull()
  })

  it('ignores output and resize calls on unknown keys', () => {
    ptyCaptureRegistry.recordOutput('never-init', 'x')
    ptyCaptureRegistry.recordResize('never-init', 80, 24)
    expect(ptyCaptureRegistry.hasRecorder('never-init')).toBe(false)
  })

  it('keeps separate buffers for distinct keys', () => {
    ptyCaptureRegistry.init('a', 80, 24)
    ptyCaptureRegistry.init('b', 132, 50)
    ptyCaptureRegistry.recordOutput('a', 'A-only')
    ptyCaptureRegistry.recordOutput('b', 'B-only')

    const castA = ptyCaptureRegistry.serializeAsciinema('a')!
    const castB = ptyCaptureRegistry.serializeAsciinema('b')!
    expect(castA).toContain('A-only')
    expect(castA).not.toContain('B-only')
    expect(castB).toContain('B-only')
    expect(JSON.parse(castB.split('\n')[0]).width).toBe(132)
  })
})
