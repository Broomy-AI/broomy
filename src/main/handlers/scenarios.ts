/**
 * Centralized E2E mock data for each scenario.
 *
 * All scenario-specific test data lives here so handlers don't need
 * scattered if/else branches. Handlers call getScenarioData() and
 * access the relevant field.
 *
 * ⚠️  The 'marketing' scenario generates screenshots used on the Broomy
 * marketing website. Edit its data with care — changes affect published content.
 */
import { join } from 'path'
import { tmpdir } from 'os'
import { normalizePath } from '../platform'
import { E2EScenario } from './types'

// ── Shared mock data (used by both scenarios or when not scenario-specific) ──

const IM = 'im' + 'port' // avoid Vite bundler parsing

export const SHARED_README = [
  '# Project Overview',
  '',
  'This project provides a comprehensive authentication system with JWT-based token management, session tracking, and automatic token rotation for secure API access across distributed microservices.',
  '',
  '## Getting Started',
  '',
  'To get started with this project, you need to install the dependencies using your preferred package manager, configure the environment variables for JWT secrets and Redis connection strings, and run the database migrations before starting the development server.',
  '',
  '## Architecture',
  '',
  'The authentication middleware validates incoming requests by extracting the bearer token from the Authorization header, verifying the JWT signature and expiration, checking the session store for revocation status, and attaching the decoded user payload to the request object for downstream handlers.',
  '',
  '## Contributing',
  '',
  'We welcome contributions from the community. Please read our [contributing guidelines](https://github.com/example/project/blob/main/CONTRIBUTING.md), set up your development environment following the instructions above, create a feature branch, write tests for your changes, and submit a pull request with a clear description of what you changed and why.',
  '',
  '## Resources',
  '',
  'For more information, see the [API documentation](https://docs.example.com/api) and the [project homepage](https://example.com).',
].join('\n')

// ── Scenario data definitions ──

interface ScenarioSession {
  id: string
  name: string
  directory: string
  agentId: string | null
  issueNumber?: number
  issueTitle?: string
  issueUrl?: string
}

interface ScenarioGitStatus {
  files: { path: string; status: string; staged: boolean; indexStatus: string; workingDirStatus: string }[]
  ahead: number
  behind: number
  tracking: string | null
}

interface ScenarioBranchChanges {
  files: { path: string; status: string }[]
  baseBranch: string
  mergeBase: string
}

interface ScenarioBranchCommits {
  commits: { hash: string; shortHash: string; message: string; author: string; date: string; pushed: boolean }[]
  baseBranch: string
}

interface DirListing {
  name: string
  isDirectory: boolean
}

interface ScenarioFileTree {
  /** Returns directory listing for the given suffix, or null if no override */
  readDir: (dirSuffix: string) => DirListing[] | null
}

interface ScenarioData {
  sessions: ScenarioSession[]
  branches: Record<string, string>
  gitStatus: ScenarioGitStatus
  branchChanges: ScenarioBranchChanges
  branchCommits: ScenarioBranchCommits
  diff: string
  /** Return file content as it appears at HEAD (for git:show). Takes filePath. */
  show: (filePath: string) => string
  fileTree: ScenarioFileTree
  /** Return file content for the given path, or null to fall through to shared logic */
  readFile: (filePath: string) => string | null
  /** Whether fs:exists should return true for marketing review file paths */
  hasMarketingReviewFiles: boolean
  updater: { updateAvailable: boolean; version?: string; releaseNotes?: string }
  /** Script path for agent terminal (relative to scripts/). null = use default. */
  agentScript: (sessionId: string) => string | null
}

// ── Marketing scenario ──

function buildMarketingAuthTs(): string {
  const lines = []
  lines.push(`${IM} { Request, Response, NextFunction } from 'express'`)
  lines.push(`${IM} jwt from 'jsonwebtoken'`)
  lines.push(`${IM} { TokenService } from '../services/token'`)
  lines.push(`${IM} { SessionStore } from '../services/session'`)
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

function buildMarketingOldAuthTs(): string {
  const lines = []
  lines.push(`${IM} { Request, Response, NextFunction } from 'express'`)
  lines.push(`${IM} jwt from 'jsonwebtoken'`)
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

function buildMarketingDiff(): string {
  const lines = []
  lines.push('diff --git a/src/middleware/auth.ts b/src/middleware/auth.ts')
  lines.push('--- a/src/middleware/auth.ts')
  lines.push('+++ b/src/middleware/auth.ts')
  lines.push('@@ -1,15 +1,42 @@')
  lines.push(` ${IM} { Request, Response, NextFunction } from 'express'`)
  lines.push(` ${IM} jwt from 'jsonwebtoken'`)
  lines.push('-// TODO: Add proper token validation')
  lines.push(`+${IM} { TokenService } from '../services/token'`)
  lines.push(`+${IM} { SessionStore } from '../services/session'`)
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

function buildMarketingReviewJson(): string {
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

const MARKETING_FILE_TREE_DIRS: Record<string, DirListing[]> = {
  '/src': [
    { name: 'components', isDirectory: true },
    { name: 'middleware', isDirectory: true },
    { name: 'routes', isDirectory: true },
    { name: 'services', isDirectory: true },
    { name: 'types', isDirectory: true },
    { name: 'utils', isDirectory: true },
    { name: 'app.ts', isDirectory: false },
    { name: 'config.ts', isDirectory: false },
    { name: 'index.ts', isDirectory: false },
  ],
  '/middleware': [
    { name: 'auth.ts', isDirectory: false },
    { name: 'cors.ts', isDirectory: false },
    { name: 'rateLimit.ts', isDirectory: false },
  ],
  '/services': [
    { name: 'session.ts', isDirectory: false },
    { name: 'token.ts', isDirectory: false },
    { name: 'user.ts', isDirectory: false },
  ],
  '/routes': [
    { name: 'auth.ts', isDirectory: false },
    { name: 'users.ts', isDirectory: false },
    { name: 'health.ts', isDirectory: false },
  ],
}

const MARKETING_ROOT_LISTING: DirListing[] = [
  { name: 'src', isDirectory: true },
  { name: 'tests', isDirectory: true },
  { name: '.env.example', isDirectory: false },
  { name: 'docker-compose.yml', isDirectory: false },
  { name: 'Dockerfile', isDirectory: false },
  { name: 'package.json', isDirectory: false },
  { name: 'README.md', isDirectory: false },
  { name: 'tsconfig.json', isDirectory: false },
]

const MARKETING: ScenarioData = {
  sessions: [
    { id: '1', name: 'backend-api', directory: normalizePath(join(tmpdir(), 'broomy-e2e-backend-api')), agentId: 'claude' },
    { id: '2', name: 'web-dashboard', directory: normalizePath(join(tmpdir(), 'broomy-e2e-web-dashboard')), agentId: 'codex' },
    { id: '3', name: 'mobile-app', directory: normalizePath(join(tmpdir(), 'broomy-e2e-mobile-app')), agentId: 'gemini' },
    { id: '4', name: 'payments-svc', directory: normalizePath(join(tmpdir(), 'broomy-e2e-payments-svc')), agentId: 'claude' },
    { id: '5', name: 'search-engine', directory: normalizePath(join(tmpdir(), 'broomy-e2e-search-engine')), agentId: 'claude' },
    { id: '6', name: 'infra-config', directory: normalizePath(join(tmpdir(), 'broomy-e2e-infra-config')), agentId: 'codex' },
    { id: '7', name: 'docs-site', directory: normalizePath(join(tmpdir(), 'broomy-e2e-docs-site')), agentId: null },
    { id: '8', name: 'data-pipeline', directory: normalizePath(join(tmpdir(), 'broomy-e2e-data-pipeline')), agentId: 'claude' },
  ],
  branches: {
    [normalizePath(join(tmpdir(), 'broomy-e2e-backend-api'))]: 'feature/jwt-auth',
    [normalizePath(join(tmpdir(), 'broomy-e2e-web-dashboard'))]: 'fix/dashboard-perf',
    [normalizePath(join(tmpdir(), 'broomy-e2e-mobile-app'))]: 'feature/push-notifs',
    [normalizePath(join(tmpdir(), 'broomy-e2e-payments-svc'))]: 'feature/stripe-webhooks',
    [normalizePath(join(tmpdir(), 'broomy-e2e-search-engine'))]: 'feature/vector-search',
    [normalizePath(join(tmpdir(), 'broomy-e2e-infra-config'))]: 'fix/k8s-scaling',
    [normalizePath(join(tmpdir(), 'broomy-e2e-docs-site'))]: 'main',
    [normalizePath(join(tmpdir(), 'broomy-e2e-data-pipeline'))]: 'feature/batch-processing',
  },
  gitStatus: {
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
  },
  branchChanges: {
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
  },
  branchCommits: {
    commits: [
      { hash: 'a1b2c3d4e5f60', shortHash: 'a1b2c3d', message: 'Add JWT token refresh with rotation', author: 'Claude', date: '2025-01-15T14:30:00Z', pushed: false },
      { hash: 'b2c3d4e5f6a70', shortHash: 'b2c3d4e', message: 'Implement session store with Redis backend', author: 'Claude', date: '2025-01-15T14:15:00Z', pushed: false },
      { hash: 'c3d4e5f6a7b80', shortHash: 'c3d4e5f', message: 'Add auth middleware with token validation', author: 'Claude', date: '2025-01-15T14:00:00Z', pushed: true },
      { hash: 'd4e5f6a7b8c90', shortHash: 'd4e5f6a', message: 'Set up authentication routes and types', author: 'Claude', date: '2025-01-15T13:45:00Z', pushed: true },
    ],
    baseBranch: 'main',
  },
  diff: buildMarketingDiff(),
  show: () => buildMarketingOldAuthTs(),
  fileTree: {
    readDir(dirSuffix: string): DirListing[] | null {
      for (const [suffix, entries] of Object.entries(MARKETING_FILE_TREE_DIRS)) {
        if (dirSuffix.endsWith(suffix)) return entries
      }
      return MARKETING_ROOT_LISTING
    },
  },
  readFile(filePath: string): string | null {
    if (filePath.includes('auth.ts')) return buildMarketingAuthTs()
    if (/broomy-review-[^/\\]+[/\\]review\.json$/.exec(filePath)) return buildMarketingReviewJson()
    if (/\/tmp\/broomy-review-[^/]+\/comments\.json$/.exec(filePath)) return '[]'
    return null
  },
  hasMarketingReviewFiles: true,
  updater: { updateAvailable: true, version: '0.9.0', releaseNotes: 'Dark mode support\nImproved performance\nBug fixes' },
  agentScript(sessionId: string): string | null {
    if (sessionId === '1') return 'fake-claude-screenshot.sh'
    return 'fake-claude-screenshot-idle.sh'
  },
}

// ── Default scenario ──

const DEFAULT: ScenarioData = {
  sessions: [
    { id: '1', name: 'broomy', directory: normalizePath(join(tmpdir(), 'broomy-e2e-broomy')), agentId: 'claude', issueNumber: 42, issueTitle: 'Add user authentication', issueUrl: 'https://github.com/user/broomy/issues/42' },
    { id: '2', name: 'backend-api', directory: normalizePath(join(tmpdir(), 'broomy-e2e-backend-api')), agentId: 'aider', issueNumber: 15, issueTitle: 'Fix API rate limiting', issueUrl: 'https://github.com/user/backend-api/issues/15' },
    { id: '3', name: 'docs-site', directory: normalizePath(join(tmpdir(), 'broomy-e2e-docs-site')), agentId: null },
  ],
  branches: {
    [normalizePath(join(tmpdir(), 'broomy-e2e-broomy'))]: 'main',
    [normalizePath(join(tmpdir(), 'broomy-e2e-backend-api'))]: 'feature/auth',
    [normalizePath(join(tmpdir(), 'broomy-e2e-docs-site'))]: 'main',
  },
  gitStatus: {
    files: [
      { path: 'src/index.ts', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
      { path: 'README.md', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
      { path: 'logo.png', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
    ],
    ahead: 0,
    behind: 0,
    tracking: null,
  },
  branchChanges: {
    files: [
      { path: 'src/index.ts', status: 'modified' },
      { path: 'src/new-feature.ts', status: 'added' },
    ],
    baseBranch: 'main',
    mergeBase: 'abc1234',
  },
  branchCommits: {
    commits: [
      { hash: 'abc1234567890', shortHash: 'abc1234', message: 'Add new feature', author: 'Test User', date: '2025-01-15T10:00:00Z', pushed: false },
      { hash: 'def5678901234', shortHash: 'def5678', message: 'Fix styling bug', author: 'Test User', date: '2025-01-14T09:00:00Z', pushed: true },
    ],
    baseBranch: 'main',
  },
  diff: `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
+// New comment
 export function main() {
   console.log('Hello')
 }`,
  show: (filePath: string) => {
    if (filePath.endsWith('README.md')) {
      return [
        '# Project Overview',
        '',
        'This project provides a basic authentication system with token validation for API access.',
        '',
        '## Getting Started',
        '',
        'Install dependencies and run the development server.',
        '',
        '## Architecture',
        '',
        'The authentication middleware validates incoming requests by checking the token from the Authorization header.',
      ].join('\n')
    }
    return `export function main() {\n  console.log('Hello')\n}`
  },
  fileTree: {
    readDir(dirSuffix: string): DirListing[] | null {
      if (dirSuffix.endsWith('/src')) {
        return [
          { name: 'index.ts', isDirectory: false },
          { name: 'utils.ts', isDirectory: false },
        ]
      }
      return null // use default minimal listing
    },
  },
  readFile(filePath: string): string | null {
    if (filePath.endsWith('src/index.ts')) {
      return `${IM} { add } from './utils'\n\nexport function main(): void {\n  const result = add(2, 3)\n  console.log('Result:', result)\n}\n`
    }
    if (filePath.endsWith('src/utils.ts')) {
      return 'export function add(a: number, b: number): number {\n  return a + b\n}\n\nexport function multiply(a: number, b: number): number {\n  return a * b\n}\n'
    }
    // Default scenario markdown review data (dark mode theme)
    if (/\.broomy[/\\]output[/\\]review\.md$/.exec(filePath)) {
      return [
        '## Overview',
        'Add dark mode theme support with user preference persistence. Uses CSS custom properties for theming with a React context provider. Theme preference persisted in localStorage.',
        '',
        '## Change Analysis',
        '- [x] Reviewed file structure',
        '- [x] Identified change patterns',
        '',
        '### Theme context and provider',
        'New ThemeContext and ThemeProvider for managing dark/light mode state.',
        '[src/contexts/ThemeContext.tsx:1-25](src/contexts/ThemeContext.tsx#L1-L25)',
        '',
        '### CSS variable updates',
        'Updated CSS custom properties in `:root` and `[data-theme="dark"]` selectors.',
        '[src/styles/theme.css:12-30](src/styles/theme.css#L12-L30)',
        '',
        '## Potential Issues',
        '',
        '### Flash of unstyled content on load',
        '- [ ] Resolved',
        '',
        'Theme is read from localStorage after React hydration, causing a brief flash of default theme.',
        'Location: [src/contexts/ThemeContext.tsx:15-20](src/contexts/ThemeContext.tsx#L15-L20)',
        '',
        '## Design Decisions',
        '',
        '### localStorage over cookies',
        '- [x] Reviewed',
        '',
        'Theme preference stored in localStorage — simpler but not available server-side.',
        'Alternatives: HTTP cookie, Server-side session',
      ].join('\n')
    }
    // Default scenario review data (dark mode theme) — legacy JSON format
    if (/\.broomy[/\\]output[/\\]review\.json$/.exec(filePath) || /broomy-review-[^/\\]+[/\\]review\.json$/.exec(filePath)) {
      return JSON.stringify({
        generatedAt: '2025-01-15T10:30:00Z',
        headCommit: 'abc123',
        overview: {
          purpose: 'Add dark mode theme support with user preference persistence.',
          approach: 'Uses CSS custom properties for theming with a React context provider. Theme preference persisted in localStorage.',
        },
        changePatterns: [
          {
            id: 'cp1',
            title: 'Theme context and provider',
            description: 'New ThemeContext and ThemeProvider for managing dark/light mode state.',
            locations: [{ file: 'src/contexts/ThemeContext.tsx', startLine: 1 }],
          },
          {
            id: 'cp2',
            title: 'CSS variable updates',
            description: 'Updated CSS custom properties in :root and [data-theme="dark"] selectors.',
            locations: [{ file: 'src/styles/theme.css', startLine: 12 }],
          },
        ],
        potentialIssues: [
          {
            id: 'pi1',
            title: 'Flash of unstyled content on load',
            description: 'Theme is read from localStorage after React hydration, causing a brief flash of default theme.',
            severity: 'medium',
            locations: [{ file: 'src/contexts/ThemeContext.tsx', startLine: 15 }],
          },
        ],
        designDecisions: [
          {
            id: 'dd1',
            title: 'localStorage over cookies',
            description: 'Theme preference stored in localStorage — simpler but not available server-side.',
            alternatives: ['HTTP cookie', 'Server-side session'],
            locations: [],
          },
        ],
      })
    }
    if (/\.broomy[/\\]output[/\\]comments\.json$/.exec(filePath) || /\/tmp\/broomy-review-[^/]+\/comments\.json$/.exec(filePath)) {
      return '[]'
    }
    return null
  },
  hasMarketingReviewFiles: false,
  updater: { updateAvailable: false },
  agentScript(): string | null {
    return null // use default fake-claude.sh
  },
}

// ── Public API ──

const SCENARIOS: Record<E2EScenario, ScenarioData> = {
  [E2EScenario.Default]: DEFAULT,
  [E2EScenario.Marketing]: MARKETING,
}

export function getScenarioData(scenario: E2EScenario): ScenarioData {
  return SCENARIOS[scenario]
}

export type { ScenarioData }
