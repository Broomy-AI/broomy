import { describe, it, expect } from 'vitest'
import { moveSessionWithinGroup, moveGroupKey } from './sidebarDragOrder'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'

const repos = [
  { id: 'r1', name: 'One', rootDir: '/repos/one' },
  { id: 'r2', name: 'Two', rootDir: '/repos/two' },
] as unknown as ManagedRepo[]

const mk = (id: string, repoId: string) =>
  ({ id, repoId, isArchived: false }) as unknown as Session

/** r1: a, b, c interleaved with r2: x, y — so index math can't accidentally pass. */
const sessions = [mk('a', 'r1'), mk('x', 'r2'), mk('b', 'r1'), mk('y', 'r2'), mk('c', 'r1')]
const ids = (out: Session[]) => out.map((s) => s.id)

describe('moveSessionWithinGroup', () => {
  it('moves a session down, before the target', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'a', 'c', true)))
      .toEqual(['x', 'b', 'y', 'a', 'c'])
  })

  it('moves a session down, after the target', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'a', 'c', false)))
      .toEqual(['x', 'b', 'y', 'c', 'a'])
  })

  it('moves a session up, before the target', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'c', 'a', true)))
      .toEqual(['c', 'a', 'x', 'b', 'y'])
  })

  it('moves a session up, after the target', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'c', 'a', false)))
      .toEqual(['a', 'c', 'x', 'b', 'y'])
  })

  it('rejects a drop onto a session in a different repo group', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'a', 'x', true)))
      .toEqual(['a', 'x', 'b', 'y', 'c'])
  })

  it('is a no-op when dragged and target are the same session', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'a', 'a', true)))
      .toEqual(['a', 'x', 'b', 'y', 'c'])
  })

  it('is a no-op when either id is unknown', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'nope', 'a', true)))
      .toEqual(['a', 'x', 'b', 'y', 'c'])
    expect(ids(moveSessionWithinGroup(sessions, repos, 'a', 'nope', true)))
      .toEqual(['a', 'x', 'b', 'y', 'c'])
  })

  it('does not mutate the input array', () => {
    const input = [...sessions]
    moveSessionWithinGroup(input, repos, 'a', 'c', true)
    expect(ids(input)).toEqual(['a', 'x', 'b', 'y', 'c'])
  })
})

describe('moveGroupKey', () => {
  const rendered = ['repo:r1', 'repo:r2', 'ungrouped']

  it('seeds from the rendered order when no order is stored yet', () => {
    expect(moveGroupKey([], rendered, 'ungrouped', 'repo:r1', true))
      .toEqual(['ungrouped', 'repo:r1', 'repo:r2'])
  })

  it('drops the dragged key after the target', () => {
    expect(moveGroupKey(rendered, rendered, 'repo:r1', 'ungrouped', false))
      .toEqual(['repo:r2', 'ungrouped', 'repo:r1'])
  })

  it('appends keys rendered but not yet stored, preserving stored order first', () => {
    expect(moveGroupKey(['repo:r2'], rendered, 'ungrouped', 'repo:r2', true))
      .toEqual(['ungrouped', 'repo:r2', 'repo:r1'])
  })

  it('prunes stored keys that are no longer rendered', () => {
    expect(moveGroupKey(['repo:gone', 'repo:r1', 'repo:r2'], rendered, 'repo:r2', 'repo:r1', true))
      .toEqual(['repo:r2', 'repo:r1', 'ungrouped'])
  })

  it('is a no-op when dragged and target are the same key', () => {
    expect(moveGroupKey(rendered, rendered, 'repo:r1', 'repo:r1', true)).toEqual(rendered)
  })

  it('is a no-op when the target is not rendered', () => {
    expect(moveGroupKey(rendered, rendered, 'repo:r1', 'repo:gone', true)).toEqual(rendered)
  })
})
