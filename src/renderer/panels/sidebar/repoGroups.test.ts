import { describe, it, expect } from 'vitest'
import {
  groupSessionsByRepo,
  groupKeyForSession,
  resolveRepoId,
  rollUpStatus,
  flattenGroupOrder,
} from './repoGroups'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'

function mk(over: Partial<Session>): Session {
  return {
    id: 's',
    name: 'n',
    branch: 'main',
    status: 'idle',
    isArchived: false,
    isUnread: false,
    initError: null,
    repoId: undefined,
    ...over,
  } as Session
}

function repo(id: string, name: string): ManagedRepo {
  return { id, name, remoteUrl: '', rootDir: `/${name}`, defaultBranch: 'main' } as ManagedRepo
}

describe('groupKeyForSession', () => {
  it('is stable for a defined repoId regardless of resolution', () => {
    expect(groupKeyForSession({ repoId: 'r1', directory: '' }, [])).toBe('repo:r1')
    expect(groupKeyForSession({ repoId: undefined, directory: '' }, [])).toBe('ungrouped')
  })

  it('agrees with the grouped view for a repoId-less session resolved by directory', () => {
    const repos = [repo('r-b', 'broomy')]
    const s = { repoId: undefined, directory: '/broomy/main' }
    expect(groupKeyForSession(s, repos)).toBe('repo:r-b')
  })
})

describe('resolveRepoId', () => {
  const repos = [repo('r-b', 'broomy'), repo('r-a', 'acme-web')]

  it('prefers an explicit repoId over the directory', () => {
    expect(resolveRepoId({ repoId: 'r-a', directory: '/broomy/main' }, repos)).toBe('r-a')
  })

  it('keeps an unresolvable repoId instead of re-homing by path (deleted repo stays unknown)', () => {
    expect(resolveRepoId({ repoId: 'gone', directory: '/broomy/main' }, repos)).toBe('gone')
  })

  it('falls back to the repo rootDir for a legacy "main" session with no repoId', () => {
    expect(resolveRepoId({ repoId: undefined, directory: '/broomy/main' }, repos)).toBe('r-b')
  })

  it('matches a worktree directory and the rootDir itself', () => {
    expect(resolveRepoId({ repoId: undefined, directory: '/broomy/feat/x' }, repos)).toBe('r-b')
    expect(resolveRepoId({ repoId: undefined, directory: '/broomy' }, repos)).toBe('r-b')
  })

  it('does not match a sibling repo that merely shares a name prefix', () => {
    // '/broomy-other' must NOT match rootDir '/broomy' — the separator guard.
    expect(resolveRepoId({ repoId: undefined, directory: '/broomy-other/main' }, repos)).toBeUndefined()
  })

  it('picks the LONGEST matching rootDir when one repo nests inside another', () => {
    const nested = [repo('outer', 'outer'), { ...repo('inner', 'inner'), rootDir: '/outer/inner' }]
    expect(resolveRepoId({ repoId: undefined, directory: '/outer/inner/main' }, nested)).toBe('inner')
  })

  it('tolerates a trailing slash on rootDir', () => {
    const trailing = [{ ...repo('r-b', 'broomy'), rootDir: '/broomy/' }]
    expect(resolveRepoId({ repoId: undefined, directory: '/broomy/main' }, trailing)).toBe('r-b')
  })

  it('returns undefined for a session with no repoId and no matching root', () => {
    expect(resolveRepoId({ repoId: undefined, directory: '/elsewhere/main' }, repos)).toBeUndefined()
    expect(resolveRepoId({ repoId: undefined, directory: '' }, repos)).toBeUndefined()
  })
})

describe('groupSessionsByRepo — ordering', () => {
  const repos = [repo('r-b', 'broomy'), repo('r-a', 'acme-web')]

  it('sorts groups A→Z by repo name, keeping sessions within a group in array order', () => {
    const sessions = [
      mk({ id: '1', repoId: 'r-b', branch: 'spike/z' }),
      mk({ id: '2', repoId: 'r-a', branch: 'main' }),
      mk({ id: '3', repoId: 'r-b', branch: 'feat/a' }),
      mk({ id: '4', repoId: 'r-a', branch: 'feature/checkout' }),
    ]
    const groups = groupSessionsByRepo(sessions, repos)
    expect(groups.map((g) => g.label)).toEqual(['acme-web', 'broomy'])
    expect(groups[1].sessions.map((s) => s.branch)).toEqual(['spike/z', 'feat/a'])
  })

  it('places named repos, then Unknown repository, then No repo', () => {
    const sessions = [
      mk({ id: '1', repoId: undefined }),
      mk({ id: '2', repoId: 'gone' }),
      mk({ id: '3', repoId: 'r-a' }),
    ]
    const groups = groupSessionsByRepo(sessions, repos)
    expect(groups.map((g) => g.label)).toEqual(['acme-web', 'Unknown repository', 'No repo'])
    expect(groups.map((g) => g.kind)).toEqual(['repo', 'unknown', 'ungrouped'])
  })

  it('keeps a deleted repo under a stable key and clusters its sessions', () => {
    const sessions = [
      mk({ id: '1', repoId: 'gone', branch: 'b' }),
      mk({ id: '2', repoId: 'gone', branch: 'a' }),
    ]
    const groups = groupSessionsByRepo(sessions, [])
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('repo:gone')
    expect(groups[0].label).toBe('Unknown repository')
    expect(groups[0].sessions.map((s) => s.branch)).toEqual(['b', 'a'])
  })

  it('excludes archived sessions', () => {
    const sessions = [
      mk({ id: '1', repoId: 'r-a', isArchived: true }),
      mk({ id: '2', repoId: 'r-a', branch: 'keep' }),
    ]
    const groups = groupSessionsByRepo(sessions, repos)
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['2'])
  })

  it('is a total order: duplicate repo names break the tie by repoId', () => {
    const dup = [repo('r-2', 'same'), repo('r-1', 'same')]
    const sessions = [mk({ id: 'a', repoId: 'r-2' }), mk({ id: 'b', repoId: 'r-1' })]
    const groups = groupSessionsByRepo(sessions, dup)
    expect(groups.map((g) => g.repoId)).toEqual(['r-1', 'r-2'])
  })

  it('keeps sessions with duplicate branch names in array order (no id tiebreak)', () => {
    const sessions = [
      mk({ id: 'z', repoId: 'r-a', branch: 'main' }),
      mk({ id: 'a', repoId: 'r-a', branch: 'main' }),
    ]
    const groups = groupSessionsByRepo(sessions, repos)
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['z', 'a'])
  })

  it('does not reorder sessions by branch, even ones that would sort numerically/case-insensitively', () => {
    const sessions = [
      mk({ id: '1', repoId: 'r-a', branch: 'v10' }),
      mk({ id: '2', repoId: 'r-a', branch: 'v2' }),
      mk({ id: '3', repoId: 'r-a', branch: 'Alpha' }),
    ]
    const groups = groupSessionsByRepo(sessions, repos)
    expect(groups[0].sessions.map((s) => s.branch)).toEqual(['v10', 'v2', 'Alpha'])
  })

  it('does not mutate the input array', () => {
    const sessions = [
      mk({ id: '1', repoId: 'r-b', branch: 'z' }),
      mk({ id: '2', repoId: 'r-a', branch: 'a' }),
    ]
    const snapshot = sessions.map((s) => s.id)
    groupSessionsByRepo(sessions, repos)
    expect(sessions.map((s) => s.id)).toEqual(snapshot)
  })
})

describe('manual ordering', () => {
  const repos = [repo('r-b', 'broomy'), repo('r-a', 'acme-web')]

  it('keeps sessions in array order within a group, not alphabetical', () => {
    const groups = groupSessionsByRepo(
      [mk({ id: '1', repoId: 'r-a', branch: 'zebra' }), mk({ id: '2', repoId: 'r-a', branch: 'alpha' })],
      repos,
    )
    expect(groups[0].sessions.map((s) => s.branch)).toEqual(['zebra', 'alpha'])
  })

  it('orders groups by repoGroupOrder, with unlisted groups after', () => {
    const groups = groupSessionsByRepo(
      [mk({ id: '1', repoId: 'r-a' }), mk({ id: '2', repoId: 'r-b' }), mk({ id: '3', directory: '/elsewhere' })],
      repos,
      ['ungrouped', 'repo:r-b'],
    )
    expect(groups.map((g) => g.key)).toEqual(['ungrouped', 'repo:r-b', 'repo:r-a'])
  })

  it('falls back entirely to the computed order when repoGroupOrder is empty', () => {
    const groups = groupSessionsByRepo(
      [mk({ id: '1', repoId: 'r-b' }), mk({ id: '2', repoId: 'r-a' })],
      repos,
      [],
    )
    expect(groups.map((g) => g.key)).toEqual(['repo:r-a', 'repo:r-b'])
  })
})

describe('rollUpStatus', () => {
  it('applies priority error > unread > working > initializing > idle', () => {
    expect(rollUpStatus([mk({ status: 'idle' })]).status).toBe('idle')
    expect(rollUpStatus([mk({ status: 'initializing' })]).status).toBe('initializing')
    expect(rollUpStatus([mk({ status: 'working' }), mk({ status: 'initializing' })]).status).toBe('working')
    expect(rollUpStatus([mk({ isUnread: true }), mk({ status: 'working' })]).status).toBe('unread')
    expect(rollUpStatus([mk({ status: 'error' }), mk({ isUnread: true })]).status).toBe('error')
  })

  it('treats initError as error', () => {
    expect(rollUpStatus([mk({ status: 'idle', initError: 'boom' })]).status).toBe('error')
  })

  it('counts the winning category and the total', () => {
    const r = rollUpStatus([mk({ status: 'error' }), mk({ status: 'error' }), mk({ status: 'idle' })])
    expect(r).toEqual({ status: 'error', count: 2, total: 3 })
  })
})

describe('flattenGroupOrder', () => {
  it('is the group order (by label, no repoGroupOrder) with sessions in array order within each group', () => {
    const repos = [repo('r-b', 'broomy'), repo('r-a', 'acme-web')]
    const sessions = [
      mk({ id: '1', repoId: 'r-b', branch: 'b' }),
      mk({ id: '2', repoId: 'r-a', branch: 'a' }),
      mk({ id: '3', repoId: 'r-b', branch: 'a' }),
    ]
    const order = flattenGroupOrder(groupSessionsByRepo(sessions, repos))
    // acme-web (id 2) first, then broomy in array order: id 1 ('b'), then id 3 ('a')
    expect(order).toEqual(['2', '1', '3'])
  })
})
