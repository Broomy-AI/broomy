import { IpcMain } from 'electron'
import { execFile, exec } from 'child_process'
import { promisify } from 'util'
import simpleGit from 'simple-git'
import { buildPrCreateUrl } from '../gitStatusParser'
import { isWindows, getExecShell } from '../platform'
import { HandlerContext, expandHomePath, getE2EMockBranches } from './types'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

async function runCommand(command: string, args: string[], options: { cwd?: string; timeout?: number }): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    ...options,
    encoding: 'utf-8',
  })
  return stdout
}

async function runShellCommand(command: string, options: { cwd?: string; timeout?: number }): Promise<string> {
  const shell = getExecShell()
  const { stdout } = await execAsync(command, {
    ...options,
    encoding: 'utf-8',
    shell: shell || undefined,
  })
  return stdout
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  const E2E_MOCK_BRANCHES = getE2EMockBranches(ctx.isScreenshotMode)

  // Agent CLI installation check
  ipcMain.handle('agent:isInstalled', async (_event, command: string) => {
    if (ctx.isE2ETest) return true
    try {
      if (isWindows) {
        await execFileAsync('where', [command], { encoding: 'utf-8' })
      } else {
        await runShellCommand(`command -v ${command}`, { timeout: 5000 })
      }
      return true
    } catch {
      return false
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
        timeout: 30000,
      })
      const issues = JSON.parse(result)
      return issues.map((issue: { number: number; title: string; labels: { name: string }[]; url: string }) => ({
        number: issue.number,
        title: issue.title,
        labels: issue.labels.map((l: { name: string }) => l.name),
        url: issue.url,
      }))
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
        timeout: 15000,
      })
      return result.trim() || null
    } catch {
      return null
    }
  })

  ipcMain.handle('gh:prStatus', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      const branch = E2E_MOCK_BRANCHES[repoDir]
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
        timeout: 15000,
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
      return null
    }
  })

  ipcMain.handle('gh:hasWriteAccess', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return true
    }

    try {
      const result = await runCommand('gh', ['repo', 'view', '--json', 'viewerPermission', '--jq', '.viewerPermission'], {
        cwd: expandHomePath(repoDir),
        timeout: 15000,
      })
      const permission = result.trim()
      return ['ADMIN', 'MAINTAIN', 'WRITE'].includes(permission)
    } catch {
      return false
    }
  })

  ipcMain.handle('gh:mergeBranchToMain', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }

    try {
      const git = simpleGit(expandHomePath(repoDir))

      const status = await git.status()
      const currentBranch = status.current
      if (!currentBranch) {
        return { success: false, error: 'Could not determine current branch' }
      }

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

      await git.push()
      await git.push('origin', `HEAD:${defaultBranch}`)

      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
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
        timeout: 15000,
      })
      const repoSlug = repoSlugResult.trim()

      if (!repoSlug) return null

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

      return buildPrCreateUrl(repoSlug, defaultBranch, currentBranch)
    } catch {
      return null
    }
  })
}
