import { IpcMain } from 'electron'
import { execSync } from 'child_process'
import simpleGit from 'simple-git'
import { buildPrCreateUrl } from '../gitStatusParser'
import { isWindows } from '../platform'
import { HandlerContext, expandHomePath, getE2EMockBranches } from './types'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  const E2E_MOCK_BRANCHES = getE2EMockBranches(ctx.isScreenshotMode)

  // Agent CLI installation check
  ipcMain.handle('agent:isInstalled', async (_event, command: string) => {
    if (ctx.isE2ETest) return true
    try {
      execSync(isWindows ? `where ${command}` : `which ${command}`, { stdio: 'ignore' })
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
      execSync('gh --version', { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('gh:issues', async (_event, repoDir: string) => {
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
        labels: (issue.labels || []).map((l: { name: string }) => l.name),
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

  ipcMain.handle('gh:hasWriteAccess', async (_event, repoDir: string) => {
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

  ipcMain.handle('gh:prComments', async (_event, repoDir: string, prNumber: number) => {
    if (ctx.isE2ETest) {
      return [
        {
          id: 1,
          body: 'This looks good, but could you add a comment explaining this logic?',
          path: 'src/index.ts',
          line: 10,
          side: 'RIGHT',
          author: 'reviewer',
          createdAt: '2024-01-15T10:30:00Z',
          url: 'https://github.com/user/demo-project/pull/123#discussion_r1',
        },
        {
          id: 2,
          body: 'Consider using a more descriptive variable name here.',
          path: 'src/utils.ts',
          line: 25,
          side: 'RIGHT',
          author: 'reviewer',
          createdAt: '2024-01-15T11:00:00Z',
          url: 'https://github.com/user/demo-project/pull/123#discussion_r2',
        },
      ]
    }

    try {
      const result = execSync(
        `gh api repos/{owner}/{repo}/pulls/${prNumber}/comments --jq '.[] | {id: .id, body: .body, path: .path, line: .line, side: .side, author: .user.login, createdAt: .created_at, url: .html_url, inReplyToId: .in_reply_to_id}'`,
        {
          cwd: expandHomePath(repoDir),
          encoding: 'utf-8',
          timeout: 30000,
        }
      )

      const comments = result
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .filter(c => c !== null)

      return comments
    } catch {
      return []
    }
  })

  ipcMain.handle('gh:replyToComment', async (_event, repoDir: string, prNumber: number, commentId: number, body: string) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }

    try {
      execSync(
        `gh api repos/{owner}/{repo}/pulls/${prNumber}/comments -f body='${body.replace(/'/g, "'\\''")}' -f in_reply_to=${commentId}`,
        {
          cwd: expandHomePath(repoDir),
          encoding: 'utf-8',
          timeout: 30000,
        }
      )
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('gh:prsToReview', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return [
        { number: 55, title: 'Add dark mode support', author: 'alice', url: 'https://github.com/user/demo-project/pull/55', headRefName: 'feature/dark-mode', baseRefName: 'main', labels: ['feature'] },
        { number: 48, title: 'Fix memory leak in worker pool', author: 'bob', url: 'https://github.com/user/demo-project/pull/48', headRefName: 'fix/memory-leak', baseRefName: 'main', labels: ['bug', 'performance'] },
      ]
    }

    try {
      const result = execSync('gh pr list --search "review-requested:@me" --json number,title,author,url,headRefName,baseRefName,labels --limit 30', {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 30000,
      })
      const prs = JSON.parse(result)
      return prs.map((pr: { number: number; title: string; author: { login: string }; url: string; headRefName: string; baseRefName: string; labels: { name: string }[] }) => ({
        number: pr.number,
        title: pr.title,
        author: pr.author?.login || 'unknown',
        url: pr.url,
        headRefName: pr.headRefName,
        baseRefName: pr.baseRefName,
        labels: (pr.labels || []).map((l: { name: string }) => l.name),
      }))
    } catch (error) {
      console.error('Failed to fetch PRs for review:', error)
      return []
    }
  })

  ipcMain.handle('gh:submitDraftReview', async (_event, repoDir: string, prNumber: number, comments: { path: string; line: number; body: string }[]) => {
    if (ctx.isE2ETest) {
      return { success: true, reviewId: 999 }
    }

    try {
      const result = execSync(
        `gh api repos/{owner}/{repo}/pulls/${prNumber}/reviews -X POST -f event=PENDING -f body="" --input -`,
        {
          cwd: expandHomePath(repoDir),
          encoding: 'utf-8',
          timeout: 30000,
          input: JSON.stringify({ event: 'PENDING', body: '', comments }),
        }
      )
      const parsed = JSON.parse(result)
      return { success: true, reviewId: parsed.id }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })
}
