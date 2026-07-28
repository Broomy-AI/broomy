import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRepoInitScript, type RepoForInitScript } from './runRepoInitScript'

const repo: RepoForInitScript = { id: 'r1', name: 'broomy', rootDir: '/repos/broomy', defaultBranch: 'main' }

beforeEach(() => {
  window.repos = { getInitScript: vi.fn().mockResolvedValue('pnpm install') } as never
  window.shell = { exec: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 }) } as never
})

describe('runRepoInitScript', () => {
  it('runs the script in the worktree with BROOMY_ variables', async () => {
    await runRepoInitScript(repo, '/repos/broomy/wt/fix-login', { issue: { number: 7, title: 'Login broken' } })
    expect(window.shell.exec).toHaveBeenCalledWith('pnpm install', '/repos/broomy/wt/fix-login', expect.objectContaining({
      BROOMY_DIRECTORY: '/repos/broomy/wt/fix-login',
      BROOMY_FOLDER_NAME: 'fix-login',
      BROOMY_REPO_NAME: 'broomy',
      BROOMY_REPO_ROOT: '/repos/broomy',
      BROOMY_ISSUE_NUMBER: '7',
      BROOMY_ISSUE_TITLE: 'Login broken',
    }))
  })

  it('omits variables that are not set at init time', async () => {
    await runRepoInitScript(repo, '/repos/broomy/wt/x')
    const env = vi.mocked(window.shell.exec).mock.calls[0][2] as Record<string, string>
    expect(env.BROOMY_PR_NUMBER).toBeUndefined()
    expect(env.BROOMY_PR_TITLE).toBeUndefined()
    expect(env.BROOMY_SESSION_NAME).toBeUndefined()
    expect(env.BROOMY_STAGE).toBeUndefined()
  })

  it('does nothing when the repo has no init script', async () => {
    vi.mocked(window.repos.getInitScript).mockResolvedValue(null)
    await runRepoInitScript(repo, '/repos/broomy/wt/x')
    expect(window.shell.exec).not.toHaveBeenCalled()
  })

  it('never throws when the script fails', async () => {
    vi.mocked(window.shell.exec).mockRejectedValue(new Error('boom'))
    await expect(runRepoInitScript(repo, '/repos/broomy/wt/x')).resolves.toBeUndefined()
  })

  it('never throws when reading the script fails', async () => {
    vi.mocked(window.repos.getInitScript).mockRejectedValue(new Error('nope'))
    await expect(runRepoInitScript(repo, '/repos/broomy/wt/x')).resolves.toBeUndefined()
  })
})
