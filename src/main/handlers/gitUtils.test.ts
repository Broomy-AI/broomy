import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SimpleGit } from 'simple-git'
import { getDefaultBranch } from './gitUtils'

function createMockGit(): SimpleGit {
  return {
    raw: vi.fn(),
  } as unknown as SimpleGit
}

describe('getDefaultBranch', () => {
  let git: SimpleGit

  beforeEach(() => {
    git = createMockGit()
  })

  it('returns branch from symbolic-ref when available', async () => {
    vi.mocked(git.raw).mockResolvedValueOnce('refs/remotes/origin/develop\n')
    expect(await getDefaultBranch(git)).toBe('develop')
  })

  it('falls back to main when symbolic-ref fails but origin/main exists', async () => {
    vi.mocked(git.raw)
      .mockRejectedValueOnce(new Error('no symbolic ref'))
      .mockResolvedValueOnce('abc123') // origin/main exists
    expect(await getDefaultBranch(git)).toBe('main')
  })

  it('falls back to master when symbolic-ref fails and origin/main does not exist', async () => {
    vi.mocked(git.raw)
      .mockRejectedValueOnce(new Error('no symbolic ref'))
      .mockRejectedValueOnce(new Error('no origin/main'))
      .mockResolvedValueOnce('abc123') // origin/master exists
    expect(await getDefaultBranch(git)).toBe('master')
  })

  it('defaults to main when all checks fail', async () => {
    vi.mocked(git.raw)
      .mockRejectedValueOnce(new Error('no symbolic ref'))
      .mockRejectedValueOnce(new Error('no origin/main'))
      .mockRejectedValueOnce(new Error('no origin/master'))
    expect(await getDefaultBranch(git)).toBe('main')
  })

  it('trims whitespace from symbolic-ref output', async () => {
    vi.mocked(git.raw).mockResolvedValueOnce('  refs/remotes/origin/main  \n')
    expect(await getDefaultBranch(git)).toBe('main')
  })

  it('asks origin when symbolic-ref is missing and allowRemote is set', async () => {
    vi.mocked(git.raw)
      .mockRejectedValueOnce(new Error('no symbolic ref'))
      .mockResolvedValueOnce('ref: refs/heads/develop\tHEAD\nabc123\tHEAD\n')
    expect(await getDefaultBranch(git, true)).toBe('develop')
  })

  it('does not contact origin unless allowRemote is set', async () => {
    vi.mocked(git.raw)
      .mockRejectedValueOnce(new Error('no symbolic ref'))
      .mockResolvedValueOnce('abc123') // origin/main exists
    expect(await getDefaultBranch(git)).toBe('main')
    // Only symbolic-ref and rev-parse ran — no ls-remote in between.
    expect(git.raw).toHaveBeenCalledTimes(2)
    expect(git.raw).toHaveBeenLastCalledWith(['rev-parse', '--verify', 'origin/main'])
  })

  it('falls back to name guessing when origin is unreachable', async () => {
    vi.mocked(git.raw)
      .mockRejectedValueOnce(new Error('no symbolic ref'))
      .mockRejectedValueOnce(new Error('could not read from remote'))
      .mockRejectedValueOnce(new Error('no origin/main'))
      .mockResolvedValueOnce('abc123') // origin/master exists
    expect(await getDefaultBranch(git, true)).toBe('master')
  })
})
