import { IpcMain } from 'electron'
import { execSync } from 'child_process'
import simpleGit from 'simple-git'
import { buildPrCreateUrl } from '../gitStatusParser'
import { isWindows } from '../platform'
import { HandlerContext, expandHomePath, getE2EMockBranches } from './types'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  const E2E_MOCK_BRANCHES = getE2EMockBranches(ctx.isScreenshotMode)

  // Agent CLI installation check
  ipcMain.handle('agent:isInstalled', (_event, command: string) => {
    if (ctx.isE2ETest) return true
    try {
      execSync(isWindows ? `where ${command}` : `which ${command}`, { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('gh:isInstalled', () => {
    if (ctx.isE2ETest) {
      return true
    }

    try {
      execSync('gh --version', { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('gh:issues', (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return [
        { number: 42, title: 'Add user authentication', labels: ['feature', 'priority'], url: 'https://github.com/user/demo-project/issues/42' },
        { number: 17, title: 'Fix login page crash', labels: ['bug'], url: 'https://github.com/user/demo-project/issues/17' },
      ]
    }

    try {
      const result = execSync('gh issue list --assignee @me --state open --json number,title,labels,url --limit 50', {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
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

  ipcMain.handle('gh:repoSlug', (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return 'user/demo-project'
    }

    try {
      const result = execSync('gh repo view --json nameWithOwner --jq .nameWithOwner', {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 15000,
      })
      return result.trim() || null
    } catch {
      return null
    }
  })

  ipcMain.handle('gh:prStatus', (_event, repoDir: string) => {
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
      const result = execSync('gh pr view --json number,title,state,url,headRefName,baseRefName', {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 15000,
        stdio: ['pipe', 'pipe', 'ignore'],
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

  ipcMain.handle('gh:hasWriteAccess', (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return true
    }

    try {
      const result = execSync('gh repo view --json viewerPermission --jq .viewerPermission', {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
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

      const repoSlug = execSync('gh repo view --json nameWithOwner --jq .nameWithOwner', {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 15000,
      }).trim()

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
