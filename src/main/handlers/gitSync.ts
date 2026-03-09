/**
 * IPC handlers for git sync operations: pull, push, fetch, and stash.
 */
import { IpcMain } from 'electron'
import simpleGit from 'simple-git'
import { HandlerContext, expandHomePath } from './types'
import { getScenarioData } from './scenarios'
import { getDefaultBranch } from './gitUtils'

/** Set env vars to prevent SSH/HTTPS prompts that would hang in Electron. */
function withNonInteractive(git: ReturnType<typeof simpleGit>) {
  return git.env('GIT_TERMINAL_PROMPT', '0').env('GIT_SSH_COMMAND', 'ssh -o BatchMode=yes')
}

async function handlePullOriginMain(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = withNonInteractive(simpleGit(expandHomePath(repoPath)))

    const defaultBranch = await getDefaultBranch(git)

    await git.fetch('origin', defaultBranch)

    try {
      await git.merge([`origin/${defaultBranch}`])
      return { success: true }
    } catch (mergeError) {
      const errorStr = String(mergeError)
      const hasConflicts = errorStr.includes('CONFLICTS') || errorStr.includes('Merge conflict') || errorStr.includes('fix conflicts')
      return { success: false, hasConflicts, error: errorStr }
    }
  } catch (error) {
    return { success: false, hasConflicts: false, error: String(error) }
  }
}

async function handleIsBehindMain(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { behind: 0, defaultBranch: 'main' }
  }

  try {
    const git = withNonInteractive(simpleGit(expandHomePath(repoPath)))

    const defaultBranch = await getDefaultBranch(git)

    await git.fetch('origin', defaultBranch)

    const output = await git.raw(['rev-list', '--count', `HEAD..origin/${defaultBranch}`])
    const behind = parseInt(output.trim(), 10) || 0

    return { behind, defaultBranch }
  } catch {
    return { behind: 0, defaultBranch: 'main' }
  }
}

async function handleGetConfig(ctx: HandlerContext, repoPath: string, key: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return null
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const value = await git.raw(['config', '--get', key])
    return value.trim() || null
  } catch {
    return null
  }
}

async function handleSetConfig(ctx: HandlerContext, repoPath: string, key: string, value: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    await git.raw(['config', key, value])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleSetGlobalConfig(ctx: HandlerContext, key: string, value: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = simpleGit()
    await git.raw(['config', '--global', key, value])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleBranchChanges(ctx: HandlerContext, repoPath: string, baseBranch?: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return getScenarioData(ctx.e2eScenario).branchChanges
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))

    if (!baseBranch) {
      baseBranch = await getDefaultBranch(git)
    }

    const diffOutput = await git.raw(['diff', '--name-status', `origin/${baseBranch}...HEAD`])

    const files: { path: string; status: string }[] = []
    for (const line of diffOutput.trim().split(/\r?\n/)) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      const statusChar = parts[0]
      const filePath = parts.length > 2 ? parts[2] : parts[1]

      let status = 'modified'
      switch (statusChar.charAt(0)) {
        case 'M': status = 'modified'; break
        case 'A': status = 'added'; break
        case 'D': status = 'deleted'; break
        case 'R': status = 'renamed'; break
        case 'C': status = 'added'; break
      }

      if (filePath) {
        files.push({ path: filePath, status })
      }
    }

    const mergeBase = (await git.raw(['merge-base', `origin/${baseBranch}`, 'HEAD'])).trim()

    return { files, baseBranch, mergeBase }
  } catch {
    return { files: [], baseBranch: baseBranch || 'main', mergeBase: '' }
  }
}

async function handleBranchCommits(ctx: HandlerContext, repoPath: string, baseBranch?: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return getScenarioData(ctx.e2eScenario).branchCommits
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))

    if (!baseBranch) {
      baseBranch = await getDefaultBranch(git)
    }

    const SEP = '<<SEP>>'
    const logOutput = await git.raw([
      'log',
      `origin/${baseBranch}..HEAD`,
      `--pretty=format:%H${SEP}%h${SEP}%s${SEP}%an${SEP}%aI`,
    ])

    // Determine which commits have been pushed to the remote tracking branch
    const pushedHashes = new Set<string>()
    try {
      const currentBranch = (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      await git.raw(['rev-parse', '--verify', `origin/${currentBranch}`])
      // Tracking branch exists — get commits that are on the remote tracking branch (ahead of base)
      const remoteLog = await git.raw([
        'log',
        `origin/${baseBranch}..origin/${currentBranch}`,
        '--pretty=format:%H',
      ])
      for (const h of remoteLog.trim().split(/\r?\n/)) {
        if (h.trim()) pushedHashes.add(h.trim())
      }
    } catch {
      // No remote tracking branch — all commits are local-only
    }

    const commits: { hash: string; shortHash: string; message: string; author: string; date: string; pushed: boolean }[] = []
    for (const line of logOutput.trim().split(/\r?\n/)) {
      if (!line.trim()) continue
      const parts = line.split(SEP)
      if (parts.length >= 5) {
        commits.push({
          hash: parts[0],
          shortHash: parts[1],
          message: parts[2],
          author: parts[3],
          date: parts[4],
          pushed: pushedHashes.has(parts[0]),
        })
      }
    }

    return { commits, baseBranch }
  } catch {
    return { commits: [], baseBranch: baseBranch || 'main' }
  }
}

async function handleCommitFiles(ctx: HandlerContext, repoPath: string, commitHash: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return [
      { path: 'src/index.ts', status: 'modified' },
      { path: 'src/utils.ts', status: 'added' },
    ]
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const output = await git.raw(['diff-tree', '--no-commit-id', '--name-status', '-r', commitHash])

    const files: { path: string; status: string }[] = []
    for (const line of output.trim().split(/\r?\n/)) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      const statusChar = parts[0]
      const filePath = parts.length > 2 ? parts[2] : parts[1]

      let status = 'modified'
      switch (statusChar.charAt(0)) {
        case 'M': status = 'modified'; break
        case 'A': status = 'added'; break
        case 'D': status = 'deleted'; break
        case 'R': status = 'renamed'; break
        case 'C': status = 'added'; break
      }

      if (filePath) {
        files.push({ path: filePath, status })
      }
    }

    return files
  } catch {
    return []
  }
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('git:pullOriginMain', (_event, repoPath: string) => handlePullOriginMain(ctx, repoPath))
  ipcMain.handle('git:isBehindMain', (_event, repoPath: string) => handleIsBehindMain(ctx, repoPath))
  ipcMain.handle('git:getConfig', (_event, repoPath: string, key: string) => handleGetConfig(ctx, repoPath, key))
  ipcMain.handle('git:setConfig', (_event, repoPath: string, key: string, value: string) => handleSetConfig(ctx, repoPath, key, value))
  ipcMain.handle('git:setGlobalConfig', (_event, key: string, value: string) => handleSetGlobalConfig(ctx, key, value))
  ipcMain.handle('git:branchChanges', (_event, repoPath: string, baseBranch?: string) => handleBranchChanges(ctx, repoPath, baseBranch))
  ipcMain.handle('git:branchCommits', (_event, repoPath: string, baseBranch?: string) => handleBranchCommits(ctx, repoPath, baseBranch))
  ipcMain.handle('git:commitFiles', (_event, repoPath: string, commitHash: string) => handleCommitFiles(ctx, repoPath, commitHash))
}
