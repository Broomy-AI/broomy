import { describe, it, expect } from 'vitest'
import { sortArchived } from './archivedOrder'
import type { Session } from '../../store/sessions'

const mk = (id: string, archivedAt?: number) =>
  ({ id, archivedAt, isArchived: true }) as unknown as Session

describe('sortArchived', () => {
  it('puts the most recently archived first', () => {
    const out = sortArchived([mk('a', 100), mk('b', 300), mk('c', 200)])
    expect(out.map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts sessions with no timestamp last, keeping their input order', () => {
    const out = sortArchived([mk('old1'), mk('a', 100), mk('old2'), mk('b', 300)])
    expect(out.map((s) => s.id)).toEqual(['b', 'a', 'old1', 'old2'])
  })

  it('does not mutate the input array', () => {
    const input = [mk('a', 100), mk('b', 300)]
    sortArchived(input)
    expect(input.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('returns an empty array unchanged', () => {
    expect(sortArchived([])).toEqual([])
  })
})
