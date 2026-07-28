import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGitInstance: Record<string, ReturnType<typeof vi.fn>> = {
  clone: vi.fn(),
  raw: vi.fn(),
  push: vi.fn(),
  getRemotes: vi.fn(),
  listRemote: vi.fn(),
  log: vi.fn(),
  branch: vi.fn(),
  fetch: vi.fn(),
  merge: vi.fn(),
  reset: vi.fn(),
  env: vi.fn().mockImplementation(() => mockGitInstance),
}

vi.mock('simple-git', () => ({
  default: vi.fn(() => mockGitInstance),
}))

vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => cb(null, '', '')),
}))

vi.mock('../cloneErrorHint', () => ({
  getCloneErrorHint: vi.fn(() => null),
  getGitAuthHint: vi.fn(() => null),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
}))

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../platform', () => ({
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
}))

vi.mock('./types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./types')>()
  return {
    ...actual,
    expandHomePath: (p: string) => p,
  }
})

import { register, isCreatableBranchName } from './gitBranch'
import { getCloneErrorHint } from '../cloneErrorHint'
import { E2EScenario, type HandlerContext } from './types'

function createMockCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    isE2ETest: false,
    e2eScenario: E2EScenario.Default, e2eRealRepos: false,
    isDev: false,
    isWindows: false,
    ptyProcesses: new Map(),
    ptyOwnerWindows: new Map(),
    fileWatchers: new Map(),
    watcherOwnerWindows: new Map(),
    profileWindows: new Map(),
    mainWindow: null,
    E2E_MOCK_SHELL: undefined,
    FAKE_CLAUDE_SCRIPT: undefined,
    dockerContainers: new Map(),
    ...overrides,
  }
}

function setupHandlers(ctx?: HandlerContext) {
  const handlers: Record<string, Function> = {}
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers[channel] = handler
    }),
  }
  register(mockIpcMain as never, ctx ?? createMockCtx())
  return handlers
}

describe('isCreatableBranchName', () => {
  it('accepts ordinary branch names', () => {
    for (const ok of ['feature/x', 'issue/146-fix', 'main', 'a.b-c_d']) {
      expect(isCreatableBranchName(ok)).toBe(true)
    }
  })
  it('rejects empty, option-like, and git-forbidden names', () => {
    for (const bad of ['', '@', '-D', '--force', 'has space', 'a..b', 'a@{0}', 'a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b', '/lead', 'trail/', 'a//b', 'dot.', 'x.lock', '.hidden', 'a/.hidden', 'x.lock/b']) {
      expect(isCreatableBranchName(bad)).toBe(false)
    }
    expect(isCreatableBranchName(`a${String.fromCharCode(1)}b`)).toBe(false) // control char
    expect(isCreatableBranchName(`a${String.fromCharCode(0x7f)}b`)).toBe(false) // DEL
  })
})

describe('gitBranch handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGitInstance.env.mockImplementation(() => mockGitInstance)
  })

  describe('registration', () => {
    it('registers all expected channels', () => {
      const handlers = setupHandlers()
      expect(handlers['git:clone']).toBeDefined()
      expect(handlers['git:worktreeAdd']).toBeDefined()
      expect(handlers['git:worktreeAddNewBranch']).toBeDefined()
      expect(handlers['git:worktreeList']).toBeDefined()
      expect(handlers['git:pushNewBranch']).toBeDefined()
      expect(handlers['git:defaultBranch']).toBeDefined()
      expect(handlers['git:remoteUrl']).toBeDefined()
      expect(handlers['git:headCommit']).toBeDefined()
      expect(handlers['git:listBranches']).toBeDefined()
      expect(handlers['git:fetchBranch']).toBeDefined()
      expect(handlers['git:fetchReviewPrHead']).toBeDefined()
      expect(handlers['git:syncReviewBranch']).toBeDefined()
      expect(handlers['git:isMergedInto']).toBeDefined()
      expect(handlers['git:hasBranchCommits']).toBeDefined()
      expect(handlers['git:worktreeRemove']).toBeDefined()
      expect(handlers['git:deleteBranch']).toBeDefined()
    })
  })

  describe('git:clone', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:clone'](null, 'https://github.com/org/repo.git', '/target')
      expect(result).toEqual({ success: true })
    })

    it('clones repo in normal mode', async () => {
      mockGitInstance.clone.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:clone'](null, 'https://github.com/org/repo.git', '/target')
      expect(result).toEqual({ success: true })
    })

    it('returns error with hint on failure', async () => {
      mockGitInstance.clone.mockRejectedValue(new Error('clone failed'))
      vi.mocked(getCloneErrorHint).mockReturnValue('\n\nTry SSH instead')

      const handlers = setupHandlers()
      const result = await handlers['git:clone'](null, 'https://github.com/org/repo.git', '/target')
      expect(result.success).toBe(false)
      expect(result.error).toContain('clone failed')
      expect(result.error).toContain('Try SSH instead')
    })

    it('returns error without hint when no hint applies', async () => {
      mockGitInstance.clone.mockRejectedValue(new Error('generic error'))
      vi.mocked(getCloneErrorHint).mockReturnValue(null)

      const handlers = setupHandlers()
      const result = await handlers['git:clone'](null, 'url', '/target')
      expect(result.success).toBe(false)
      expect(result.error).toContain('generic error')
    })

    it('creates the parent directory before cloning', async () => {
      const { mkdir } = await import('fs/promises')
      vi.mocked(mkdir).mockResolvedValue(undefined)
      mockGitInstance.clone.mockResolvedValue(undefined)

      const handlers = setupHandlers()
      const result = await handlers['git:clone'](null, 'https://github.com/org/repo.git', '/target/repo/main')
      expect(result).toEqual({ success: true })
      expect(mkdir).toHaveBeenCalledWith('/target/repo', { recursive: true })
    })

    it('returns clear error when parent directory cannot be created', async () => {
      const { mkdir } = await import('fs/promises')
      vi.mocked(mkdir).mockRejectedValueOnce(new Error('EACCES: permission denied'))

      const handlers = setupHandlers()
      const result = await handlers['git:clone'](null, 'url', '/forbidden/repo/main')
      expect(result.success).toBe(false)
      expect(result.error).toContain('parent folder')
      expect(result.error).toContain('permission denied')
      // Should not have attempted the clone
      expect(mockGitInstance.clone).not.toHaveBeenCalled()
    })
  })

  describe('git:worktreeAdd', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:worktreeAdd'](null, '/repo', '/wt', 'branch', 'main')
      expect(result).toEqual({ success: true })
    })

    it('checks out existing branch without -b first', async () => {
      mockGitInstance.raw.mockResolvedValue('')
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAdd'](null, '/repo', '/wt', 'branch', 'main')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.raw).toHaveBeenCalledWith(['worktree', 'add', '/wt', 'branch'])
    })

    it('falls back to -b when branch does not exist', async () => {
      mockGitInstance.raw
        .mockRejectedValueOnce(new Error('not a valid branch'))
        .mockResolvedValueOnce('')
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAdd'](null, '/repo', '/wt', 'branch', 'main')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.raw).toHaveBeenCalledWith(['worktree', 'add', '-b', 'branch', '/wt', 'main'])
    })

    it('returns error when both attempts fail', async () => {
      mockGitInstance.raw
        .mockRejectedValueOnce(new Error('not a valid branch'))
        .mockRejectedValueOnce(new Error('worktree error'))
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAdd'](null, '/repo', '/wt', 'branch', 'main')
      expect(result).toEqual({ success: false, error: expect.stringContaining('worktree error') })
    })

    it('returns friendly error on ref path conflict', async () => {
      mockGitInstance.raw.mockRejectedValueOnce(
        new Error("fatal: 'refs/heads/release' exists; cannot create 'refs/heads/release/linux'")
      )
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAdd'](null, '/repo', '/wt', 'release/linux', 'main')
      expect(result.success).toBe(false)
      expect(result.error).toContain('"release/linux"')
      expect(result.error).toContain('"release"')
      expect(result.error).not.toContain('refs/heads')
    })

    it('returns clear error when repo directory does not exist', async () => {
      const { existsSync } = await import('fs')
      vi.mocked(existsSync).mockReturnValueOnce(false)
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAdd'](null, '/repo', '/wt', 'branch', 'main')
      expect(result.success).toBe(false)
      expect(result.error).toContain('main worktree directory was not found')
      expect(result.error).toContain('/repo')
    })
  })

  describe('git:worktreeAddNewBranch', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:worktreeAddNewBranch'](null, '/repo', '/wt', 'branch', 'main')).toEqual({ success: true })
    })

    it('errors when the main worktree directory is missing', async () => {
      const { existsSync } = await import('fs')
      vi.mocked(existsSync).mockReturnValueOnce(false)
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAddNewBranch'](null, '/repo', '/wt', 'branch', 'main')
      expect(result.success).toBe(false)
      expect(result.error).toContain('was not found')
    })

    it('rejects an option-like branch name before any git mutation', async () => {
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAddNewBranch'](null, '/repo', '/wt', '-D', 'main')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid branch name')
      expect(mockGitInstance.raw).not.toHaveBeenCalled()
      expect(mockGitInstance.branch).not.toHaveBeenCalled()
    })

    it('rejects an option-like base branch too', async () => {
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAddNewBranch'](null, '/repo', '/wt', 'feature/x', '-M')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid branch name')
      expect(mockGitInstance.raw).not.toHaveBeenCalled()
    })

    it('resolves the base to a commit, creates the branch atomically, then attaches a worktree', async () => {
      mockGitInstance.raw.mockResolvedValue('abc123\n')
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAddNewBranch'](null, '/repo', '/wt', 'feature/x', 'origin/main')
      expect(result).toEqual({ success: true })
      // The base is a remote-tracking ref, so it must be resolved rather than assumed to live
      // under refs/heads/, and the branch is pinned to the exact commit we verified.
      expect(mockGitInstance.raw).toHaveBeenCalledWith(['rev-parse', '--verify', 'origin/main^{commit}'])
      expect(mockGitInstance.raw).toHaveBeenCalledWith(['branch', 'feature/x', 'abc123'])
      expect(mockGitInstance.raw).toHaveBeenCalledWith(['worktree', 'add', '/wt', 'feature/x'])
    })

    it('errors without mutating anything when the base ref cannot be resolved', async () => {
      mockGitInstance.raw.mockRejectedValueOnce(new Error("fatal: Needed a single revision")) // rev-parse
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAddNewBranch'](null, '/repo', '/wt', 'feature/x', 'origin/main')
      expect(result.success).toBe(false)
      expect(result.error).toContain('base branch "origin/main" wasn\'t found')
      expect(mockGitInstance.raw).not.toHaveBeenCalledWith(expect.arrayContaining(['branch']))
      expect(mockGitInstance.branch).not.toHaveBeenCalled()
    })

    it('reports BRANCH_EXISTS and creates no worktree when the local branch already exists', async () => {
      mockGitInstance.raw
        .mockResolvedValueOnce('abc123\n') // rev-parse
        .mockRejectedValueOnce(new Error("fatal: a branch named 'feature/x' already exists"))
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAddNewBranch'](null, '/repo', '/wt', 'feature/x', 'origin/main')
      expect(result.success).toBe(false)
      expect(result.error).toContain('BRANCH_EXISTS:')
      expect(mockGitInstance.raw).not.toHaveBeenCalledWith(['worktree', 'add', '/wt', 'feature/x'])
      expect(mockGitInstance.branch).not.toHaveBeenCalled()
    })

    it('on an occupied path: WORKTREE_PATH_EXISTS, deletes only our branch, never removes the path', async () => {
      mockGitInstance.raw
        .mockResolvedValueOnce('abc123\n') // rev-parse
        .mockResolvedValueOnce('') // git branch feature/x abc123
        .mockRejectedValueOnce(new Error("fatal: '/wt' already exists")) // worktree add
      mockGitInstance.branch.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAddNewBranch'](null, '/repo', '/wt', 'feature/x', 'main')
      expect(result.success).toBe(false)
      expect(result.error).toContain('WORKTREE_PATH_EXISTS:')
      // Delete our branch, but NEVER remove the path — it may be a pre-existing/stale worktree.
      expect(mockGitInstance.branch).toHaveBeenCalledWith(['-D', 'feature/x'])
      expect(mockGitInstance.raw).not.toHaveBeenCalledWith(['worktree', 'remove', '--force', '/wt'])
    })

    it('on any other attach failure: deletes our branch, notes a possible partial worktree, removes nothing', async () => {
      mockGitInstance.raw
        .mockResolvedValueOnce('abc123\n') // rev-parse
        .mockResolvedValueOnce('') // git branch
        .mockRejectedValueOnce(new Error('error: post-checkout hook exited with code 1')) // worktree add
      mockGitInstance.branch.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAddNewBranch'](null, '/repo', '/wt', 'feature/x', 'main')
      expect(result.success).toBe(false)
      expect(result.error).toContain('post-checkout hook')
      expect(result.error).toContain('A partial worktree may remain')
      expect(mockGitInstance.branch).toHaveBeenCalledWith(['-D', 'feature/x'])
      expect(mockGitInstance.raw).not.toHaveBeenCalledWith(['worktree', 'remove', '--force', '/wt'])
    })

    it('surfaces a "may remain" note if deleting our branch also fails', async () => {
      mockGitInstance.raw
        .mockResolvedValueOnce('abc123\n') // rev-parse
        .mockResolvedValueOnce('') // git branch
        .mockRejectedValueOnce(new Error('boom during attach')) // worktree add
      mockGitInstance.branch.mockRejectedValue(new Error('delete failed'))
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeAddNewBranch'](null, '/repo', '/wt', 'feature/x', 'main')
      expect(result.success).toBe(false)
      expect(result.error).toContain('boom during attach')
      expect(result.error).toContain('The branch "feature/x" may remain')
    })
  })

  describe('git:worktreeList', () => {
    it('returns mock worktree in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:worktreeList'](null, '/repo')
      expect(result).toHaveLength(1)
      expect(result[0].branch).toBe('main')
    })

    it('parses worktree list output', async () => {
      mockGitInstance.raw.mockResolvedValue(
        'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo-wt\nHEAD def456\nbranch refs/heads/feature\n'
      )

      const handlers = setupHandlers()
      const result = await handlers['git:worktreeList'](null, '/repo')
      expect(result).toHaveLength(2)
      expect(result[0].path).toBe('/repo')
      expect(result[0].branch).toBe('main')
      expect(result[0].head).toBe('abc123')
      expect(result[1].branch).toBe('feature')
    })

    it('returns empty array on error', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:worktreeList'](null, '/repo')).toEqual([])
    })
  })

  describe('git:pushNewBranch', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:pushNewBranch'](null, '/repo', 'branch')).toEqual({ success: true })
    })

    it('pushes with an empty-lease + explicit refspec so it can never advance an existing remote', async () => {
      mockGitInstance.push.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      await handlers['git:pushNewBranch'](null, '/repo', 'feature')
      expect(mockGitInstance.push).toHaveBeenCalledWith([
        '--set-upstream',
        '--force-with-lease=refs/heads/feature:',
        'origin',
        'refs/heads/feature:refs/heads/feature',
      ])
    })

    it('returns friendly error on directory file conflict', async () => {
      mockGitInstance.push.mockRejectedValue(new Error(
        '! refs/heads/release:refs/heads/release [remote rejected] (directory file conflict)'
      ))
      const handlers = setupHandlers()
      const result = await handlers['git:pushNewBranch'](null, '/repo', 'release')
      expect(result.success).toBe(false)
      expect(result.error).toContain('conflicts with existing branches')
      expect(result.error).toContain('"release/"')
      expect(result.error).toContain('feature/release')
      // Should NOT contain the raw git error
      expect(result.error).not.toContain('refs/heads')
    })

    it('returns error with auth hint on generic push failure', async () => {
      mockGitInstance.push.mockRejectedValue(new Error('Authentication failed'))
      mockGitInstance.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { push: 'https://github.com/org/repo.git' } },
      ])
      const handlers = setupHandlers()
      const result = await handlers['git:pushNewBranch'](null, '/repo', 'feature')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Authentication failed')
    })

    it('maps a rejection to BRANCH_EXISTS only when ls-remote (against the push url) confirms the ref', async () => {
      mockGitInstance.push.mockRejectedValue(new Error(
        '! refs/heads/fix/lint:refs/heads/fix/lint [rejected] (stale info)'
      ))
      mockGitInstance.raw.mockResolvedValue('git@example.com:org/repo.git') // remote get-url --push origin
      mockGitInstance.listRemote.mockResolvedValue('abc123\trefs/heads/fix/lint\n')
      const handlers = setupHandlers()
      const result = await handlers['git:pushNewBranch'](null, '/repo', 'fix/lint')
      expect(result.success).toBe(false)
      expect(result.error).toContain('BRANCH_EXISTS:')
      expect(result.error).toContain('"fix/lint"')
      // Probed the resolved PUSH url, not necessarily the fetch remote.
      expect(mockGitInstance.listRemote).toHaveBeenCalledWith(['--heads', 'git@example.com:org/repo.git', 'refs/heads/fix/lint'])
    })

    it('surfaces the real error when a rejection is NOT a branch collision (absent remote ref)', async () => {
      mockGitInstance.push.mockRejectedValue(new Error('remote: pre-receive hook declined [remote rejected]'))
      mockGitInstance.raw.mockResolvedValue('origin-url') // remote get-url --push origin
      mockGitInstance.listRemote.mockResolvedValue('') // no matching remote ref → a hook/policy refused
      const handlers = setupHandlers()
      const result = await handlers['git:pushNewBranch'](null, '/repo', 'feature')
      expect(result.success).toBe(false)
      expect(result.error).not.toContain('BRANCH_EXISTS:')
      expect(result.error).toContain('pre-receive hook declined')
    })

    it('does not classify (surfaces the real error) when origin has multiple push urls', async () => {
      mockGitInstance.push.mockRejectedValue(new Error('! [rejected] (stale info)'))
      mockGitInstance.raw.mockResolvedValue('url-1\nurl-2') // two push urls → ambiguous which rejected
      const handlers = setupHandlers()
      const result = await handlers['git:pushNewBranch'](null, '/repo', 'feature')
      expect(result.success).toBe(false)
      expect(result.error).not.toContain('BRANCH_EXISTS:')
      expect(mockGitInstance.listRemote).not.toHaveBeenCalled()
    })

    it('returns friendly error on cannot lock ref', async () => {
      mockGitInstance.push.mockRejectedValue(new Error(
        'cannot lock ref \'refs/heads/release\': \'refs/heads/release/linux\' exists'
      ))
      const handlers = setupHandlers()
      const result = await handlers['git:pushNewBranch'](null, '/repo', 'release')
      expect(result.success).toBe(false)
      expect(result.error).toContain('conflicts with existing branches')
    })
  })

  describe('git:defaultBranch', () => {
    it('returns main in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:defaultBranch'](null, '/repo')).toBe('main')
    })

    it('resolves from symbolic ref', async () => {
      mockGitInstance.raw.mockResolvedValue('refs/remotes/origin/develop\n')
      const handlers = setupHandlers()
      expect(await handlers['git:defaultBranch'](null, '/repo')).toBe('develop')
    })

    it('asks origin when the symbolic ref is missing', async () => {
      mockGitInstance.raw
        .mockRejectedValueOnce(new Error('no ref'))
        .mockResolvedValueOnce('ref: refs/heads/trunk\tHEAD\nabc123\tHEAD\n') // ls-remote --symref
      const handlers = setupHandlers()
      expect(await handlers['git:defaultBranch'](null, '/repo')).toBe('trunk')
    })

    it('falls back to main when symbolic ref fails', async () => {
      mockGitInstance.raw.mockRejectedValueOnce(new Error('no ref'))
        .mockRejectedValueOnce(new Error('remote unreachable')) // ls-remote --symref
        .mockResolvedValueOnce('') // rev-parse --verify main succeeds
      const handlers = setupHandlers()
      expect(await handlers['git:defaultBranch'](null, '/repo')).toBe('main')
    })

    it('falls back to master when main does not exist', async () => {
      mockGitInstance.raw
        .mockRejectedValueOnce(new Error('no ref'))
        .mockRejectedValueOnce(new Error('remote unreachable')) // ls-remote --symref
        .mockRejectedValueOnce(new Error('no main'))
        .mockResolvedValueOnce('') // rev-parse --verify master succeeds
      const handlers = setupHandlers()
      expect(await handlers['git:defaultBranch'](null, '/repo')).toBe('master')
    })

    it('returns main when everything fails', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:defaultBranch'](null, '/repo')).toBe('main')
    })
  })

  describe('git:remoteUrl', () => {
    it('returns mock URL in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:remoteUrl'](null, '/repo')).toBe('git@github.com:user/demo-project.git')
    })

    it('returns origin fetch URL', async () => {
      mockGitInstance.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'https://github.com/org/repo.git', push: 'https://github.com/org/repo.git' } },
      ])
      const handlers = setupHandlers()
      expect(await handlers['git:remoteUrl'](null, '/repo')).toBe('https://github.com/org/repo.git')
    })

    it('returns null when no origin remote', async () => {
      mockGitInstance.getRemotes.mockResolvedValue([
        { name: 'upstream', refs: { fetch: 'url' } },
      ])
      const handlers = setupHandlers()
      expect(await handlers['git:remoteUrl'](null, '/repo')).toBeNull()
    })
  })

  describe('git:headCommit', () => {
    it('returns mock hash in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:headCommit'](null, '/repo')).toBe('abc1234567890')
    })

    it('returns latest commit hash', async () => {
      mockGitInstance.log.mockResolvedValue({ latest: { hash: 'abc' } })
      const handlers = setupHandlers()
      expect(await handlers['git:headCommit'](null, '/repo')).toBe('abc')
    })

    it('returns null on error', async () => {
      mockGitInstance.log.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:headCommit'](null, '/repo')).toBeNull()
    })
  })

  describe('git:listBranches', () => {
    it('returns mock branches in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['git:listBranches'](null, '/repo')
      expect(result).toHaveLength(4)
      expect(result[0].name).toBe('main')
      expect(result[0].current).toBe(true)
    })

    it('parses branch summary in normal mode', async () => {
      mockGitInstance.branch.mockResolvedValue({
        branches: {
          'main': { current: true },
          'feature': { current: false },
          'remotes/origin/main': { current: false },
          'remotes/origin/HEAD': { current: false },
        },
      })

      const handlers = setupHandlers()
      const result = await handlers['git:listBranches'](null, '/repo')
      // HEAD should be filtered out
      expect(result).toHaveLength(3)
      expect(result[0].name).toBe('main')
      expect(result[0].isRemote).toBe(false)
      expect(result[2].name).toBe('origin/main')
      expect(result[2].isRemote).toBe(true)
    })

    it('returns empty array on error', async () => {
      mockGitInstance.branch.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:listBranches'](null, '/repo')).toEqual([])
    })
  })

  describe('git:fetchBranch', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:fetchBranch'](null, '/repo', 'main')).toEqual({ success: true })
    })

    it('fetches branch in normal mode', async () => {
      mockGitInstance.fetch.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      expect(await handlers['git:fetchBranch'](null, '/repo', 'main')).toEqual({ success: true })
      expect(mockGitInstance.fetch).toHaveBeenCalledWith('origin', 'main')
    })
  })

  describe('git:fetchReviewPrHead', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:fetchReviewPrHead'](null, '/repo', 42)).toEqual({ success: true })
    })

    it('fetches PR head with target branch', async () => {
      mockGitInstance.fetch.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      await handlers['git:fetchReviewPrHead'](null, '/repo', 42, 'pr-branch')
      expect(mockGitInstance.fetch).toHaveBeenCalledWith('origin', '+pull/42/head:refs/remotes/origin/pr-branch')
    })

    it('fetches PR head without target branch', async () => {
      mockGitInstance.fetch.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      await handlers['git:fetchReviewPrHead'](null, '/repo', 42)
      expect(mockGitInstance.fetch).toHaveBeenCalledWith('origin', 'pull/42/head')
    })
  })

  describe('git:syncReviewBranch', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:syncReviewBranch'](null, '/repo', 'branch', 42)).toEqual({ success: true })
    })

    it('fetches by branch name first (same-repo PR) and resets', async () => {
      mockGitInstance.fetch.mockResolvedValue(undefined)
      mockGitInstance.reset.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:syncReviewBranch'](null, '/repo', 'feature', 42)
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.fetch).toHaveBeenCalledWith('origin', 'feature')
      expect(mockGitInstance.reset).toHaveBeenCalledWith(['--hard', 'origin/feature'])
    })

    it('falls back to PR ref on branch fetch failure', async () => {
      mockGitInstance.fetch.mockRejectedValueOnce(new Error('no branch'))
        .mockResolvedValueOnce(undefined)
      mockGitInstance.reset.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:syncReviewBranch'](null, '/repo', 'feature', 42)
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.fetch).toHaveBeenCalledWith('origin', '+pull/42/head:refs/remotes/origin/feature')
      expect(mockGitInstance.reset).toHaveBeenCalledWith(['--hard', 'origin/feature'])
    })
  })

  describe('git:isMergedInto', () => {
    it('returns false in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:isMergedInto'](null, '/repo', 'main')).toBe(false)
    })

    it('returns true when rev-list count is 0', async () => {
      mockGitInstance.raw.mockResolvedValue('0\n')
      const handlers = setupHandlers()
      expect(await handlers['git:isMergedInto'](null, '/repo', 'main')).toBe(true)
    })

    it('checks content diff when commits exist', async () => {
      mockGitInstance.raw
        .mockResolvedValueOnce('2\n') // rev-list count > 0
        .mockResolvedValueOnce('abc123\n') // merge-base
        .mockResolvedValueOnce('file1.ts\nfile2.ts') // changed files (diff --name-only mergeBase HEAD)
        .mockResolvedValueOnce('') // diff output empty = merged

      const handlers = setupHandlers()
      expect(await handlers['git:isMergedInto'](null, '/repo', 'main')).toBe(true)
    })

    it('returns false on error', async () => {
      mockGitInstance.raw.mockRejectedValue(new Error('fail'))
      const handlers = setupHandlers()
      expect(await handlers['git:isMergedInto'](null, '/repo', 'main')).toBe(false)
    })
  })

  describe('git:hasBranchCommits', () => {
    it('returns false in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:hasBranchCommits'](null, '/repo', 'main')).toBe(false)
    })

    it('returns true when commits exist beyond merge-base', async () => {
      mockGitInstance.raw
        .mockResolvedValueOnce('abc123\n') // merge-base
        .mockResolvedValueOnce('3\n') // rev-list count
      const handlers = setupHandlers()
      expect(await handlers['git:hasBranchCommits'](null, '/repo', 'main')).toBe(true)
    })

    it('returns false when no commits beyond merge-base', async () => {
      mockGitInstance.raw
        .mockResolvedValueOnce('abc123\n')
        .mockResolvedValueOnce('0\n')
      const handlers = setupHandlers()
      expect(await handlers['git:hasBranchCommits'](null, '/repo', 'main')).toBe(false)
    })
  })

  describe('git:worktreeRemove', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:worktreeRemove'](null, '/repo', '/wt')).toEqual({ success: true })
    })

    it('removes worktree in normal mode', async () => {
      mockGitInstance.raw.mockResolvedValue('')
      const handlers = setupHandlers()
      const result = await handlers['git:worktreeRemove'](null, '/repo', '/wt')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.raw).toHaveBeenCalledWith(['worktree', 'remove', '--force', '/wt'])
    })
  })

  describe('git:deleteBranch', () => {
    it('returns success in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      expect(await handlers['git:deleteBranch'](null, '/repo', 'branch')).toEqual({ success: true })
    })

    it('deletes branch in normal mode', async () => {
      mockGitInstance.branch.mockResolvedValue(undefined)
      const handlers = setupHandlers()
      const result = await handlers['git:deleteBranch'](null, '/repo', 'old-branch')
      expect(result).toEqual({ success: true })
      expect(mockGitInstance.branch).toHaveBeenCalledWith(['-D', 'old-branch'])
    })

    it('returns error on failure', async () => {
      mockGitInstance.branch.mockRejectedValue(new Error('branch in use'))
      const handlers = setupHandlers()
      const result = await handlers['git:deleteBranch'](null, '/repo', 'branch')
      expect(result).toEqual({ success: false, error: expect.stringContaining('branch in use') })
    })
  })
})
