import { IpcMain } from 'electron'
import simpleGit from 'simple-git'
import { statusFromChar } from '../gitStatusParser'
import { getCloneErrorHint } from '../cloneErrorHint'
import { normalizePath } from '../platform'
import { HandlerContext, expandHomePath, getE2EMockBranches } from './types'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  const E2E_MOCK_BRANCHES = getE2EMockBranches(ctx.isScreenshotMode)

  ipcMain.handle('git:getBranch', async (_event, repoPath: string) => {
    if (ctx.isE2ETest) {
      return E2E_MOCK_BRANCHES[repoPath] || 'main'
    }

    try {
      const git = simpleGit(repoPath)
      const status = await git.status()
      return status.current || 'unknown'
    } catch {
      return 'unknown'
    }
  })

  ipcMain.handle('git:isGitRepo', async (_event, dirPath: string) => {
    if (ctx.isE2ETest) {
      return true
    }

    try {
      const git = simpleGit(dirPath)
      return await git.checkIsRepo()
    } catch {
      return false
    }
  })

  ipcMain.handle('git:status', async (_event, repoPath: string) => {
    if (ctx.isE2ETest) {
      if (ctx.isScreenshotMode) {
        return {
          files: [
            { path: 'src/middleware/auth.ts', status: 'modified', staged: true, indexStatus: 'M', workingDirStatus: ' ' },
            { path: 'src/services/token.ts', status: 'added', staged: true, indexStatus: 'A', workingDirStatus: ' ' },
            { path: 'src/services/session.ts', status: 'added', staged: true, indexStatus: 'A', workingDirStatus: ' ' },
            { path: 'src/routes/auth.ts', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
            { path: 'src/types/auth.d.ts', status: 'added', staged: false, indexStatus: '?', workingDirStatus: '?' },
            { path: 'tests/auth.test.ts', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
            { path: 'package.json', status: 'modified', staged: true, indexStatus: 'M', workingDirStatus: ' ' },
          ],
          ahead: 3,
          behind: 0,
          tracking: 'origin/feature/jwt-auth',
          current: E2E_MOCK_BRANCHES[repoPath] || 'main',
        }
      }
      return {
        files: [
          { path: 'src/index.ts', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
          { path: 'README.md', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
        ],
        ahead: 0,
        behind: 0,
        tracking: null,
        current: E2E_MOCK_BRANCHES[repoPath] || 'main',
      }
    }

    try {
      const git = simpleGit(repoPath)
      // Use -uall to list individual files inside untracked directories
      const status = await git.status(['-uall'])
      const files: { path: string; status: string; staged: boolean; indexStatus: string; workingDirStatus: string }[] = []

      for (const file of status.files) {
        const indexStatus = file.index || ' '
        const workingDirStatus = file.working_dir || ' '
        const hasIndexChange = indexStatus !== ' ' && indexStatus !== '?'
        const hasWorkingDirChange = workingDirStatus !== ' ' && workingDirStatus !== '?'

        if (hasIndexChange) {
          files.push({ path: file.path, status: statusFromChar(indexStatus), staged: true, indexStatus, workingDirStatus })
        }

        if (hasWorkingDirChange || (!hasIndexChange && workingDirStatus === '?')) {
          files.push({ path: file.path, status: statusFromChar(workingDirStatus), staged: false, indexStatus, workingDirStatus })
        } else if (!hasIndexChange && !hasWorkingDirChange) {
          // Shouldn't happen, but handle gracefully
          files.push({ path: file.path, status: 'modified', staged: false, indexStatus, workingDirStatus })
        }
      }

      return {
        files,
        ahead: status.ahead,
        behind: status.behind,
        tracking: status.tracking,
        current: status.current,
      }
    } catch {
      return { files: [], ahead: 0, behind: 0, tracking: null, current: null }
    }
  })

  ipcMain.handle('git:stage', async (_event, repoPath: string, filePath: string) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }

    try {
      const git = simpleGit(repoPath)
      await git.add([filePath])
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('git:stageAll', async (_event, repoPath: string) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }

    try {
      const git = simpleGit(repoPath)
      await git.add('.')
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('git:unstage', async (_event, repoPath: string, filePath: string) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }

    try {
      const git = simpleGit(repoPath)
      await git.reset(['HEAD', '--', filePath])
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('git:checkoutFile', async (_event, repoPath: string, filePath: string) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }

    try {
      const git = simpleGit(repoPath)
      await git.checkout(['--', filePath])
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('git:commit', async (_event, repoPath: string, message: string) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }

    if (!message || message.trim() === '') {
      return { success: false, error: 'Commit message cannot be empty' }
    }

    try {
      const git = simpleGit(repoPath)
      await git.commit(message)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('git:push', async (_event, repoPath: string) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }

    try {
      const git = simpleGit(repoPath)
      await git.push()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('git:pull', async (_event, repoPath: string) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }

    try {
      const git = simpleGit(repoPath)
      await git.pull()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('git:diff', async (_event, repoPath: string, filePath?: string) => {
    if (ctx.isE2ETest) {
      if (ctx.isScreenshotMode) {
        // Build diff string without template literals to avoid Vite bundler issues
        const IM = 'im' + 'port' // avoid bundler parsing
        const lines = []
        lines.push('diff --git a/src/middleware/auth.ts b/src/middleware/auth.ts')
        lines.push('--- a/src/middleware/auth.ts')
        lines.push('+++ b/src/middleware/auth.ts')
        lines.push('@@ -1,15 +1,42 @@')
        lines.push(' ' + IM + " { Request, Response, NextFunction } from 'express'")
        lines.push(' ' + IM + " jwt from 'jsonwebtoken'")
        lines.push('-// TODO: Add proper token validation')
        lines.push('+' + IM + " { TokenService } from '../services/token'")
        lines.push('+' + IM + " { SessionStore } from '../services/session'")
        lines.push('+')
        lines.push('+const tokenService = new TokenService({')
        lines.push("+  accessTokenTTL: '15m',")
        lines.push("+  refreshTokenTTL: '7d',")
        lines.push('+  rotateRefreshTokens: true,')
        lines.push('+})')
        lines.push('')
        lines.push('-export function authenticate(req: Request, res: Response, next: NextFunction) {')
        lines.push("-  const token = req.headers.authorization?.split(' ')[1]")
        lines.push("-  if (!token) return res.status(401).json({ error: 'No token' })")
        lines.push('-  try {')
        lines.push('-    const decoded = jwt.verify(token, process.env.JWT_SECRET!)')
        lines.push('-    req.user = decoded')
        lines.push('-    next()')
        lines.push('-  } catch {')
        lines.push("-    return res.status(401).json({ error: 'Invalid token' })")
        lines.push('+export async function authenticate(req: Request, res: Response, next: NextFunction) {')
        lines.push('+  try {')
        lines.push("+    const accessToken = req.headers.authorization?.split(' ')[1]")
        lines.push("+    if (!accessToken) return res.status(401).json({ error: 'Missing token' })")
        lines.push('+')
        lines.push('+    const payload = await tokenService.verifyAccessToken(accessToken)')
        lines.push('+    const session = await SessionStore.get(payload.sessionId)')
        lines.push('+    if (!session || session.revoked) {')
        lines.push("+      return res.status(401).json({ error: 'Session revoked' })")
        lines.push('+    }')
        lines.push('+')
        lines.push('+    req.user = payload.user')
        lines.push('+    req.sessionId = payload.sessionId')
        lines.push('+    next()')
        lines.push('+  } catch (err) {')
        lines.push('+    if (err instanceof jwt.TokenExpiredError) {')
        lines.push("+      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' })")
        lines.push('+    }')
        lines.push("+    return res.status(401).json({ error: 'Invalid token' })")
        lines.push('   }')
        lines.push(' }')
        return lines.join('\n')
      }
      return `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
+// New comment
 export function main() {
   console.log('Hello')
 }`
    }

    try {
      const git = simpleGit(repoPath)
      if (filePath) {
        return await git.diff([filePath])
      }
      return await git.diff()
    } catch {
      return ''
    }
  })

  ipcMain.handle('git:show', async (_event, repoPath: string, filePath: string, ref = 'HEAD') => {
    if (ctx.isE2ETest) {
      if (ctx.isScreenshotMode) {
        const IM = 'im' + 'port'
        const lines = []
        lines.push(IM + " { Request, Response, NextFunction } from 'express'")
        lines.push(IM + " jwt from 'jsonwebtoken'")
        lines.push('// TODO: Add proper token validation')
        lines.push('')
        lines.push('export function authenticate(req: Request, res: Response, next: NextFunction) {')
        lines.push("  const token = req.headers.authorization?.split(' ')[1]")
        lines.push("  if (!token) return res.status(401).json({ error: 'No token' })")
        lines.push('  try {')
        lines.push('    const decoded = jwt.verify(token, process.env.JWT_SECRET!)')
        lines.push('    req.user = decoded')
        lines.push('    next()')
        lines.push('  } catch {')
        lines.push("    return res.status(401).json({ error: 'Invalid token' })")
        lines.push('  }')
        lines.push('}')
        return lines.join('\n')
      }
      return `export function main() {
  console.log('Hello')
}`
    }

    try {
      const git = simpleGit(repoPath)
      const result = await git.raw(['show', `${ref}:${filePath}`])
      return result
    } catch (error) {
      console.error('git show error:', error)
      return ''
    }
  })

  ipcMain.handle('git:clone', async (_event, url: string, targetDir: string) => {
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
  })

  ipcMain.handle('git:worktreeAdd', async (_event, repoPath: string, worktreePath: string, branchName: string, baseBranch: string) => {
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
  })

  ipcMain.handle('git:worktreeList', async (_event, repoPath: string) => {
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
  })

  ipcMain.handle('git:pushNewBranch', async (_event, repoPath: string, branchName: string) => {
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
  })

  ipcMain.handle('git:defaultBranch', async (_event, repoPath: string) => {
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
  })

  ipcMain.handle('git:remoteUrl', async (_event, repoPath: string) => {
    if (ctx.isE2ETest) {
      return 'git@github.com:user/demo-project.git'
    }

    try {
      const git = simpleGit(expandHomePath(repoPath))
      const remotes = await git.getRemotes(true)
      const origin = remotes.find(r => r.name === 'origin')
      return origin?.refs?.fetch || null
    } catch {
      return null
    }
  })

  ipcMain.handle('git:headCommit', async (_event, repoPath: string) => {
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
  })

  ipcMain.handle('git:listBranches', async (_event, repoPath: string) => {
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
  })

  ipcMain.handle('git:fetchBranch', async (_event, repoPath: string, branchName: string) => {
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
  })

  ipcMain.handle('git:fetchPrHead', async (_event, repoPath: string, prNumber: number) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }

    try {
      const git = simpleGit(expandHomePath(repoPath))
      await git.fetch('origin', `pull/${prNumber}/head`)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('git:isMergedInto', async (_event, repoPath: string, ref: string) => {
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
  })

  ipcMain.handle('git:hasBranchCommits', async (_event, repoPath: string, ref: string) => {
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
  })

  ipcMain.handle('git:pullOriginMain', async (_event, repoPath: string) => {
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
  })

  ipcMain.handle('git:isBehindMain', async (_event, repoPath: string) => {
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
  })

  ipcMain.handle('git:getConfig', async (_event, repoPath: string, key: string) => {
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
  })

  ipcMain.handle('git:setConfig', async (_event, repoPath: string, key: string, value: string) => {
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
  })

  ipcMain.handle('git:branchChanges', async (_event, repoPath: string, baseBranch?: string) => {
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
  })

  ipcMain.handle('git:branchCommits', async (_event, repoPath: string, baseBranch?: string) => {
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
  })

  ipcMain.handle('git:commitFiles', async (_event, repoPath: string, commitHash: string) => {
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
  })
}
