import { IpcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { HandlerContext, expandHomePath } from './types'

const execFileAsync = promisify(execFile)

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
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
      const { stdout } = await execFileAsync('gh', [
        'api', `repos/{owner}/{repo}/pulls/${prNumber}/comments`,
        '--jq', '.[] | {id: .id, body: .body, path: .path, line: .line, side: .side, author: .user.login, createdAt: .created_at, url: .html_url, inReplyToId: .in_reply_to_id}',
      ], {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 30000,
      })

      const comments = stdout
        .trim()
        .split(/\r?\n/)
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

  ipcMain.handle('gh:prDescription', async (_event, repoDir: string, prNumber: number) => {
    if (ctx.isE2ETest) {
      return 'This PR adds dark mode support to the application.\n\n## Changes\n- Added theme toggle component\n- Updated CSS variables for dark/light themes\n- Persisted preference in localStorage'
    }

    try {
      const { stdout } = await execFileAsync('gh', [
        'pr', 'view', String(prNumber), '--json', 'body', '--jq', '.body',
      ], {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 30000,
      })
      return stdout.trim() || null
    } catch {
      return null
    }
  })

  ipcMain.handle('gh:prIssueComments', async (_event, repoDir: string, prNumber: number, page = 1, perPage = 20) => {
    if (ctx.isE2ETest) {
      return [
        {
          id: 101,
          body: 'Overall this looks great! Just a few minor suggestions.',
          author: 'reviewer',
          createdAt: '2024-01-15T09:00:00Z',
          url: 'https://github.com/user/demo-project/pull/123#issuecomment-101',
        },
        {
          id: 102,
          body: 'Could you add some tests for the edge cases?',
          author: 'maintainer',
          createdAt: '2024-01-15T12:00:00Z',
          url: 'https://github.com/user/demo-project/pull/123#issuecomment-102',
        },
      ]
    }

    try {
      const { stdout } = await execFileAsync('gh', [
        'api', `repos/{owner}/{repo}/issues/${prNumber}/comments`,
        '--jq', '.[] | {id: .id, body: .body, author: .user.login, createdAt: .created_at, url: .html_url}',
        '-F', `per_page=${perPage}`, '-F', `page=${page}`,
      ], {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 30000,
      })

      const comments = stdout
        .trim()
        .split(/\r?\n/)
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
      await execFileAsync('gh', [
        'api', `repos/{owner}/{repo}/pulls/${prNumber}/comments`,
        '-f', `body=${body}`,
        '-f', `in_reply_to=${commentId}`,
      ], {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 30000,
      })
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
      const { stdout } = await execFileAsync('gh', [
        'pr', 'list', '--search', 'review-requested:@me',
        '--json', 'number,title,author,url,headRefName,baseRefName,labels',
        '--limit', '30',
      ], {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 30000,
      })
      const prs = JSON.parse(stdout)
      return prs.map((pr: { number: number; title: string; author: { login: string }; url: string; headRefName: string; baseRefName: string; labels: { name: string }[] }) => ({
        number: pr.number,
        title: pr.title,
        author: pr.author.login || 'unknown',
        url: pr.url,
        headRefName: pr.headRefName,
        baseRefName: pr.baseRefName,
        labels: pr.labels.map((l: { name: string }) => l.name),
      }))
    } catch (error) {
      console.error('Failed to fetch PRs for review:', error)
      return []
    }
  })

  ipcMain.handle('gh:submitDraftReview', async (_event, repoDir: string, prNumber: number, _comments: { path: string; line: number; body: string }[]) => {
    if (ctx.isE2ETest) {
      return { success: true, reviewId: 999 }
    }

    try {
      const { stdout } = await execFileAsync('gh', [
        'api', `repos/{owner}/{repo}/pulls/${prNumber}/reviews`,
        '-X', 'POST', '-f', 'event=PENDING', '-f', 'body=',
        '--input', '-',
      ], {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 30000,
      })
      const parsed = JSON.parse(stdout)
      return { success: true, reviewId: parsed.id }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })
}
