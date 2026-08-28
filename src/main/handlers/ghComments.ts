/**
 * IPC handlers for fetching and replying to GitHub PR review comments via the gh CLI.
 */
import { IpcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { HandlerContext, expandHomePath } from './types'
import type { PrReviewFilterMode } from '../../preload/apis/types'

const execFileAsync = promisify(execFile)

/**
 * The `gh pr list` search arguments that select each review filter mode.
 * `review-requested:@me` matches requests routed through a team the user belongs
 * to as well as direct ones; `user-review-requested:@me` matches only direct ones.
 * `all` passes no search argument, so `gh` lists every open PR.
 */
function prReviewFilterArgs(mode: PrReviewFilterMode): string[] {
  switch (mode) {
    case 'mine': return ['--search', 'user-review-requested:@me']
    case 'all': return []
    default: return ['--search', 'review-requested:@me']
  }
}

function parseJsonLines(stdout: string): unknown[] {
  return stdout.trim().split(/\r?\n/).filter(line => line.trim()).map(line => {
    try { return JSON.parse(line) } catch { return null }
  }).filter(c => c !== null)
}

/**
 * The reviewers GitHub still has an open review request for. Teams matter as much
 * as individuals: a PR whose only outstanding request is on a team is still waiting
 * on a review, and `.users` is empty in that case.
 */
interface RequestedReviewers {
  /** Logins of individually requested users. */
  users: string[]
  /** Slugs of requested teams. GitHub drops the request once any member reviews. */
  teams: string[]
}

/** The `--jq` filter that shapes /requested_reviewers into {@link RequestedReviewers}. */
const REQUESTED_REVIEWERS_JQ = '{users: [.users[].login], teams: [.teams[].slug]}'

function parseRequestedReviewers(stdout: string): RequestedReviewers {
  const parsed = JSON.parse(stdout.trim() || '{}') as Partial<RequestedReviewers>
  return { users: parsed.users ?? [], teams: parsed.teams ?? [] }
}

/** Total outstanding review requests, counting each requested team as one. */
function pendingReviewerCount(requested: RequestedReviewers): number {
  return requested.users.length + requested.teams.length
}

/** The review state of a PR at a point in time, as both chip computations need it. */
interface ReviewSnapshot {
  /**
   * Latest submitted review state per reviewer, excluding the PR author and bots.
   * Draft (PENDING) reviews are not visible to anyone else, so they are dropped.
   */
  latestByAuthor: Map<string, string>
  requested: RequestedReviewers
}

/**
 * Fetches the submitted reviews and open review requests for a PR.
 *
 * The PR author is excluded along with bots: GitHub lets you leave COMMENTED
 * reviews on your own PR, and those are not reviewer feedback.
 */
async function fetchReviewSnapshot(
  dir: string, slug: string, login: string, prNumber: number,
): Promise<ReviewSnapshot> {
  const [reviewsResult, requestedResult] = await Promise.all([
    execFileAsync('gh', [
      'api', `repos/${slug}/pulls/${prNumber}/reviews`, '--jq',
      `[.[] | select(.user.login != "${login}" and .user.type != "Bot") | {author: .user.login, state: .state}]`,
    ], { cwd: dir, encoding: 'utf-8', timeout: 15000 }),
    execFileAsync('gh', [
      'api', `repos/${slug}/pulls/${prNumber}/requested_reviewers`, '--jq',
      REQUESTED_REVIEWERS_JQ,
    ], { cwd: dir, encoding: 'utf-8', timeout: 10000 }),
  ])

  const reviews: { author: string; state: string }[] = JSON.parse(reviewsResult.stdout.trim() || '[]')
  const latestByAuthor = new Map<string, string>()
  for (const review of reviews) {
    if (review.state === 'PENDING') continue
    latestByAuthor.set(review.author, review.state)
  }

  return { latestByAuthor, requested: parseRequestedReviewers(requestedResult.stdout) }
}

/** Resolves the repo's owner/name slug and the authenticated user's login. */
async function fetchSlugAndLogin(dir: string): Promise<{ slug: string; login: string }> {
  const [slugResult, userResult] = await Promise.all([
    execFileAsync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { cwd: dir, encoding: 'utf-8', timeout: 10000 }),
    execFileAsync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf-8', timeout: 10000 }),
  ])
  return { slug: slugResult.stdout.trim(), login: userResult.stdout.trim() }
}

/**
 * Checks whether a PR has actionable feedback: either someone left a review that
 * did not approve (and hasn't been re-requested for review), or there are comments
 * since the last push.
 *
 * The non-approving-review rule mirrors GitHub's own UI: GitHub shows the
 * re-request icon next to any reviewer with a submitted review and no open
 * request, so a plain COMMENTED review is feedback to act on just like
 * CHANGES_REQUESTED is.
 */
async function fetchPrFeedbackStatus(repoDir: string, prNumber: number): Promise<boolean> {
  try {
    const dir = expandHomePath(repoDir)
    const { slug, login } = await fetchSlugAndLogin(dir)
    if (!slug || !login) return false

    // Exclude the PR author and bot accounts. Bots (GitHub Apps like
    // github-actions[bot], dependabot[bot], deployment bots announcing a
    // staging URL) have .user.type == "Bot" and are not actionable reviewer
    // feedback.
    const humanReviewerFilter = `select(.user.login != "${login}" and .user.type != "Bot")`

    // Fetch in parallel: reviews + requested reviewers, last push time, comments
    const [snapshot, lastPushResult, prCommentsResult, issueCommentsResult] = await Promise.all([
      fetchReviewSnapshot(dir, slug, login, prNumber),
      // Timestamp of the latest event on the head branch (last push)
      execFileAsync('gh', [
        'api', `repos/${slug}/pulls/${prNumber}`, '--jq',
        '.head.repo.pushed_at',
      ], { cwd: dir, encoding: 'utf-8', timeout: 10000 }),
      // Review comments (inline code comments)
      execFileAsync('gh', [
        'api', `repos/${slug}/pulls/${prNumber}/comments`, '--jq',
        `[.[] | ${humanReviewerFilter} | .created_at]`,
      ], { cwd: dir, encoding: 'utf-8', timeout: 15000 }),
      // Issue comments (top-level PR comments)
      execFileAsync('gh', [
        'api', `repos/${slug}/issues/${prNumber}/comments`, '--jq',
        `[.[] | ${humanReviewerFilter} | .created_at]`,
      ], { cwd: dir, encoding: 'utf-8', timeout: 15000 }),
    ])

    // 1. Check for unresolved non-approving reviews
    // A review is unresolved if its author is NOT in the requested_reviewers list
    // (re-requesting review clears the old review state on GitHub's side, but the reviewer
    // appears in requested_reviewers until they submit a new review).
    for (const [author, state] of snapshot.latestByAuthor) {
      if (state !== 'APPROVED' && !snapshot.requested.users.includes(author)) {
        return true
      }
    }

    // 2. Check for comments since last push
    const lastPushTime = lastPushResult.stdout.trim()
    if (lastPushTime) {
      const pushDate = new Date(lastPushTime)
      const allCommentDates: string[] = [
        ...JSON.parse(prCommentsResult.stdout.trim() || '[]'),
        ...JSON.parse(issueCommentsResult.stdout.trim() || '[]'),
      ]

      for (const dateStr of allCommentDates) {
        if (new Date(dateStr) > pushDate) {
          return true
        }
      }
    }

    return false
  } catch {
    return false
  }
}

export interface PrApprovalCounts {
  approved: number
  pending: number
  otherReviews: number
}

/**
 * Counts PR reviews for the waiting/approved chip. Mirrors fetchPrFeedbackStatus's
 * re-request handling: a reviewer who was re-requested (appears in
 * requested_reviewers) is counted as pending, not by their stale review state.
 * A requested team counts as one pending reviewer — a PR can be waiting on a team
 * with no individually requested user at all.
 */
async function fetchPrApprovalStatus(repoDir: string, prNumber: number): Promise<PrApprovalCounts> {
  const empty: PrApprovalCounts = { approved: 0, pending: 0, otherReviews: 0 }
  try {
    const dir = expandHomePath(repoDir)
    const { slug, login } = await fetchSlugAndLogin(dir)
    if (!slug || !login) return empty

    const { latestByAuthor, requested } = await fetchReviewSnapshot(dir, slug, login, prNumber)

    let approved = 0
    let otherReviews = 0
    for (const [author, state] of latestByAuthor) {
      if (requested.users.includes(author)) continue // re-requested -> counted as pending
      if (state === 'APPROVED') approved++
      else otherReviews++
    }

    return { approved, pending: pendingReviewerCount(requested), otherReviews }
  } catch {
    return empty
  }
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

    const [requestedResult, reviewsResult] = await Promise.all([
      execFileAsync('gh', [
        'api', `repos/${slug}/pulls/${prNumber}/requested_reviewers`, '--jq',
        '[.users[].login] | join("\\n")',
      ], { cwd: dir, encoding: 'utf-8', timeout: 10000 }),
      execFileAsync('gh', [
        'api', `repos/${slug}/pulls/${prNumber}/reviews`, '--jq',
        `[.[] | select(.user.login == "${login}" and .state != "PENDING") | .state] | join("\\n")`,
      ], { cwd: dir, encoding: 'utf-8', timeout: 10000 }),
    ])

    const requestedReviewers = requestedResult.stdout.trim().split('\n').filter(Boolean)
    if (requestedReviewers.includes(login)) return 'pending'

    const myReviews = reviewsResult.stdout.trim().split('\n').filter(Boolean)
    return myReviews.length > 0 ? 'reviewed' : 'pending'
  } catch {
    return null
  }
}

/** E2E mock data for the gh:prComments handler. */
const E2E_PR_COMMENTS = [
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

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('gh:prComments', async (_event, repoDir: string, prNumber: number) => {
    if (ctx.isE2ETest) {
      return E2E_PR_COMMENTS
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

  ipcMain.handle('gh:prsToReview', async (_event, repoDir: string, mode: PrReviewFilterMode = 'team') => {
    if (ctx.isE2ETest) {
      const mockPrs = [
        { number: 55, title: 'Add dark mode support', author: 'alice', url: 'https://github.com/user/demo-project/pull/55', headRefName: 'feature/dark-mode', baseRefName: 'main', labels: ['feature'] },
        { number: 48, title: 'Fix memory leak in worker pool', author: 'bob', url: 'https://github.com/user/demo-project/pull/48', headRefName: 'fix/memory-leak', baseRefName: 'main', labels: ['bug', 'performance'] },
      ]
      // 'all' lists open PRs nobody asked us to review, so it returns a superset
      return mode === 'all'
        ? [...mockPrs, { number: 42, title: 'Bump dependencies', author: 'carol', url: 'https://github.com/user/demo-project/pull/42', headRefName: 'chore/deps', baseRefName: 'main', labels: [] }]
        : mockPrs
    }

    try {
      const { stdout } = await execFileAsync('gh', [
        'pr', 'list', ...prReviewFilterArgs(mode),
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

  ipcMain.handle('gh:prFeedbackStatus', async (_event, repoDir: string, prNumber: number) => {
    if (ctx.isE2ETest) return false
    return fetchPrFeedbackStatus(repoDir, prNumber)
  })

  ipcMain.handle('gh:prApprovalStatus', async (_event, repoDir: string, prNumber: number) => {
    if (ctx.isE2ETest) return { approved: 0, pending: 0, otherReviews: 0 }
    return fetchPrApprovalStatus(repoDir, prNumber)
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
