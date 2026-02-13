import { IpcMain } from 'electron'
import simpleGit from 'simple-git'
import { HandlerContext, expandHomePath } from './types'

async function handlePullOriginMain(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))

    let defaultBranch = 'main'
    try {
      const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
      defaultBranch = ref.trim().replace('refs/remotes/origin/', '')
    } catch {
      try {
        await git.raw(['rev-parse', '--verify', 'origin/main'])
        defaultBranch = 'main'
      } catch {
        defaultBranch = 'master'
      }
    }

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
  if (ctx.isE2ETest) {
    return { behind: 0, defaultBranch: 'main' }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))

    let defaultBranch = 'main'
    try {
      const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
      defaultBranch = ref.trim().replace('refs/remotes/origin/', '')
    } catch {
      try {
        await git.raw(['rev-parse', '--verify', 'origin/main'])
        defaultBranch = 'main'
      } catch {
        defaultBranch = 'master'
      }
    }

    await git.fetch('origin', defaultBranch)

    const output = await git.raw(['rev-list', '--count', `HEAD..origin/${defaultBranch}`])
    const behind = parseInt(output.trim(), 10) || 0

    return { behind, defaultBranch }
  } catch {
    return { behind: 0, defaultBranch: 'main' }
  }
}

async function handleGetConfig(ctx: HandlerContext, repoPath: string, key: string) {
  if (ctx.isE2ETest) {
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
  if (ctx.isE2ETest) {
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

async function handleBranchChanges(ctx: HandlerContext, repoPath: string, baseBranch?: string) {
  if (ctx.isE2ETest) {
    if (ctx.isScreenshotMode) {
      return {
        files: [
          { path: 'src/middleware/auth.ts', status: 'modified' },
          { path: 'src/services/token.ts', status: 'added' },
          { path: 'src/services/session.ts', status: 'added' },
          { path: 'src/routes/auth.ts', status: 'modified' },
          { path: 'src/types/auth.d.ts', status: 'added' },
          { path: 'tests/auth.test.ts', status: 'modified' },
          { path: 'package.json', status: 'modified' },
        ],
        baseBranch: 'main',
        mergeBase: 'abc1234',
      }
    }
    return {
      files: [
        { path: 'src/index.ts', status: 'modified' },
        { path: 'src/new-feature.ts', status: 'added' },
      ],
      baseBranch: 'main',
      mergeBase: 'abc1234',
    }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))

    if (!baseBranch) {
      try {
        const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
        baseBranch = ref.trim().replace('refs/remotes/origin/', '')
      } catch {
        try {
          await git.raw(['rev-parse', '--verify', 'origin/main'])
          baseBranch = 'main'
        } catch {
          try {
            await git.raw(['rev-parse', '--verify', 'origin/master'])
            baseBranch = 'master'
          } catch {
            baseBranch = 'main'
          }
        }
      }
    }

    const diffOutput = await git.raw(['diff', '--name-status', `origin/${baseBranch}...HEAD`])

    const files: { path: string; status: string }[] = []
    for (const line of diffOutput.trim().split('\n')) {
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
  if (ctx.isE2ETest) {
    if (ctx.isScreenshotMode) {
      return {
        commits: [
          { hash: 'a1b2c3d4e5f60', shortHash: 'a1b2c3d', message: 'Add JWT token refresh with rotation', author: 'Claude', date: '2025-01-15T14:30:00Z' },
          { hash: 'b2c3d4e5f6a70', shortHash: 'b2c3d4e', message: 'Implement session store with Redis backend', author: 'Claude', date: '2025-01-15T14:15:00Z' },
          { hash: 'c3d4e5f6a7b80', shortHash: 'c3d4e5f', message: 'Add auth middleware with token validation', author: 'Claude', date: '2025-01-15T14:00:00Z' },
          { hash: 'd4e5f6a7b8c90', shortHash: 'd4e5f6a', message: 'Set up authentication routes and types', author: 'Claude', date: '2025-01-15T13:45:00Z' },
        ],
        baseBranch: 'main',
      }
    }
    return {
      commits: [
        { hash: 'abc1234567890', shortHash: 'abc1234', message: 'Add new feature', author: 'Test User', date: '2025-01-15T10:00:00Z' },
        { hash: 'def5678901234', shortHash: 'def5678', message: 'Fix styling bug', author: 'Test User', date: '2025-01-14T09:00:00Z' },
      ],
      baseBranch: 'main',
    }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))

    if (!baseBranch) {
      try {
        const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
        baseBranch = ref.trim().replace('refs/remotes/origin/', '')
      } catch {
        try {
          await git.raw(['rev-parse', '--verify', 'origin/main'])
          baseBranch = 'main'
        } catch {
          try {
            await git.raw(['rev-parse', '--verify', 'origin/master'])
            baseBranch = 'master'
          } catch {
            baseBranch = 'main'
          }
        }
      }
    }

    const SEP = '<<SEP>>'
    const logOutput = await git.raw([
      'log',
      `origin/${baseBranch}..HEAD`,
      `--pretty=format:%H${SEP}%h${SEP}%s${SEP}%an${SEP}%aI`,
    ])

    const commits: { hash: string; shortHash: string; message: string; author: string; date: string }[] = []
    for (const line of logOutput.trim().split('\n')) {
      if (!line.trim()) continue
      const parts = line.split(SEP)
      if (parts.length >= 5) {
        commits.push({
          hash: parts[0],
          shortHash: parts[1],
          message: parts[2],
          author: parts[3],
          date: parts[4],
        })
      }
    }

    return { commits, baseBranch }
  } catch {
    return { commits: [], baseBranch: baseBranch || 'main' }
  }
}

async function handleCommitFiles(ctx: HandlerContext, repoPath: string, commitHash: string) {
  if (ctx.isE2ETest) {
    return [
      { path: 'src/index.ts', status: 'modified' },
      { path: 'src/utils.ts', status: 'added' },
    ]
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const output = await git.raw(['diff-tree', '--no-commit-id', '--name-status', '-r', commitHash])

    const files: { path: string; status: string }[] = []
    for (const line of output.trim().split('\n')) {
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
  ipcMain.handle('git:branchChanges', (_event, repoPath: string, baseBranch?: string) => handleBranchChanges(ctx, repoPath, baseBranch))
  ipcMain.handle('git:branchCommits', (_event, repoPath: string, baseBranch?: string) => handleBranchCommits(ctx, repoPath, baseBranch))
  ipcMain.handle('git:commitFiles', (_event, repoPath: string, commitHash: string) => handleCommitFiles(ctx, repoPath, commitHash))
}
