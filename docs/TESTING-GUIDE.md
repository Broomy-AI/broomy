# Testing Guide

Broomy uses Vitest for unit tests and Playwright for end-to-end tests. This guide covers
the testing philosophy, patterns, and practical steps for writing tests in the codebase.

## Testing Philosophy

**Test pure functions and store actions, not React component rendering.** Broomy's UI
components are wired to Zustand stores and IPC calls. Rather than spinning up a full DOM
to render components, tests focus on:

- Utility functions (slugify, git helpers, status computation)
- Zustand store actions (load, add, toggle, update)
- IPC interaction patterns (mocked via `window.*` APIs)

This keeps the test suite fast, deterministic, and free of DOM-related flakiness.

## Unit Test Setup

### Configuration

Unit tests are configured in `vitest.config.ts`:

```ts
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src/renderer') },
  },
  test: {
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: [
        'src/renderer/utils/slugify.ts',
        'src/renderer/store/sessions.ts',
        'src/renderer/store/agents.ts',
        // ... all targeted files
      ],
      thresholds: { lines: 90 },
    },
  },
})
```

Tests run in a Node environment (not jsdom). The `src/test/setup.ts` file creates a
mock `window` object with every IPC API the renderer uses.

### Window API Mocks

`src/test/setup.ts` defines mocks for every `window.*` namespace. Each mock returns
sensible defaults:

```ts
const mockGit = {
  getBranch: vi.fn().mockResolvedValue('main'),
  isGitRepo: vi.fn().mockResolvedValue(true),
  status: vi.fn().mockResolvedValue({
    files: [], ahead: 0, behind: 0, tracking: null, current: 'main',
  }),
  diff: vi.fn().mockResolvedValue(''),
  // ... all git operations
}

const mockConfig = {
  load: vi.fn().mockResolvedValue({ agents: [], sessions: [], repos: [] }),
  save: vi.fn().mockResolvedValue({ success: true }),
}
```

The full set of mocked namespaces: `config`, `git`, `app`, `profiles`, `gh`, `shell`,
`repos`, `agents`, `menu`, `ts`, `fs`, `pty`, `dialog`.

For DOM-based tests (`.test.tsx`), `src/test/react-setup.ts` extends the base setup with
`@testing-library/jest-dom/vitest` matchers.

## Writing a Unit Test

### Simple Function Test

The simplest pattern tests a pure function directly. Here is `src/renderer/utils/slugify.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { issueToBranchName } from './slugify'

describe('issueToBranchName', () => {
  it('creates a branch name from issue number and title', () => {
    expect(issueToBranchName({ number: 42, title: 'Fix login bug' }))
      .toBe('42-fix-login-bug')
  })

  it('caps at 4 words', () => {
    expect(issueToBranchName({ number: 10, title: 'One two three four five six' }))
      .toBe('10-one-two-three-four')
  })

  it('handles empty title', () => {
    expect(issueToBranchName({ number: 7, title: '' }))
      .toBe('7-')
  })
})
```

Test files are co-located with source: `src/renderer/utils/slugify.ts` has its test at
`src/renderer/utils/slugify.test.ts`.

## Store Testing Patterns

Store tests interact with Zustand stores by calling `useStore.getState()` and
`useStore.setState()`. Window API mocks customize behavior per test with `vi.mocked()`.

From `src/renderer/store/sessions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSessionStore } from './sessions'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/types'

describe('useSessionStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Reset the store to a known state
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
      isLoading: true,
      showSidebar: true,
      showSettings: false,
      sidebarWidth: 224,
      toolbarPanels: [...DEFAULT_TOOLBAR_PANELS],
      globalPanelVisibility: {
        [PANEL_IDS.SIDEBAR]: true,
        [PANEL_IDS.SETTINGS]: false,
      },
    })
    // Configure mock responses for this test suite
    vi.mocked(window.config.load).mockResolvedValue({
      agents: [],
      sessions: [],
    })
    vi.mocked(window.config.save).mockResolvedValue({ success: true })
    vi.mocked(window.git.getBranch).mockResolvedValue('main')
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads sessions from config', async () => {
    vi.mocked(window.config.load).mockResolvedValue({
      agents: [],
      sessions: [
        { id: 's1', name: 'Session 1', directory: '/repo1' },
      ],
    })
    vi.mocked(window.git.getBranch).mockResolvedValue('feature/test')

    await useSessionStore.getState().loadSessions()
    const state = useSessionStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0].name).toBe('Session 1')
    expect(state.sessions[0].branch).toBe('feature/test')
    expect(state.activeSessionId).toBe('s1')
    expect(state.isLoading).toBe(false)
  })
})
```

Key patterns:

1. **Reset store state** in `beforeEach` using `useStore.setState()`
2. **Mock window APIs** using `vi.mocked(window.xyz.method).mockResolvedValue(...)`
3. **Call store actions** via `useStore.getState().someAction()`
4. **Assert state** via `useStore.getState()`

## Using Fake Timers

The session store debounces saves with a 500ms timeout. Tests that trigger saves need
fake timers to advance time and flush the debounce:

```ts
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()  // Always restore in cleanup
})

it('debounces save after toggle', async () => {
  // ... trigger a store action that debounces a save
  vi.advanceTimersByTime(500)
  await vi.runAllTimersAsync()
  expect(window.config.save).toHaveBeenCalled()
})
```

Always call `vi.useRealTimers()` in `afterEach` to avoid leaking fake timers into
other tests.

## Coverage Requirements

The project enforces a **90% line coverage threshold** on targeted files. The list of
files under coverage is explicit in `vitest.config.ts` -- not all files are included,
only those with testable logic:

- Store files: `sessions.ts`, `agents.ts`, `profiles.ts`, `repos.ts`, `errors.ts`
- Utility files: `slugify.ts`, `explorerHelpers.ts`, `branchStatus.ts`, `gitStatusNormalizer.ts`, etc.
- Parser files: `gitStatusParser.ts`

Run coverage with:

```bash
pnpm test:unit:coverage
```

If coverage drops below 90% on any targeted file, the command fails.

## E2E Test Architecture

### Overview

End-to-end tests launch the real Electron app with Playwright. The key mechanism is the
`E2E_TEST` environment variable: when set to `'true'`, every IPC handler in
`src/main/index.ts` returns mock data instead of touching real repos or APIs.

### Global Setup

`tests/global-setup.ts` runs once before all test files:

1. Ensures the Electron binary is downloaded
2. Runs `pnpm build` to produce the app bundle in `out/`

### Launching the App

From `tests/app.spec.ts`:

```ts
import { test, expect, _electron as electron } from '@playwright/test'

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 10000 })
})

test.afterAll(async () => {
  if (electronApp) await electronApp.close()
})
```

### Playwright Configuration

`playwright.config.ts` sets conservative defaults for Electron testing:

```ts
export default defineConfig({
  globalSetup: './tests/global-setup.ts',
  testDir: './tests',
  timeout: 30000,
  fullyParallel: false,   // Electron tests run serially
  workers: 1,             // Single worker
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
})
```

### How Fake Claude Works

`scripts/fake-claude.sh` simulates agent terminal activity for E2E tests. It outputs
spinner animations and status markers that the terminal activity detector can observe:

```bash
# Show ready marker
echo "FAKE_CLAUDE_READY"
sleep 0.3

# Simulate work with spinner
simulate_spinner 2 "Analyzing request..."
simulate_spinner 1 "Reading files..."
simulate_spinner 1 "Generating response..."

echo "Done! This is a simulated Claude response."

# Signal idle state
echo "FAKE_CLAUDE_IDLE"

# Keep running but idle (no output)
sleep 999999
```

This produces predictable terminal output that transitions from working to idle, allowing
tests to verify status detection behavior.

## Writing a New E2E Test

Add tests to `tests/app.spec.ts` (or create a new spec file in `tests/`). Tests use the
shared `electronApp` and `page` from `beforeAll`:

```ts
test('should show branch names for sessions', async () => {
  const mainBranch = page.locator('text=main').first()
  await expect(mainBranch).toBeVisible()

  const featureBranch = page.locator('text=feature/auth')
  await expect(featureBranch).toBeVisible()
})

test('should toggle Explorer panel', async () => {
  const filesButton = page.locator('button:has-text("Explorer")')
  await filesButton.click()
  await page.waitForTimeout(300)

  const explorerHeader = page.locator('text=Explorer').nth(1)
  await expect(explorerHeader).toBeVisible()
})
```

E2E tests never write to real config files, touch real git repos, or call real APIs.
All data comes from the mock handlers in `src/main/index.ts`.

## Running Tests

| Command | Description |
|---------|-------------|
| `pnpm test:unit` | Run all Vitest unit tests |
| `pnpm test:unit:watch` | Unit tests in watch mode |
| `pnpm test:unit:coverage` | Unit tests with 90% line coverage check |
| `pnpm test` | Run Playwright E2E tests (headless) |
| `pnpm test:headed` | E2E tests with visible Electron window |

### Recommended Workflow

1. Make code changes
2. Write or update unit tests for changed logic
3. Run `pnpm test:unit` to verify unit tests pass
4. Run `pnpm test:unit:coverage` to confirm coverage stays above 90%
5. Run `pnpm test` to verify E2E tests still pass
