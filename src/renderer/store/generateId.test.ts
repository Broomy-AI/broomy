import { describe, it, expect } from 'vitest'
import { generateId } from './generateId'

describe('generateId', () => {
  it('starts with the given prefix', () => {
    const id = generateId('agent')
    expect(id.startsWith('agent-')).toBe(true)
  })

  it('contains a timestamp segment', () => {
    const before = Date.now()
    const id = generateId('session')
    const after = Date.now()

    const parts = id.split('-')
    // prefix-timestamp-random
    const timestamp = parseInt(parts[1], 10)
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(after)
  })

  it('contains a random suffix', () => {
    const id = generateId('repo')
    const parts = id.split('-')
    // The random part is base36 (alphanumeric)
    const random = parts[2]
    expect(random.length).toBeGreaterThan(0)
    expect(random).toMatch(/^[a-z0-9]+$/)
  })

  it('generates unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId('test')))
    expect(ids.size).toBe(100)
  })

  it('works with different prefixes', () => {
    expect(generateId('profile').startsWith('profile-')).toBe(true)
    expect(generateId('x').startsWith('x-')).toBe(true)
  })
})
