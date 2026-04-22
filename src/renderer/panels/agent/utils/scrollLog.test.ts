import { describe, it, expect, beforeEach } from 'vitest'
import { ScrollLog, scrollLogRegistry } from './scrollLog'

function makeEvent(overrides: Partial<Parameters<ScrollLog['add']>[0]> = {}) {
  return {
    source: 'wheel-down' as const,
    viewportY: 0,
    baseY: 10,
    following: true,
    ...overrides,
  }
}

describe('ScrollLog', () => {
  it('records and formats events', () => {
    const log = new ScrollLog()
    log.add(makeEvent({ source: 'wheel-down', viewportY: 5, baseY: 10 }))
    const output = log.format()
    expect(output).toContain('wheel-down')
    expect(output).toContain('vY=5')
    expect(output).toContain('bY=10')
    expect(output).toContain('[following]')
  })

  it('returns placeholder when empty', () => {
    const log = new ScrollLog()
    expect(log.format()).toBe('(no scroll events recorded)')
  })

  it('shows [scrolled-up] when not following', () => {
    const log = new ScrollLog()
    log.add(makeEvent({ following: false }))
    expect(log.format()).toContain('[scrolled-up]')
  })

  it('includes DOM info when present', () => {
    const log = new ScrollLog()
    log.add(makeEvent({ scrollTop: 100, scrollHeight: 500, clientHeight: 300 }))
    expect(log.format()).toContain('dom(sT=100 sH=500 cH=300)')
  })

  it('includes detail when present', () => {
    const log = new ScrollLog()
    log.add(makeEvent({ detail: 'jumped from 450 to 0' }))
    expect(log.format()).toContain('-- jumped from 450 to 0')
  })

  it('caps at 100 events', () => {
    const log = new ScrollLog()
    for (let i = 0; i < 110; i++) {
      log.add(makeEvent({ viewportY: i }))
    }
    // format() should only have 100 lines
    const lines = log.format().split('\n')
    expect(lines).toHaveLength(100)
    // First event should be viewportY=10 (first 10 were shifted out)
    expect(lines[0]).toContain('vY=10')
  })
})

describe('scrollLogRegistry', () => {
  beforeEach(() => {
    scrollLogRegistry.unregister('test-session')
  })

  it('registers and retrieves a log', () => {
    const log = new ScrollLog()
    scrollLogRegistry.register('test-session', log)
    expect(scrollLogRegistry.get('test-session')).toBe(log)
  })

  it('unregisters a log', () => {
    const log = new ScrollLog()
    scrollLogRegistry.register('test-session', log)
    scrollLogRegistry.unregister('test-session')
    expect(scrollLogRegistry.get('test-session')).toBeUndefined()
  })

  it('formats a registered log', () => {
    const log = new ScrollLog()
    log.add(makeEvent())
    scrollLogRegistry.register('test-session', log)
    expect(scrollLogRegistry.format('test-session')).toContain('wheel-down')
  })

  it('returns fallback for unregistered session', () => {
    expect(scrollLogRegistry.format('nonexistent')).toBe('(no scroll log)')
  })
})
