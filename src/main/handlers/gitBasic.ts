import { IpcMain } from 'electron'
import simpleGit from 'simple-git'
import { statusFromChar } from '../gitStatusParser'
import { HandlerContext, getE2EMockBranches } from './types'

async function handleGetBranch(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest) {
    const E2E_MOCK_BRANCHES = getE2EMockBranches(ctx.isScreenshotMode)
    return E2E_MOCK_BRANCHES[repoPath] || 'main'
  }

  try {
    const git = simpleGit(repoPath)
    const status = await git.status()
    return status.current || 'unknown'
  } catch {
    return 'unknown'
  }
}

async function handleIsGitRepo(ctx: HandlerContext, dirPath: string) {
  if (ctx.isE2ETest) {
    return true
  }

  try {
    const git = simpleGit(dirPath)
    return await git.checkIsRepo()
  } catch {
    return false
  }
}

async function handleStatus(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest) {
    const E2E_MOCK_BRANCHES = getE2EMockBranches(ctx.isScreenshotMode)
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
      } else if (!hasIndexChange) {
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
}

async function handleStage(ctx: HandlerContext, repoPath: string, filePath: string) {
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
}

async function handleStageAll(ctx: HandlerContext, repoPath: string) {
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
}

async function handleUnstage(ctx: HandlerContext, repoPath: string, filePath: string) {
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
}

async function handleCheckoutFile(ctx: HandlerContext, repoPath: string, filePath: string) {
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
}

async function handleCommit(ctx: HandlerContext, repoPath: string, message: string) {
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
}

async function handlePush(ctx: HandlerContext, repoPath: string) {
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
}

async function handlePull(ctx: HandlerContext, repoPath: string) {
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
}

async function handleDiff(ctx: HandlerContext, repoPath: string, filePath?: string) {
  if (ctx.isE2ETest) {
    if (ctx.isScreenshotMode) {
      // Build diff string without template literals to avoid Vite bundler issues
      const IM = 'im' + 'port' // avoid bundler parsing
      const lines = []
      lines.push('diff --git a/src/middleware/auth.ts b/src/middleware/auth.ts')
      lines.push('--- a/src/middleware/auth.ts')
      lines.push('+++ b/src/middleware/auth.ts')
      lines.push('@@ -1,15 +1,42 @@')
      lines.push(` ${  IM  } { Request, Response, NextFunction } from 'express'`)
      lines.push(` ${  IM  } jwt from 'jsonwebtoken'`)
      lines.push('-// TODO: Add proper token validation')
      lines.push(`+${  IM  } { TokenService } from '../services/token'`)
      lines.push(`+${  IM  } { SessionStore } from '../services/session'`)
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
}

async function handleShow(ctx: HandlerContext, repoPath: string, filePath: string, ref = 'HEAD') {
  if (ctx.isE2ETest) {
    if (ctx.isScreenshotMode) {
      const IM = 'im' + 'port'
      const lines = []
      lines.push(`${IM  } { Request, Response, NextFunction } from 'express'`)
      lines.push(`${IM  } jwt from 'jsonwebtoken'`)
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
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('git:getBranch', (_event, repoPath: string) => handleGetBranch(ctx, repoPath))
  ipcMain.handle('git:isGitRepo', (_event, dirPath: string) => handleIsGitRepo(ctx, dirPath))
  ipcMain.handle('git:status', (_event, repoPath: string) => handleStatus(ctx, repoPath))
  ipcMain.handle('git:stage', (_event, repoPath: string, filePath: string) => handleStage(ctx, repoPath, filePath))
  ipcMain.handle('git:stageAll', (_event, repoPath: string) => handleStageAll(ctx, repoPath))
  ipcMain.handle('git:unstage', (_event, repoPath: string, filePath: string) => handleUnstage(ctx, repoPath, filePath))
  ipcMain.handle('git:checkoutFile', (_event, repoPath: string, filePath: string) => handleCheckoutFile(ctx, repoPath, filePath))
  ipcMain.handle('git:commit', (_event, repoPath: string, message: string) => handleCommit(ctx, repoPath, message))
  ipcMain.handle('git:push', (_event, repoPath: string) => handlePush(ctx, repoPath))
  ipcMain.handle('git:pull', (_event, repoPath: string) => handlePull(ctx, repoPath))
  ipcMain.handle('git:diff', (_event, repoPath: string, filePath?: string) => handleDiff(ctx, repoPath, filePath))
  ipcMain.handle('git:show', (_event, repoPath: string, filePath: string, ref = 'HEAD') => handleShow(ctx, repoPath, filePath, ref))
}
