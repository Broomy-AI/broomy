/**
 * IPC handlers for core GitHub operations via the gh CLI and simple-git.
 *
 * Provides PR status, creation URLs, issue listing, auth checks, and
 * repository metadata queries.
 */
import { IpcMain } from 'electron'
import { execFile } from 'child_process'
import { readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import simpleGit from 'simple-git'
import { buildPrCreateUrl } from '../gitStatusParser'
import { isWindows, getExecShell, resolveCommand, enhancedPath } from '../platform'
import { HandlerContext, expandHomePath } from './types'
import { getScenarioData } from './scenarios'
import { getDefaultBranch } from './gitUtils'

const execFileAsync = promisify(execFile)

/** Check if the authenticated user has write (or higher) access to the GitHub repo at `cwd`. */
async function checkWriteAccess(cwd: string): Promise<boolean> {
  const result = await runCommand('gh', ['repo', 'view', '--json', 'viewerPermission', '--jq', '.viewerPermission'], {
    cwd,
    timeout: 10000,
  })
  const permission = result.trim()
  return ['ADMIN', 'MAINTAIN', 'WRITE'].includes(permission)
}

/**
 * Resolve write access for a directory that may not itself be a git repo
 * (e.g. a worktree parent directory). Falls back to scanning subdirectories.
 */
async function resolveWriteAccess(repoDir: string): Promise<boolean> {
  try {
    return await checkWriteAccess(repoDir)
  } catch {
    // If the directory isn't a git repo (e.g. worktree parent), try subdirectories
    try {
      const entries = readdirSync(repoDir)
      for (const entry of entries) {
        const subdir = join(repoDir, entry)
        if (statSync(subdir).isDirectory() && existsSync(join(subdir, '.git'))) {
          return await checkWriteAccess(subdir)
        }
      }
    } catch {
      // Fall through
    }
    return false
  }
}

function parseIssuesJson(result: string) {
  const issues = JSON.parse(result)
  return issues.map((issue: { number: number; title: string; labels: { name: string }[]; url: string }) => ({
    number: issue.number,
    title: issue.title,
    labels: issue.labels.map((l: { name: string }) => l.name),
    url: issue.url,
  }))
}

async function runCommand(command: string, args: string[], options: { cwd?: string; timeout?: number }): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    ...options,
    encoding: 'utf-8',
  })
  return stdout
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  // Agent CLI installation check
  ipcMain.handle('agent:isInstalled', async (_event, command: string) => {
    if (ctx.isE2ETest) return true
    // Extract the base command name (e.g. "claude --flag" → "claude")
    const baseCommand = command.trim().split(/\s+/)[0]
    try {
      if (isWindows) {
        await execFileAsync('where', [baseCommand], { encoding: 'utf-8' })
      } else {
        const shell = getExecShell() || '/bin/sh'
        // Use enhanced PATH so common dirs like ~/.local/bin are included
        // even if resolveShellEnv() failed at startup
        const env = { ...process.env, PATH: enhancedPath(process.env.PATH) }
        await execFileAsync(shell, ['-c', 'command -v "$1"', '--', baseCommand], { encoding: 'utf-8', timeout: 5000, env })
      }
      return true
    } catch {
      // Fall back to well-known install locations on all platforms
      return resolveCommand(baseCommand) !== null
    }
  })

  ipcMain.handle('git:isInstalled', async () => {
    if (ctx.isE2ETest) return true
    try {
      await execFileAsync('git', ['--version'], { encoding: 'utf-8' })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('gh:isInstalled', async () => {
    if (ctx.isE2ETest) {
      return true
    }

    try {
      await execFileAsync('gh', ['--version'], { encoding: 'utf-8' })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('gh:issues', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return [
        { number: 42, title: 'Add support for the dark mode toggle in the user settings panel', labels: ['feature', 'priority'], url: 'https://github.com/user/demo-project/issues/42' },
        { number: 17, title: 'Fix the crash that happens when clicking on an empty notification list', labels: ['bug'], url: 'https://github.com/user/demo-project/issues/17' },
      ]
    }

    try {
      const result = await runCommand('gh', ['issue', 'list', '--assignee', '@me', '--state', 'open', '--json', 'number,title,labels,url', '--limit', '50'], {
        cwd: expandHomePath(repoDir),
        timeout: 10000,
      })
      return parseIssuesJson(result)
    } catch {
      return []
    }
  })

  ipcMain.handle('gh:searchIssues', async (_event, repoDir: string, query: string) => {
    if (ctx.isE2ETest) {
      const allIssues = [
        { number: 42, title: 'Add support for the dark mode toggle in the user settings panel', labels: ['feature', 'priority'], url: 'https://github.com/user/demo-project/issues/42' },
        { number: 17, title: 'Fix the crash that happens when clicking on an empty notification list', labels: ['bug'], url: 'https://github.com/user/demo-project/issues/17' },
        { number: 8, title: 'Implement search functionality for the dashboard', labels: ['feature'], url: 'https://github.com/user/demo-project/issues/8' },
      ]
      const q = query.toLowerCase()
      return allIssues.filter(i => i.title.toLowerCase().includes(q) || i.labels.some(l => l.toLowerCase().includes(q)))
    }

    try {
      const result = await runCommand('gh', ['issue', 'list', '--search', query, '--state', 'open', '--json', 'number,title,labels,url', '--limit', '50'], {
        cwd: expandHomePath(repoDir),
        timeout: 10000,
      })
      return parseIssuesJson(result)
    } catch {
      return []
    }
  })

  ipcMain.handle('gh:repoSlug', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return 'user/demo-project'
    }

    try {
      const result = await runCommand('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
        cwd: expandHomePath(repoDir),
        timeout: 10000,
      })
      return result.trim() || null
    } catch {
      return null
    }
  })

  ipcMain.handle('gh:prStatus', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      const branch = getScenarioData(ctx.e2eScenario).branches[repoDir]
      if (branch && branch !== 'main') {
        return {
          number: 123,
          title: 'Test PR',
          state: 'OPEN',
          url: 'https://github.com/user/demo-project/pull/123',
          headRefName: branch,
          baseRefName: 'main',
        }
      }
      return null
    }

    try {
      const result = await runCommand('gh', ['pr', 'view', '--json', 'number,title,state,url,headRefName,baseRefName'], {
        cwd: expandHomePath(repoDir),
        timeout: 10000,
      })
      const pr = JSON.parse(result)
      return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        url: pr.url,
        headRefName: pr.headRefName,
        baseRefName: pr.baseRefName,
      }
    } catch {
      // No PR for current branch — return null regardless of error message.
      // Previously we only matched specific error strings, which missed
      // platform-specific variations (e.g. Windows gh CLI messages).
      return null
    }
  })

  ipcMain.handle('gh:hasWriteAccess', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return true
    }
    return resolveWriteAccess(expandHomePath(repoDir))
  })

  ipcMain.handle('gh:prChecksStatus', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return 'passed'
    }

    try {
      const result = await runCommand('gh', [
        'pr', 'view', '--json', 'statusCheckRollup',
        '--jq', '.statusCheckRollup[] | .conclusion // .state',
      ], {
        cwd: expandHomePath(repoDir),
        timeout: 15000,
      })

      const lines = result.trim().split('\n').filter(Boolean)

      // No checks configured
      if (lines.length === 0) return 'none'

      // Any check still running
      if (lines.some(l => ['PENDING', 'QUEUED', 'IN_PROGRESS', ''].includes(l.trim().toUpperCase()))) return 'pending'

      // All checks must have succeeded
      if (lines.every(l => l.trim().toUpperCase() === 'SUCCESS')) return 'passed'

      return 'failed'
    } catch {
      // No PR or gh error — treat as no checks
      return 'none'
    }
  })

  ipcMain.handle('gh:getPrCreateUrl', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return 'https://github.com/user/demo-project/compare/main...feature/auth?expand=1'
    }

    try {
      const git = simpleGit(expandHomePath(repoDir))

      const status = await git.status()
      const currentBranch = status.current
      if (!currentBranch) return null

      const repoSlugResult = await runCommand('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
        cwd: expandHomePath(repoDir),
        timeout: 10000,
      })
      const repoSlug = repoSlugResult.trim()

      if (!repoSlug) return null

      const defaultBranch = await getDefaultBranch(git)

      return buildPrCreateUrl(repoSlug, defaultBranch, currentBranch)
    } catch {
      return null
    }
  })

  ipcMain.handle('gh:currentUser', async () => {
    if (ctx.isE2ETest) {
      return 'test-user'
    }

    try {
      const { stdout } = await execFileAsync('gh', [
        'api', 'user', '--jq', '.login',
      ], {
        encoding: 'utf-8',
        timeout: 10000,
      })
      return stdout.trim()
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })
}
