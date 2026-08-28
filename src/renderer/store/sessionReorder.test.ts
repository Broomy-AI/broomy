import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSessionStore } from './sessions'
import { useRepoStore } from './repos'
import { scheduleSave } from './configPersistence'
import type { Session } from './sessions'
import type { ManagedRepo } from '../../preload/index'

vi.mock('./configPersistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./configPersistence')>()),
  scheduleSave: vi.fn(),
}))

const mk = (id: string, repoId: string) =>
  ({ id, repoId, isArchived: false }) as unknown as Session

const ids = () => useSessionStore.getState().sessions.map((s) => s.id)

describe('reorderSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRepoStore.setState({
      repos: [
        { id: 'r1', name: 'One', rootDir: '/repos/one' },
        { id: 'r2', name: 'Two', rootDir: '/repos/two' },
      ] as unknown as ManagedRepo[],
    })
    useSessionStore.setState({
      sessions: [mk('a', 'r1'), mk('x', 'r2'), mk('b', 'r1'), mk('c', 'r1')],
      repoGroupOrder: [],
    })
  })

  it('moves a session before its target within the group', () => {
    useSessionStore.getState().reorderSession('c', 'a', true)
    expect(ids()).toEqual(['c', 'a', 'x', 'b'])
    expect(scheduleSave).toHaveBeenCalled()
  })

  it('ignores a drop onto a session in another repo group', () => {
    useSessionStore.getState().reorderSession('a', 'x', true)
    expect(ids()).toEqual(['a', 'x', 'b', 'c'])
    expect(scheduleSave).not.toHaveBeenCalled()
  })
})

describe('reorderRepoGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionStore.setState({ repoGroupOrder: [] })
  })

  it('stores a full group order seeded from the rendered order', () => {
    useSessionStore
      .getState()
      .reorderRepoGroup('repo:r2', 'repo:r1', ['repo:r1', 'repo:r2', 'ungrouped'], true)
    expect(useSessionStore.getState().repoGroupOrder).toEqual([
      'repo:r2',
      'repo:r1',
      'ungrouped',
    ])
    expect(scheduleSave).toHaveBeenCalled()
  })

  it('ignores a drag onto a key that is not rendered', () => {
    useSessionStore
      .getState()
      .reorderRepoGroup('repo:r1', 'repo:gone', ['repo:r1', 'repo:r2'], true)
    expect(useSessionStore.getState().repoGroupOrder).toEqual([])
    expect(scheduleSave).not.toHaveBeenCalled()
  })
})
