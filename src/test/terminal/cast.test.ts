import { describe, it, expect } from 'vitest'
import { parseCast, parseResize } from './cast'

describe('parseCast', () => {
  it('parses a minimal valid cast', () => {
    const text = '{"version":2,"width":80,"height":24}\n[0,"o","hi"]\n'
    const result = parseCast(text)
    expect(result.header.width).toBe(80)
    expect(result.header.height).toBe(24)
    expect(result.events).toEqual([{ tSec: 0, kind: 'o', data: 'hi' }])
  })

  it('skips blank lines', () => {
    const text = '{"version":2,"width":80,"height":24}\n\n[0,"o","hi"]\n\n'
    const result = parseCast(text)
    expect(result.events).toHaveLength(1)
  })

  it('parses resize events', () => {
    const text = '{"version":2,"width":80,"height":24}\n[0.5,"r","132x50"]\n'
    const result = parseCast(text)
    expect(result.events[0]).toEqual({ tSec: 0.5, kind: 'r', data: '132x50' })
  })

  it('throws on empty input', () => {
    expect(() => parseCast('')).toThrow(/Empty cast file/)
  })

  it('throws on unsupported version', () => {
    expect(() => parseCast('{"version":1,"width":80,"height":24}\n')).toThrow(/Unsupported cast version/)
  })

  it('throws when width or height is missing', () => {
    expect(() => parseCast('{"version":2,"width":80}\n')).toThrow(/missing width\/height/)
  })

  it('throws on a malformed event row', () => {
    const text = '{"version":2,"width":80,"height":24}\n[0]\n'
    expect(() => parseCast(text)).toThrow(/Invalid cast event/)
  })

  it('throws on unknown event kind', () => {
    const text = '{"version":2,"width":80,"height":24}\n[0,"x","data"]\n'
    expect(() => parseCast(text)).toThrow(/Invalid cast event kind/)
  })
})

describe('parseResize', () => {
  it('parses COLSxROWS', () => {
    expect(parseResize('132x50')).toEqual({ cols: 132, rows: 50 })
  })

  it('throws on bad input', () => {
    expect(() => parseResize('garbage')).toThrow(/Invalid resize payload/)
  })
})
