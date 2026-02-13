import { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, watch, appendFileSync, rmSync } from 'fs'
import { join } from 'path'
import { normalizePath } from '../platform'
import { HandlerContext } from './types'

function handleReadDir(ctx: HandlerContext, dirPath: string) {
  if (ctx.isE2ETest) {
    if (ctx.isScreenshotMode) {
      if (dirPath.endsWith('/src')) {
        return [
          { name: 'components', path: join(dirPath, 'components'), isDirectory: true },
          { name: 'middleware', path: join(dirPath, 'middleware'), isDirectory: true },
          { name: 'routes', path: join(dirPath, 'routes'), isDirectory: true },
          { name: 'services', path: join(dirPath, 'services'), isDirectory: true },
          { name: 'types', path: join(dirPath, 'types'), isDirectory: true },
          { name: 'utils', path: join(dirPath, 'utils'), isDirectory: true },
          { name: 'app.ts', path: join(dirPath, 'app.ts'), isDirectory: false },
          { name: 'config.ts', path: join(dirPath, 'config.ts'), isDirectory: false },
          { name: 'index.ts', path: join(dirPath, 'index.ts'), isDirectory: false },
        ]
      }
      if (dirPath.endsWith('/middleware')) {
        return [
          { name: 'auth.ts', path: join(dirPath, 'auth.ts'), isDirectory: false },
          { name: 'cors.ts', path: join(dirPath, 'cors.ts'), isDirectory: false },
          { name: 'rateLimit.ts', path: join(dirPath, 'rateLimit.ts'), isDirectory: false },
        ]
      }
      if (dirPath.endsWith('/services')) {
        return [
          { name: 'session.ts', path: join(dirPath, 'session.ts'), isDirectory: false },
          { name: 'token.ts', path: join(dirPath, 'token.ts'), isDirectory: false },
          { name: 'user.ts', path: join(dirPath, 'user.ts'), isDirectory: false },
        ]
      }
      if (dirPath.endsWith('/routes')) {
        return [
          { name: 'auth.ts', path: join(dirPath, 'auth.ts'), isDirectory: false },
          { name: 'users.ts', path: join(dirPath, 'users.ts'), isDirectory: false },
          { name: 'health.ts', path: join(dirPath, 'health.ts'), isDirectory: false },
        ]
      }
      return [
        { name: 'src', path: join(dirPath, 'src'), isDirectory: true },
        { name: 'tests', path: join(dirPath, 'tests'), isDirectory: true },
        { name: '.env.example', path: join(dirPath, '.env.example'), isDirectory: false },
        { name: 'docker-compose.yml', path: join(dirPath, 'docker-compose.yml'), isDirectory: false },
        { name: 'Dockerfile', path: join(dirPath, 'Dockerfile'), isDirectory: false },
        { name: 'package.json', path: join(dirPath, 'package.json'), isDirectory: false },
        { name: 'README.md', path: join(dirPath, 'README.md'), isDirectory: false },
        { name: 'tsconfig.json', path: join(dirPath, 'tsconfig.json'), isDirectory: false },
      ]
    }
    return [
      { name: 'src', path: join(dirPath, 'src'), isDirectory: true },
      { name: 'package.json', path: join(dirPath, 'package.json'), isDirectory: false },
      { name: 'README.md', path: join(dirPath, 'README.md'), isDirectory: false },
    ]
  }

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.name !== '.git')
      .map((entry) => ({
        name: entry.name,
        path: normalizePath(join(dirPath, entry.name)),
        isDirectory: entry.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
  } catch {
    return []
  }
}

function handleReadFile(ctx: HandlerContext, filePath: string) {
  if (ctx.isE2ETest) {
    if (ctx.isScreenshotMode && filePath.includes('auth.ts')) {
      const IM = 'im' + 'port'
      const lines = []
      lines.push(`${IM  } { Request, Response, NextFunction } from 'express'`)
      lines.push(`${IM  } jwt from 'jsonwebtoken'`)
      lines.push(`${IM  } { TokenService } from '../services/token'`)
      lines.push(`${IM  } { SessionStore } from '../services/session'`)
      lines.push('')
      lines.push('const tokenService = new TokenService({')
      lines.push("  accessTokenTTL: '15m',")
      lines.push("  refreshTokenTTL: '7d',")
      lines.push('  rotateRefreshTokens: true,')
      lines.push('})')
      lines.push('')
      lines.push('export async function authenticate(req: Request, res: Response, next: NextFunction) {')
      lines.push('  try {')
      lines.push("    const accessToken = req.headers.authorization?.split(' ')[1]")
      lines.push("    if (!accessToken) return res.status(401).json({ error: 'Missing token' })")
      lines.push('')
      lines.push('    const payload = await tokenService.verifyAccessToken(accessToken)')
      lines.push('    const session = await SessionStore.get(payload.sessionId)')
      lines.push('    if (!session || session.revoked) {')
      lines.push("      return res.status(401).json({ error: 'Session revoked' })")
      lines.push('    }')
      lines.push('')
      lines.push('    req.user = payload.user')
      lines.push('    req.sessionId = payload.sessionId')
      lines.push('    next()')
      lines.push('  } catch (err) {')
      lines.push('    if (err instanceof jwt.TokenExpiredError) {')
      lines.push("      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' })")
      lines.push('    }')
      lines.push("    return res.status(401).json({ error: 'Invalid token' })")
      lines.push('  }')
      lines.push('}')
      return lines.join('\n')
    }
    // Screenshot mode: fake review data for ReviewPanel
    if (ctx.isScreenshotMode && (/\/tmp\/broomy-review-[^/]+\/review\.json$/.exec(filePath))) {
      return JSON.stringify({
        version: 1,
        generatedAt: '2025-01-15T10:30:00Z',
        prNumber: 47,
        prTitle: 'Add JWT authentication with session management',
        overview: {
          purpose: 'Replaces basic token auth with JWT-based authentication supporting refresh tokens, session tracking, and automatic token rotation.',
          approach: 'Adds a TokenService for JWT signing/verification, a SessionStore for tracking active sessions, and updates the auth middleware to validate access tokens and check session revocation.',
        },
        changePatterns: [
          {
            id: 'cp1',
            title: 'Auth middleware overhaul',
            description: 'Converts synchronous token check to async JWT verification with session validation. Adds try/catch for token expiry handling.',
            locations: [{ file: 'src/middleware/auth.ts', startLine: 12, endLine: 28 }],
          },
          {
            id: 'cp2',
            title: 'New token and session services',
            description: 'Introduces TokenService (JWT sign/verify/rotate) and SessionStore (Redis-backed session tracking with revocation support).',
            locations: [
              { file: 'src/services/token.ts', startLine: 1, endLine: 45 },
              { file: 'src/services/session.ts', startLine: 1, endLine: 38 },
            ],
          },
          {
            id: 'cp3',
            title: 'Route updates for token refresh',
            description: 'Adds POST /auth/refresh endpoint and updates existing auth routes to use new middleware.',
            locations: [{ file: 'src/routes/auth.ts', startLine: 15, endLine: 42 }],
          },
        ],
        potentialIssues: [
          {
            id: 'pi1',
            severity: 'warning',
            title: 'No token expiry grace period',
            description: 'Access tokens are rejected immediately on expiry. Consider a small grace period (30s) to handle clock skew between services.',
            locations: [{ file: 'src/services/token.ts', startLine: 22, endLine: 24 }],
          },
          {
            id: 'pi2',
            severity: 'concern',
            title: 'Session revocation check on every request',
            description: 'Every authenticated request hits Redis to check session revocation. Under high load this could become a bottleneck. Consider caching with a short TTL.',
            locations: [{ file: 'src/middleware/auth.ts', startLine: 18, endLine: 21 }],
          },
        ],
        designDecisions: [
          {
            id: 'dd1',
            title: 'JWT with Redis sessions over stateless JWT',
            description: 'Uses JWT for transport but backs it with server-side sessions, enabling immediate revocation at the cost of a Redis dependency.',
            alternatives: ['Stateless JWT with token blacklist', 'Opaque session tokens', 'OAuth 2.0 with external provider'],
            locations: [{ file: 'src/services/session.ts', startLine: 5, endLine: 12 }],
          },
        ],
      })
    }
    if (ctx.isScreenshotMode && (/\/tmp\/broomy-review-[^/]+\/comments\.json$/.exec(filePath))) {
      return '[]'
    }
    return '// Mock file content for E2E tests\nexport const test = true;\n'
  }

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }
  const stats = statSync(filePath)
  if (stats.isDirectory()) {
    throw new Error('Cannot read directory as file')
  }
  if (stats.size > 5 * 1024 * 1024) {
    throw new Error('File is too large to display')
  }
  return readFileSync(filePath, 'utf-8')
}

function handleWriteFile(ctx: HandlerContext, filePath: string, content: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

function handleAppendFile(ctx: HandlerContext, filePath: string, content: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    appendFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

function handleExists(ctx: HandlerContext, filePath: string) {
  if (ctx.isScreenshotMode && (/\/tmp\/broomy-review-[^/]+\/(review|comments)\.json$/.exec(filePath))) {
    return true
  }
  return existsSync(filePath)
}

function handleMkdir(ctx: HandlerContext, dirPath: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    if (existsSync(dirPath)) {
      return { success: false, error: 'Directory already exists' }
    }
    mkdirSync(dirPath, { recursive: true })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

function handleRm(ctx: HandlerContext, targetPath: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    if (!existsSync(targetPath)) {
      return { success: true }
    }
    rmSync(targetPath, { recursive: true, force: true })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

function handleCreateFile(ctx: HandlerContext, filePath: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    if (existsSync(filePath)) {
      return { success: false, error: 'File already exists' }
    }
    writeFileSync(filePath, '')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

function handleReadFileBase64(ctx: HandlerContext, filePath: string) {
  if (ctx.isE2ETest) {
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  }

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }
  const stats = statSync(filePath)
  if (stats.isDirectory()) {
    throw new Error('Cannot read directory as file')
  }
  if (stats.size > 10 * 1024 * 1024) {
    throw new Error('File is too large to display')
  }
  return readFileSync(filePath).toString('base64')
}

function handleWatch(ctx: HandlerContext, _event: IpcMainInvokeEvent, id: string, dirPath: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  const senderWindow = BrowserWindow.fromWebContents(_event.sender)

  const existingWatcher = ctx.fileWatchers.get(id)
  if (existingWatcher) {
    existingWatcher.close()
  }

  if (senderWindow) {
    ctx.watcherOwnerWindows.set(id, senderWindow)
  }

  try {
    const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (filename?.startsWith('.git')) return

      const ownerWindow = ctx.watcherOwnerWindows.get(id) || ctx.mainWindow
      if (ownerWindow && !ownerWindow.isDestroyed()) {
        ownerWindow.webContents.send(`fs:change:${id}`, { eventType, filename })
      }
    })

    ctx.fileWatchers.set(id, watcher)

    watcher.on('error', (error) => {
      console.error('File watcher error:', error)
      ctx.fileWatchers.delete(id)
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to start file watcher:', error)
    return { success: false, error: String(error) }
  }
}

function handleUnwatch(ctx: HandlerContext, id: string) {
  const watcher = ctx.fileWatchers.get(id)
  if (watcher) {
    watcher.close()
    ctx.fileWatchers.delete(id)
  }
  return { success: true }
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('fs:readDir', (_event, dirPath: string) => handleReadDir(ctx, dirPath))
  ipcMain.handle('fs:readFile', (_event, filePath: string) => handleReadFile(ctx, filePath))
  ipcMain.handle('fs:writeFile', (_event, filePath: string, content: string) => handleWriteFile(ctx, filePath, content))
  ipcMain.handle('fs:appendFile', (_event, filePath: string, content: string) => handleAppendFile(ctx, filePath, content))
  ipcMain.handle('fs:exists', (_event, filePath: string) => handleExists(ctx, filePath))
  ipcMain.handle('fs:mkdir', (_event, dirPath: string) => handleMkdir(ctx, dirPath))
  ipcMain.handle('fs:rm', (_event, targetPath: string) => handleRm(ctx, targetPath))
  ipcMain.handle('fs:createFile', (_event, filePath: string) => handleCreateFile(ctx, filePath))
  ipcMain.handle('fs:readFileBase64', (_event, filePath: string) => handleReadFileBase64(ctx, filePath))
  ipcMain.handle('fs:watch', (_event, id: string, dirPath: string) => handleWatch(ctx, _event, id, dirPath))
  ipcMain.handle('fs:unwatch', (_event, id: string) => handleUnwatch(ctx, id))
}
