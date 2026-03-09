/**
 * IPC handlers for fetching and replying to GitHub PR review comments via the gh CLI.
 */
import { IpcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { HandlerContext, expandHomePath } from './types'

const execFileAsync = promisify(execFile)

function parseJsonLines(stdout: string): unknown[] {
  return stdout.trim().split(/\r?\n/).filter(line => line.trim()).map(line => {
    try { return JSON.parse(line) } catch { return null }
  }).filter(c => c !== null)
}

async function fetchMyReviewStatus(repoDir: string, prNumber: number): Promise<'pending' | 'reviewed' | null> {
  try {
    const dir = expandHomePath(repoDir)
    const [slugResult, userResult] = await Promise.all([
      execFileAsync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { cwd: dir, encoding: 'utf-8', timeout: 10000 }),
      execFileAsync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf-8', timeout: 10000 }),
    ])
    const slug = slugResult.stdout.trim()
    const login = userResult.stdout.trim()
    if (!slug || !login) return null

    const { stdout } = await execFileAsync('gh', [
      'api', `repos/${slug}/pulls/${prNumber}/requested_reviewers`, '--jq',
      '[.users[].login, .teams[].slug] | join("\\n")',
    ], { cwd: dir, encoding: 'utf-8', timeout: 10000 })

    const reviewers = stdout.trim().split('\n').filter(Boolean)
    return reviewers.includes(login) ? 'pending' : 'reviewed'
  } catch {
    return null
  }
}

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
          reactions: [{ content: '+1', count: 2 }],
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
          reactions: [],
        },
      ]
    }

    try {
      const { stdout } = await execFileAsync('gh', [
        'api', `repos/{owner}/{repo}/pulls/${prNumber}/comments`,
        '--jq', '.[] | {id: .id, body: .body, path: .path, line: .line, side: .side, author: .user.login, createdAt: .created_at, url: .html_url, inReplyToId: .in_reply_to_id, reactions: (.reactions | to_entries | map(select(.key != "url" and .key != "total_count" and .value > 0) | {content: .key, count: .value}))}',
      ], {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 30000,
      })

      return parseJsonLines(stdout)
    } catch {
      return []
    }
  })

  ipcMain.handle('gh:prDescription', async (_event, repoDir: string, prNumber: number) => {
    if (ctx.isE2ETest) {
      // Use inline SVG data URIs so images render in E2E screenshots
      const dark = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#1a1a2e"/><text x="200" y="108" text-anchor="middle" fill="#e0e0e0" font-family="sans-serif" font-size="24">Dark Mode</text></svg>').toString('base64')}`
      const light = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#f0f0f0"/><text x="200" y="108" text-anchor="middle" fill="#333" font-family="sans-serif" font-size="24">Light Mode</text></svg>').toString('base64')}`
      return `This PR adds dark mode support to the application.\n\n## Changes\n- Added theme toggle component\n- Updated CSS variables for dark/light themes\n- Persisted preference in localStorage\n\n## Screenshots\n\n![Dark mode toggle](${dark})\n![Light mode toggle](${light})`
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
          reactions: [{ content: '+1', count: 1 }, { content: 'heart', count: 1 }],
        },
        {
          id: 102,
          body: 'Could you add some tests for the edge cases?',
          author: 'maintainer',
          createdAt: '2024-01-15T12:00:00Z',
          url: 'https://github.com/user/demo-project/pull/123#issuecomment-102',
          reactions: [],
        },
      ]
    }

    try {
      const { stdout } = await execFileAsync('gh', [
        'api', `repos/{owner}/{repo}/issues/${prNumber}/comments`,
        '--jq', '.[] | {id: .id, body: .body, author: .user.login, createdAt: .created_at, url: .html_url, reactions: (.reactions | to_entries | map(select(.key != "url" and .key != "total_count" and .value > 0) | {content: .key, count: .value}))}',
        '-F', `per_page=${perPage}`, '-F', `page=${page}`,
      ], {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 30000,
      })

      return parseJsonLines(stdout)
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

  ipcMain.handle('gh:addReaction', async (_event, repoDir: string, commentId: number, reaction: string, commentType: 'review' | 'issue') => {
    if (ctx.isE2ETest) {
      return { success: true }
    }

    try {
      const endpoint = commentType === 'review'
        ? `repos/{owner}/{repo}/pulls/comments/${commentId}/reactions`
        : `repos/{owner}/{repo}/issues/comments/${commentId}/reactions`
      await execFileAsync('gh', [
        'api', endpoint, '-X', 'POST', '-f', `content=${reaction}`,
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

  ipcMain.handle('gh:myReviewStatus', async (_event, repoDir: string, prNumber: number) => {
    if (ctx.isE2ETest) return 'pending'
    return fetchMyReviewStatus(repoDir, prNumber)
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
