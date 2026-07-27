/**
 * IPC handlers for git branch operations: clone, worktree, checkout, and branch creation.
 */
import { IpcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import simpleGit from 'simple-git'
import { existsSync } from 'fs'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import { getCloneErrorHint, getGitAuthHint } from '../cloneErrorHint'
import { normalizePath } from '../platform'
import { HandlerContext, expandHomePath } from './types'
import { getDefaultBranch } from './gitUtils'

const execFileAsync = promisify(execFile)

/** Set env vars to prevent SSH/HTTPS prompts that would hang in Electron.
 *  Spreads process.env so credential helpers retain access to HOME, PATH,
 *  DBUS_SESSION_BUS_ADDRESS, etc. — required on Linux for keyring-based auth. */
function withNonInteractive(git: ReturnType<typeof simpleGit>) {
  return git.env({ ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' })
}

async function handleClone(ctx: HandlerContext, url: string, targetDir: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  const expandedTarget = expandHomePath(targetDir)

  try {
    // Ensure the parent directory exists. Without this, cloning into a path
    // like ~/repos/foo/main when ~/repos doesn't exist fails with a cryptic
    // git error. recursive:true is a no-op when the path already exists.
    await mkdir(dirname(expandedTarget), { recursive: true })
  } catch (error) {
    return { success: false, error: `Could not create parent folder for clone: ${String(error)}` }
  }

  try {
    await withNonInteractive(simpleGit()).clone(url, expandedTarget)
    return { success: true }
  } catch (error) {
    const errorStr = String(error)
    let ghAvailable = true
    let ghAuthenticated = false
    try {
      await execFileAsync('gh', ['--version'], { encoding: 'utf-8' })
      try {
        await execFileAsync('gh', ['auth', 'status'], { encoding: 'utf-8', timeout: 5000 })
        ghAuthenticated = true
      } catch { /* not authenticated */ }
    } catch {
      ghAvailable = false
    }
    let credentialHelper: string | undefined
    try {
      // Use --get-regexp to find both global and URL-scoped credential helpers
      const { stdout } = await execFileAsync('git', ['config', '--get-regexp', 'credential.*helper'], { encoding: 'utf-8' })
      credentialHelper = stdout.trim()
    } catch { /* no credential helper configured */ }
    const hint = getCloneErrorHint(errorStr, url, { ghAvailable, ghAuthenticated, credentialHelper })
    return { success: false, error: hint ? errorStr + hint : errorStr }
  }
}

async function handleWorktreeAdd(ctx: HandlerContext, repoPath: string, worktreePath: string, branchName: string, baseBranch: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const expandedRepoPath = expandHomePath(repoPath)
    if (!existsSync(expandedRepoPath)) {
      return {
        success: false,
        error: `The main worktree directory was not found at "${repoPath}". This can happen if the repo's default branch name (e.g. "master") doesn't match the worktree folder name ("main"). Try removing the repo in Settings and re-adding it.`,
      }
    }
    const git = simpleGit(expandedRepoPath)
    const expandedPath = expandHomePath(worktreePath)

    // Try checking out the branch directly first (works for existing local
    // branches and remote-only branches via git's DWIM). Fall back to -b for
    // truly new branches.
    try {
      await git.raw(['worktree', 'add', expandedPath, branchName])
    } catch (firstErr) {
      const firstErrStr = String(firstErr)
      // Ref path conflict: git stores branches as files on disk, so e.g. a
      // local "release" branch (a file) prevents creating "release/linux"
      // (which needs "release/" as a directory). Surface a clear message.
      if (firstErrStr.includes('cannot create') || firstErrStr.includes('cannot lock ref')) {
        // Extract the conflicting ref name from the error if possible
        const conflictMatch = /'refs\/heads\/([^']+)'.*exists/.exec(firstErrStr)
        const conflicting = conflictMatch ? `"${conflictMatch[1]}"` : 'another branch'
        throw new Error(
          `Can't check out "${branchName}" because the local branch ${conflicting} conflicts with it.\n\n` +
          `Git stores branches as file paths, so you can't have both "${branchName}" and ${conflicting} checked out locally at the same time.\n\n` +
          `To fix this, delete the ${conflicting} local branch (if you're not using it) or remove its worktree, then try again.`
        )
      }
      await git.raw(['worktree', 'add', '-b', branchName, expandedPath, baseBranch])
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Whether a name is safe to create a new branch from. Rejects option-like tokens (a leading `-`,
 * which git would read as a flag — e.g. `-D` → `git branch -D <base>`, deleting the base ref) and
 * the forms git itself forbids in a ref name (see git-check-ref-format), so untrusted input can
 * never mutate the wrong ref or reach git as a flag.
 */
export function isCreatableBranchName(name: string): boolean {
  if (!name || name === '@' || name.startsWith('-')) return false
  // Control chars, space, DEL, and the characters git forbids in a ref name.
  if (/[\x00-\x1f\x7f\s~^:?*[\\]/.test(name)) return false
  if (name.includes('..') || name.includes('@{') || name.includes('//')) return false
  if (name.startsWith('/') || name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock')) return false
  // No path component may be empty, start with a dot, or end with ".lock".
  return name.split('/').every((c) => c !== '' && !c.startsWith('.') && !c.endsWith('.lock'))
}

/**
 * Create a worktree for a BRAND-NEW branch, so a collision never reuses or clobbers an existing
 * branch/worktree — unlike `handleWorktreeAdd`, whose DWIM checkout is for the attach flows
 * (Existing / Review):
 *   - Reject option-like / malformed names before any mutation; pass the base as a full ref so an
 *     option-like default branch can't be reinterpreted.
 *   1. `git branch <branch> refs/heads/<base>` — atomic; if the branch already exists → BRANCH_EXISTS,
 *      and nothing else is created.
 *   2. `git worktree add <path> <branch>` — attaches the worktree (with checkout + hook). On ANY
 *      failure we delete only the branch WE just made and NEVER remove the destination: it may be a
 *      pre-existing directory/worktree, or ours after a hook failed — either way we must not risk
 *      clobbering it. An occupied path → WORKTREE_PATH_EXISTS; other errors note any partial worktree.
 * The remote side (an existing `origin/<branch>`) is guarded separately by `handlePushNewBranch`.
 */
async function handleWorktreeAddNewBranch(ctx: HandlerContext, repoPath: string, worktreePath: string, branchName: string, baseBranch: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  const expandedRepoPath = expandHomePath(repoPath)
  if (!existsSync(expandedRepoPath)) {
    return {
      success: false,
      error: `The main worktree directory was not found at "${repoPath}". This can happen if the repo's default branch name (e.g. "master") doesn't match the worktree folder name ("main"). Try removing the repo in Settings and re-adding it.`,
    }
  }
  if (!isCreatableBranchName(branchName) || !isCreatableBranchName(baseBranch)) {
    return { success: false, error: `Invalid branch name "${!isCreatableBranchName(branchName) ? branchName : baseBranch}".` }
  }
  const git = simpleGit(expandedRepoPath)
  const expandedPath = expandHomePath(worktreePath)

  // Step 1: create the branch ref atomically. Base as a full ref so an option-like default branch
  // can never be reparsed as a flag.
  try {
    await git.raw(['branch', branchName, `refs/heads/${baseBranch}`])
  } catch (err) {
    const errStr = String(err)
    if (errStr.includes('already exists')) {
      return { success: false, error: `BRANCH_EXISTS:A local branch "${branchName}" already exists. Open that session instead, or pick a different name.` }
    }
    return { success: false, error: errStr }
  }

  // Step 2: attach the worktree. On failure, delete only OUR branch and never remove the path — a
  // pre-existing directory/worktree (even a stale registration) must never be clobbered.
  try {
    await git.raw(['worktree', 'add', expandedPath, branchName])
  } catch (err) {
    const errStr = String(err)
    let leftover = ''
    try { await git.branch(['-D', branchName]) } catch { leftover += ` The branch "${branchName}" may remain.` }
    if (errStr.includes('already exists') || errStr.includes('already used') || errStr.includes('already registered')) {
      return { success: false, error: `WORKTREE_PATH_EXISTS:A folder already exists at "${worktreePath}". Remove or rename it, then try again.${leftover}` }
    }
    return { success: false, error: `${errStr} A partial worktree may remain at "${worktreePath}" — remove it if present.${leftover}` }
  }

  return { success: true }
}

async function handleWorktreeList(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return [
      { path: repoPath, branch: 'main', head: 'abc1234' },
    ]
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const raw = await git.raw(['worktree', 'list', '--porcelain'])
    const worktrees: { path: string; branch: string; head: string }[] = []
    let current: { path: string; branch: string; head: string } = { path: '', branch: '', head: '' }

    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current)
        current = { path: normalizePath(line.slice(9)), branch: '', head: '' }
      } else if (line.startsWith('HEAD ')) {
        current.head = line.slice(5)
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(7).replace('refs/heads/', '')
      } else if (line === '' && current.path) {
        worktrees.push(current)
        current = { path: '', branch: '', head: '' }
      }
    }
    if (current.path) worktrees.push(current)

    return worktrees
  } catch {
    return []
  }
}

async function handlePushNewBranch(ctx: HandlerContext, repoPath: string, branchName: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = withNonInteractive(simpleGit(expandHomePath(repoPath)))
    // Empty-expectation lease requires the remote ref to be ABSENT, so a plain fast-forward can
    // never advance an existing remote branch; the fully-qualified refspec bypasses push.default
    // (and any tag of the same name).
    await git.push([
      '--set-upstream',
      `--force-with-lease=refs/heads/${branchName}:`,
      'origin',
      `refs/heads/${branchName}:refs/heads/${branchName}`,
    ])
    return { success: true }
  } catch (error) {
    const errorStr = String(error)

    // Detect ref namespace conflicts (e.g. trying to create "release" when "release/linux" exists)
    if (errorStr.includes('directory file conflict') || errorStr.includes('cannot lock ref')) {
      return {
        success: false,
        error: `Branch name "${branchName}" conflicts with existing branches on the remote.\n\nThis happens when the remote already has branches that start with "${branchName}/" (e.g. "${branchName}/something"), so Git can't create a branch with that exact name.\n\nTry using a prefix like "feature/${branchName}" or "work/${branchName}" instead.`,
      }
    }

    // Detect permission denied — user doesn't have write access to the repo
    if ((errorStr.includes('Permission to') && errorStr.includes('denied to'))
      || errorStr.includes('The requested URL returned error: 403')
      || errorStr.includes('remote: Permission')) {
      return {
        success: false,
        error: 'NO_WRITE_ACCESS:You don\'t have write access to this repository. Fork it on GitHub and clone your fork instead.',
      }
    }

    // A rejection here is either the lease firing (the remote ref already exists) or a policy/hook
    // refusing an otherwise-absent ref — both say "rejected". Only the former is a real branch
    // collision, so confirm with a read-only ls-remote instead of trusting the word.
    if (errorStr.includes('rejected') || errorStr.includes('stale info') || errorStr.includes('non-fast-forward')) {
      let remoteExists = false
      try {
        // Non-interactive (a credential helper can't prompt/hang here, as with the push above), and
        // against the PUSH url(s) — push may target different url(s) than fetch. Only classify when
        // there is exactly one push url; with several, `git push origin` hit them all and a single
        // probe can't say which rejected, so leave it unclassified and surface the real push error.
        const g = withNonInteractive(simpleGit(expandHomePath(repoPath)))
        const urls = (await g.raw(['remote', 'get-url', '--push', '--all', 'origin'])).split(/\r?\n/).map(u => u.trim()).filter(Boolean)
        if (urls.length === 1) {
          const refs = await g.listRemote(['--heads', urls[0], `refs/heads/${branchName}`])
          remoteExists = refs.trim().length > 0
        }
      } catch { /* probe failed — fall through and surface the original push error */ }
      if (remoteExists) {
        return {
          success: false,
          error: `BRANCH_EXISTS:The remote branch "${branchName}" already exists. Create a session from it instead, or pick a different name.`,
        }
      }
      // Absent remote ref → a hook or branch-protection policy refused the push; surface it verbatim.
      return { success: false, error: errorStr }
    }

    let url: string | undefined
    try {
      const remotes = await simpleGit(expandHomePath(repoPath)).getRemotes(true)
      url = remotes.find(r => r.name === 'origin')?.refs.push
    } catch { /* ignore */ }
    let ghAvailable = true
    let ghAuthenticated = false
    try {
      await execFileAsync('gh', ['--version'], { encoding: 'utf-8' })
      try {
        await execFileAsync('gh', ['auth', 'status'], { encoding: 'utf-8', timeout: 5000 })
        ghAuthenticated = true
      } catch { /* not authenticated */ }
    } catch {
      ghAvailable = false
    }
    let credentialHelper: string | undefined
    try {
      // Use --get-regexp to find both global and URL-scoped credential helpers
      const { stdout } = await execFileAsync('git', ['config', '--get-regexp', 'credential.*helper'], { encoding: 'utf-8', cwd: expandHomePath(repoPath) })
      credentialHelper = stdout.trim()
    } catch { /* no credential helper configured */ }
    const hint = getGitAuthHint(errorStr, { url, ghAvailable, ghAuthenticated, credentialHelper })
    return { success: false, error: hint ? errorStr + hint : errorStr }
  }
}

async function handleDefaultBranch(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return 'main'
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    return await getDefaultBranch(git)
  } catch {
    return 'main'
  }
}

async function handleRemoteUrl(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return 'git@github.com:user/demo-project.git'
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const remotes = await git.getRemotes(true)
    const origin = remotes.find(r => r.name === 'origin')
    return origin?.refs.fetch || null
  } catch {
    return null
  }
}

async function handleHeadCommit(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return 'abc1234567890'
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const log = await git.log({ maxCount: 1 })
    return log.latest?.hash || null
  } catch {
    return null
  }
}

async function handleListBranches(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return [
      { name: 'main', isRemote: false, current: true },
      { name: 'feature/auth', isRemote: false, current: false },
      { name: 'origin/main', isRemote: true, current: false },
      { name: 'origin/feature/old-branch', isRemote: true, current: false },
    ]
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const branchSummary = await git.branch(['-a', '--sort=-committerdate'])

    const branches: { name: string; isRemote: boolean; current: boolean }[] = []

    for (const [name, data] of Object.entries(branchSummary.branches)) {
      if (name.includes('HEAD')) continue

      const isRemote = name.startsWith('remotes/')
      const cleanName = isRemote ? name.replace('remotes/', '') : name
      const branchData = data as { current: boolean }

      branches.push({
        name: cleanName,
        isRemote,
        current: branchData.current,
      })
    }

    return branches
  } catch {
    return []
  }
}

async function handleFetchBranch(ctx: HandlerContext, repoPath: string, branchName: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = withNonInteractive(simpleGit(expandHomePath(repoPath)))
    await git.fetch('origin', branchName)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleFetchReviewPrHead(ctx: HandlerContext, repoPath: string, prNumber: number, targetBranch?: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = withNonInteractive(simpleGit(expandHomePath(repoPath)))
    if (targetBranch) {
      // Fetch into a named remote-tracking ref so origin/${targetBranch} exists
      // Use + prefix to allow non-fast-forward updates (force-pushed PRs)
      await git.fetch('origin', `+pull/${prNumber}/head:refs/remotes/origin/${targetBranch}`)
    } else {
      await git.fetch('origin', `pull/${prNumber}/head`)
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

// Fetch and reset to latest changes for a PR branch.
// Tries fetching by branch name first (same-repo PRs), falls back to PR ref (fork PRs).
// Uses reset --hard instead of merge so force-pushed PRs update cleanly.
async function handleSyncReviewBranch(ctx: HandlerContext, repoPath: string, branchName: string, prNumber: number) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = withNonInteractive(simpleGit(expandHomePath(repoPath)))

    // Try fetching the branch by name (works for same-repo PRs)
    try {
      await git.fetch('origin', branchName)
    } catch {
      // Fall back to PR ref (fork PRs) - fetch into named ref so origin/${branchName} updates
      // Use + prefix to allow non-fast-forward updates (force-pushed PRs)
      await git.fetch('origin', `+pull/${prNumber}/head:refs/remotes/origin/${branchName}`)
    }

    // Reset to match remote — review branches shouldn't have local commits
    await git.reset(['--hard', `origin/${branchName}`])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleIsMergedInto(ctx: HandlerContext, repoPath: string, ref: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return process.env.E2E_MOCK_IS_MERGED === 'true'
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))

    const output = await git.raw(['rev-list', '--count', 'HEAD', `^origin/${ref}`])
    if (parseInt(output.trim(), 10) === 0) {
      return true
    }

    try {
      const mergeBase = (await git.raw(['merge-base', `origin/${ref}`, 'HEAD'])).trim()
      const changedFiles = (await git.raw(['diff', '--name-only', mergeBase, 'HEAD'])).trim()
      if (!changedFiles) {
        return true
      }
      const fileList = changedFiles.split(/\r?\n/)
      // Check if origin/ref has the same content for all files changed on this branch.
      // Use --name-only instead of --quiet because simple-git doesn't throw on exit code 1.
      const diffOutput = (await git.raw(['diff', '--name-only', `origin/${ref}`, 'HEAD', '--', ...fileList])).trim()
      return diffOutput.length === 0
    } catch {
      return false
    }
  } catch {
    return false
  }
}

async function handleHasBranchCommits(ctx: HandlerContext, repoPath: string, ref: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return process.env.E2E_MOCK_HAS_BRANCH_COMMITS === 'true'
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const mergeBase = (await git.raw(['merge-base', `origin/${ref}`, 'HEAD'])).trim()
    const output = await git.raw(['rev-list', '--count', `${mergeBase}..HEAD`])
    return parseInt(output.trim(), 10) > 0
  } catch {
    return false
  }
}

async function handleWorktreeRemove(ctx: HandlerContext, repoPath: string, worktreePath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    await git.raw(['worktree', 'remove', '--force', expandHomePath(worktreePath)])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleDeleteBranch(ctx: HandlerContext, repoPath: string, branchName: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    await git.branch(['-D', branchName])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('git:clone', (_event, url: string, targetDir: string) => handleClone(ctx, url, targetDir))
  ipcMain.handle('git:worktreeAdd', (_event, repoPath: string, worktreePath: string, branchName: string, baseBranch: string) => handleWorktreeAdd(ctx, repoPath, worktreePath, branchName, baseBranch))
  ipcMain.handle('git:worktreeAddNewBranch', (_event, repoPath: string, worktreePath: string, branchName: string, baseBranch: string) => handleWorktreeAddNewBranch(ctx, repoPath, worktreePath, branchName, baseBranch))
  ipcMain.handle('git:worktreeList', (_event, repoPath: string) => handleWorktreeList(ctx, repoPath))
  ipcMain.handle('git:pushNewBranch', (_event, repoPath: string, branchName: string) => handlePushNewBranch(ctx, repoPath, branchName))
  ipcMain.handle('git:defaultBranch', (_event, repoPath: string) => handleDefaultBranch(ctx, repoPath))
  ipcMain.handle('git:remoteUrl', (_event, repoPath: string) => handleRemoteUrl(ctx, repoPath))
  ipcMain.handle('git:headCommit', (_event, repoPath: string) => handleHeadCommit(ctx, repoPath))
  ipcMain.handle('git:listBranches', (_event, repoPath: string) => handleListBranches(ctx, repoPath))
  ipcMain.handle('git:fetchBranch', (_event, repoPath: string, branchName: string) => handleFetchBranch(ctx, repoPath, branchName))
  ipcMain.handle('git:fetchReviewPrHead', (_event, repoPath: string, prNumber: number, targetBranch?: string) => handleFetchReviewPrHead(ctx, repoPath, prNumber, targetBranch))
  ipcMain.handle('git:syncReviewBranch', (_event, repoPath: string, branchName: string, prNumber: number) => handleSyncReviewBranch(ctx, repoPath, branchName, prNumber))
  ipcMain.handle('git:isMergedInto', (_event, repoPath: string, ref: string) => handleIsMergedInto(ctx, repoPath, ref))
  ipcMain.handle('git:hasBranchCommits', (_event, repoPath: string, ref: string) => handleHasBranchCommits(ctx, repoPath, ref))
  ipcMain.handle('git:worktreeRemove', (_event, repoPath: string, worktreePath: string) => handleWorktreeRemove(ctx, repoPath, worktreePath))
  ipcMain.handle('git:deleteBranch', (_event, repoPath: string, branchName: string) => handleDeleteBranch(ctx, repoPath, branchName))
}
