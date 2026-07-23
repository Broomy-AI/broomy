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

  it('sorts groups A→Z by repo name and sessions A→Z by branch', () => {
    const sessions = [
      mk({ id: '1', repoId: 'r-b', branch: 'spike/z' }),
      mk({ id: '2', repoId: 'r-a', branch: 'main' }),
      mk({ id: '3', repoId: 'r-b', branch: 'feat/a' }),
      mk({ id: '4', repoId: 'r-a', branch: 'feature/checkout' }),
    ]
    const groups = groupSessionsByRepo(sessions, repos)
    expect(groups.map((g) => g.label)).toEqual(['acme-web', 'broomy'])
    expect(groups[1].sessions.map((s) => s.branch)).toEqual(['feat/a', 'spike/z'])
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
    expect(groups[0].sessions.map((s) => s.branch)).toEqual(['a', 'b'])
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

  it('breaks duplicate branch names by session id', () => {
    const sessions = [
      mk({ id: 'z', repoId: 'r-a', branch: 'main' }),
      mk({ id: 'a', repoId: 'r-a', branch: 'main' }),
    ]
    const groups = groupSessionsByRepo(sessions, repos)
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['a', 'z'])
  })

  it('orders numerically and case-insensitively', () => {
    const sessions = [
      mk({ id: '1', repoId: 'r-a', branch: 'v10' }),
      mk({ id: '2', repoId: 'r-a', branch: 'v2' }),
      mk({ id: '3', repoId: 'r-a', branch: 'Alpha' }),
    ]
    const groups = groupSessionsByRepo(sessions, repos)
    expect(groups[0].sessions.map((s) => s.branch)).toEqual(['Alpha', 'v2', 'v10'])
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
  it('is the alphabetical id order across groups', () => {
    const repos = [repo('r-b', 'broomy'), repo('r-a', 'acme-web')]
    const sessions = [
      mk({ id: '1', repoId: 'r-b', branch: 'b' }),
      mk({ id: '2', repoId: 'r-a', branch: 'a' }),
      mk({ id: '3', repoId: 'r-b', branch: 'a' }),
    ]
    const order = flattenGroupOrder(groupSessionsByRepo(sessions, repos))
    // acme-web (id 2) first, then broomy: feat 'a' (id 3), 'b' (id 1)
    expect(order).toEqual(['2', '3', '1'])
  })
})
