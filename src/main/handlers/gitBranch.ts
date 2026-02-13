import { IpcMain } from 'electron'
import simpleGit from 'simple-git'
import { getCloneErrorHint } from '../cloneErrorHint'
import { normalizePath } from '../platform'
import { HandlerContext, expandHomePath } from './types'

async function handleClone(ctx: HandlerContext, url: string, targetDir: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    await simpleGit().clone(url, expandHomePath(targetDir))
    return { success: true }
  } catch (error) {
    const errorStr = String(error)
    const hint = getCloneErrorHint(errorStr, url)
    return { success: false, error: hint ? errorStr + hint : errorStr }
  }
}

async function handleWorktreeAdd(ctx: HandlerContext, repoPath: string, worktreePath: string, branchName: string, baseBranch: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    await git.raw(['worktree', 'add', '-b', branchName, expandHomePath(worktreePath), baseBranch])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleWorktreeList(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest) {
    return [
      { path: repoPath, branch: 'main', head: 'abc1234' },
    ]
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const raw = await git.raw(['worktree', 'list', '--porcelain'])
    const worktrees: { path: string; branch: string; head: string }[] = []
    let current: { path: string; branch: string; head: string } = { path: '', branch: '', head: '' }

    for (const line of raw.split('\n')) {
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
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    await git.push(['--set-upstream', 'origin', branchName])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleDefaultBranch(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest) {
    return 'main'
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    try {
      const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
      return ref.trim().replace('refs/remotes/origin/', '')
    } catch {
      try {
        await git.raw(['rev-parse', '--verify', 'main'])
        return 'main'
      } catch {
        try {
          await git.raw(['rev-parse', '--verify', 'master'])
          return 'master'
        } catch {
          return 'main'
        }
      }
    }
  } catch {
    return 'main'
  }
}

async function handleRemoteUrl(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest) {
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
  if (ctx.isE2ETest) {
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
  if (ctx.isE2ETest) {
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

      branches.push({
        name: cleanName,
        isRemote,
        current: data.current,
      })
    }

    return branches
  } catch {
    return []
  }
}

async function handleFetchBranch(ctx: HandlerContext, repoPath: string, branchName: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    await git.fetch('origin', branchName)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleFetchPrHead(ctx: HandlerContext, repoPath: string, prNumber: number, targetBranch?: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    if (targetBranch) {
      // Fetch into a named remote-tracking ref so origin/${targetBranch} exists
      await git.fetch('origin', `pull/${prNumber}/head:refs/remotes/origin/${targetBranch}`)
    } else {
      await git.fetch('origin', `pull/${prNumber}/head`)
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

// Fetch and merge latest changes for a PR branch.
// Tries fetching by branch name first (same-repo PRs), falls back to PR ref (fork PRs).
// For fork PRs, updates the remote-tracking ref so origin/${branchName} stays current.
async function handlePullPrBranch(ctx: HandlerContext, repoPath: string, branchName: string, prNumber: number) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))

    // Try fetching the branch by name (works for same-repo PRs)
    try {
      await git.fetch('origin', branchName)
      await git.merge([`origin/${branchName}`])
      return { success: true }
    } catch {
      // Fall back to PR ref (fork PRs) - fetch into named ref so origin/${branchName} updates
      await git.fetch('origin', `pull/${prNumber}/head:refs/remotes/origin/${branchName}`)
      await git.merge([`origin/${branchName}`])
      return { success: true }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleIsMergedInto(ctx: HandlerContext, repoPath: string, ref: string) {
  if (ctx.isE2ETest) {
    return false
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
      const fileList = changedFiles.split('\n')
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
  if (ctx.isE2ETest) {
    return false
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
  if (ctx.isE2ETest) {
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
  if (ctx.isE2ETest) {
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
  ipcMain.handle('git:worktreeList', (_event, repoPath: string) => handleWorktreeList(ctx, repoPath))
  ipcMain.handle('git:pushNewBranch', (_event, repoPath: string, branchName: string) => handlePushNewBranch(ctx, repoPath, branchName))
  ipcMain.handle('git:defaultBranch', (_event, repoPath: string) => handleDefaultBranch(ctx, repoPath))
  ipcMain.handle('git:remoteUrl', (_event, repoPath: string) => handleRemoteUrl(ctx, repoPath))
  ipcMain.handle('git:headCommit', (_event, repoPath: string) => handleHeadCommit(ctx, repoPath))
  ipcMain.handle('git:listBranches', (_event, repoPath: string) => handleListBranches(ctx, repoPath))
  ipcMain.handle('git:fetchBranch', (_event, repoPath: string, branchName: string) => handleFetchBranch(ctx, repoPath, branchName))
  ipcMain.handle('git:fetchPrHead', (_event, repoPath: string, prNumber: number, targetBranch?: string) => handleFetchPrHead(ctx, repoPath, prNumber, targetBranch))
  ipcMain.handle('git:pullPrBranch', (_event, repoPath: string, branchName: string, prNumber: number) => handlePullPrBranch(ctx, repoPath, branchName, prNumber))
  ipcMain.handle('git:isMergedInto', (_event, repoPath: string, ref: string) => handleIsMergedInto(ctx, repoPath, ref))
  ipcMain.handle('git:hasBranchCommits', (_event, repoPath: string, ref: string) => handleHasBranchCommits(ctx, repoPath, ref))
  ipcMain.handle('git:worktreeRemove', (_event, repoPath: string, worktreePath: string) => handleWorktreeRemove(ctx, repoPath, worktreePath))
  ipcMain.handle('git:deleteBranch', (_event, repoPath: string, branchName: string) => handleDeleteBranch(ctx, repoPath, branchName))
}
