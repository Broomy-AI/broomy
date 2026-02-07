# Screenshot Generation Plan

## Overview

Screenshots are generated automatically via Playwright by launching the real Broomy app in E2E mode. This ensures screenshots always reflect the actual product — no mockups, no Figma renders.

The screenshot pipeline consists of:
1. An **enhanced fake-claude script** (`scripts/fake-claude-demo.sh`) that produces more realistic, varied terminal output
2. A **Playwright screenshot script** (`scripts/generate-screenshots.ts`) that orchestrates the app into specific states and captures high-res screenshots
3. A **build step** that converts PNGs to optimized WebP with fallbacks

## Enhanced Fake Claude Script

The existing `fake-claude.sh` is minimal — good for testing, but the output doesn't look impressive in screenshots. We need a demo-quality version.

### `scripts/fake-claude-demo.sh`

This script simulates a realistic Claude Code session. It should produce output that looks like a developer actually using Claude to work on code.

```bash
#!/bin/bash
# Demo-quality Claude Code simulation for website screenshots

# Phase 1: Startup
echo ""
echo "  Claude Code v1.0.23"
echo "  Model: claude-sonnet-4-5-20250929"
echo ""
echo "  Type your request, or /help for commands"
echo ""

sleep 0.5

# Phase 2: User prompt
echo "❯ Add error handling to the API routes and write tests"
sleep 0.3

# Phase 3: Working state with realistic tool use output
echo ""
echo "  I'll add comprehensive error handling to your API routes and write tests."
echo "  Let me start by reading the existing code."
echo ""

# Simulate tool calls with spinners
simulate_tool "Read" "src/routes/api.ts" 1.5
echo "    Found 3 route handlers without try/catch blocks"
echo ""

simulate_tool "Read" "src/middleware/errors.ts" 1.0
echo "    Existing ErrorHandler class can be extended"
echo ""

simulate_tool "Edit" "src/routes/api.ts" 2.0
echo "    Added try/catch to all route handlers"
echo "    Added input validation with Zod schemas"
echo "    Added proper HTTP status codes"
echo ""

simulate_tool "Write" "src/routes/api.test.ts" 2.5
echo "    Created 12 test cases covering:"
echo "    - Success paths for all endpoints"
echo "    - Validation error responses"
echo "    - Database error handling"
echo "    - Rate limiting behavior"
echo ""

# Phase 4: Done
echo "  ✓ Updated src/routes/api.ts - Added error handling"
echo "  ✓ Created src/routes/api.test.ts - 12 test cases"
echo ""
echo "  All changes applied. Run \`pnpm test\` to verify."
echo ""

# Show the idle prompt
echo "❯ "

sleep 999999
```

The `simulate_tool` function shows a spinner, tool name, and file path — mimicking Claude Code's actual output format.

### Variant scripts for different sessions

We need different demo content for each session visible in the sidebar:

**Session 1: "web-app" (branch: main, agent: Claude Code)**
- Shows the full demo above — agent actively working on code

**Session 2: "backend-api" (branch: feature/auth, agent: Claude Code)**
- Shows completed work — agent is idle with a `❯` prompt
- Terminal shows summary of previously completed auth middleware implementation

**Session 3: "mobile-app" (branch: fix/navigation, agent: Aider)**
- Shows the Aider prompt style — agent is idle

**Session 4: "docs" (branch: main, no agent)**
- Just a user terminal with some recent commands visible

### Mock data enhancements

The E2E mock data for screenshots should be richer than the test data:

```typescript
const DEMO_SESSIONS = [
  {
    id: '1', name: 'web-app',
    directory: '/Users/dev/projects/web-app',
    agentId: 'claude', branch: 'main',
    status: 'working', // Will be set by fake-claude output
  },
  {
    id: '2', name: 'backend-api',
    directory: '/Users/dev/projects/backend-api',
    agentId: 'claude', branch: 'feature/auth',
    status: 'idle',
    lastMessage: 'Created auth middleware',
    isUnread: true, // Blue dot — just finished
  },
  {
    id: '3', name: 'mobile-app',
    directory: '/Users/dev/projects/mobile-app',
    agentId: 'aider', branch: 'fix/navigation',
    status: 'idle',
  },
  {
    id: '4', name: 'docs',
    directory: '/Users/dev/projects/docs',
    agentId: null, branch: 'main',
  },
]
```

The mock git status should show realistic file changes:
```typescript
const DEMO_GIT_STATUS = {
  '/Users/dev/projects/web-app': {
    files: [
      { path: 'src/routes/api.ts', status: 'modified', staged: true },
      { path: 'src/routes/api.test.ts', status: 'added', staged: false },
      { path: 'src/middleware/errors.ts', status: 'modified', staged: false },
    ],
    ahead: 2, behind: 0, tracking: 'origin/main',
    current: 'main',
  }
}
```

The mock file system should return a realistic file tree:
```typescript
const DEMO_FILE_TREE = [
  { name: 'src', isDirectory: true, children: [
    { name: 'routes', isDirectory: true, children: [
      { name: 'api.ts', isDirectory: false },
      { name: 'api.test.ts', isDirectory: false },
      { name: 'auth.ts', isDirectory: false },
    ]},
    { name: 'middleware', isDirectory: true, children: [
      { name: 'errors.ts', isDirectory: false },
      { name: 'auth.ts', isDirectory: false },
    ]},
    { name: 'index.ts', isDirectory: false },
  ]},
  { name: 'package.json', isDirectory: false },
  { name: 'tsconfig.json', isDirectory: false },
  { name: 'README.md', isDirectory: false },
]
```

## Screenshot Capture Script

### `scripts/generate-screenshots.ts`

A standalone Playwright script (not a test) that launches the app, navigates to specific states, and captures screenshots.

```typescript
import { _electron as electron } from 'playwright'
import path from 'path'

const SCREENSHOT_DIR = path.join(__dirname, '..', 'website', 'public', 'screenshots')
const WINDOW_WIDTH = 1400
const WINDOW_HEIGHT = 900

async function main() {
  // Build the app first
  execSync('pnpm build', { stdio: 'inherit' })

  const app = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: 'false',  // Need visible window for proper rendering
      E2E_DEMO_MODE: 'true',  // Flag to use enhanced demo data
    },
  })

  const page = await app.firstWindow()
  await page.setViewportSize({ width: WINDOW_WIDTH, height: WINDOW_HEIGHT })
  await page.waitForSelector('#root > div', { timeout: 10000 })

  // Capture each screenshot scenario
  await captureHero(page)
  await captureSidebar(page)
  await captureExplorer(page)
  await captureDiff(page)
  await captureSettings(page)

  await app.close()
}
```

## Screenshot Scenarios

Each scenario describes the exact app state to capture.

### 1. Hero Screenshot (`hero.png`)
**Purpose**: Main hero image showing the full app in its most impressive state.

**State**:
- Session "web-app" selected (agent working)
- Explorer panel OPEN (left side) — showing file tree with source control tab active
- Agent terminal visible (center) — showing Claude working with tool use output
- User terminal visible (bottom, small) — showing a recent `pnpm test` output
- File viewer NOT visible (too much for hero — keep focus on sidebar + terminal + explorer)
- Sidebar visible with all 4 sessions

**Capture timing**: ~3 seconds into fake-claude-demo.sh (during the "Edit" tool call phase) so the terminal shows realistic working output.

**Steps**:
```typescript
async function captureHero(page) {
  // Select web-app session
  await page.click('.cursor-pointer:has-text("web-app")')
  await page.waitForTimeout(500)

  // Open Explorer panel
  await page.click('button:has-text("Explorer")')
  await page.waitForTimeout(300)

  // Open user terminal
  await page.click('button:has-text("Terminal")')
  await page.waitForTimeout(300)

  // Wait for fake-claude to produce good output
  await page.waitForTimeout(3000)

  // Capture
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'hero.png'),
    type: 'png',
  })
}
```

### 2. Multi-Session Sidebar (`sidebar.png`)
**Purpose**: Close-up showing the session sidebar with status indicators.

**State**:
- All 4 sessions visible
- "web-app" is working (green dot + spinner text)
- "backend-api" has unread notification (blue dot)
- "mobile-app" is idle
- "docs" is idle, no agent

**Capture**: Crop to just the sidebar area (left ~250px).

```typescript
async function captureSidebar(page) {
  // Wait for status indicators to settle
  await page.waitForTimeout(2000)

  const sidebar = page.locator('[data-panel-id="sidebar"]')
  await sidebar.screenshot({
    path: path.join(SCREENSHOT_DIR, 'sidebar.png'),
    type: 'png',
  })
}
```

### 3. Explorer & Source Control (`explorer.png`)
**Purpose**: Show the file explorer with git status integration.

**State**:
- Explorer panel open
- Source control tab selected (showing modified/staged files)
- File tree visible above with folder structure

**Capture**: Crop to Explorer panel area.

```typescript
async function captureExplorer(page) {
  // Ensure explorer is open
  const explorerVisible = await page.locator('[data-panel-id="explorer"]').isVisible()
  if (!explorerVisible) {
    await page.click('button:has-text("Explorer")')
    await page.waitForTimeout(300)
  }

  // Click on source control tab within explorer
  await page.click('text=Source Control')
  await page.waitForTimeout(500)

  const explorer = page.locator('[data-panel-id="explorer"]')
  await explorer.screenshot({
    path: path.join(SCREENSHOT_DIR, 'explorer.png'),
    type: 'png',
  })
}
```

### 4. Code Diff View (`diff.png`)
**Purpose**: Show the file viewer in diff mode with syntax highlighting.

**State**:
- File viewer open showing a diff of `src/routes/api.ts`
- Side-by-side diff visible (left = original, right = modified)
- Explorer closed to give diff more space

**Capture**: Full window to show the diff in context.

**Note**: This requires mock file content and diff data to be returned by the E2E handlers. We need to add mock data for `fs:readFile` and `git:diff` that returns realistic TypeScript code.

```typescript
async function captureDiff(page) {
  // Close explorer, open file viewer
  // Click on a modified file in source control to open diff
  await page.click('text=src/routes/api.ts')
  await page.waitForTimeout(1000)

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'diff.png'),
    type: 'png',
  })
}
```

### 5. Agent Settings (`settings.png`)
**Purpose**: Show the agent configuration with multiple agents defined.

**State**:
- Settings panel open
- Agent list showing Claude Code and Aider configurations
- Repository list visible below

```typescript
async function captureSettings(page) {
  // Open settings
  await page.click('button[title*="Settings"]')
  await page.waitForTimeout(500)

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'settings.png'),
    type: 'png',
  })
}
```

## Implementation Requirements

### Changes to the E2E mock system

To produce screenshot-quality output, we need:

1. **`E2E_DEMO_MODE` flag** — When set, use enhanced demo data instead of minimal test data:
   - More sessions (4 instead of 3)
   - Realistic directory paths (not `/tmp/e2e-*`)
   - Richer git status with staged/unstaged files
   - Realistic file tree data
   - Mock file contents for diff view

2. **`scripts/fake-claude-demo.sh`** — Enhanced agent simulation with:
   - Realistic Claude Code output format (tool calls, status messages)
   - Longer output for more impressive screenshots
   - Configurable via environment variables (which phase to show)

3. **Mock file content** — The `fs:readFile` handler needs to return realistic TypeScript code when in demo mode, so the diff view has real content to display.

4. **Window size control** — Ensure the Electron window opens at exactly 1400x900 (or 2800x1800 for Retina capture).

### Screenshot post-processing pipeline

```bash
# In the website build step:
# 1. Generate raw PNGs
pnpm --filter broomy run screenshots

# 2. Optimize for web
for f in website/public/screenshots/*.png; do
  # Create WebP version (quality 90, smaller file size)
  cwebp -q 90 "$f" -o "${f%.png}.webp"

  # Create blur placeholder (tiny, for loading state)
  convert "$f" -resize 20x -gaussian-blur 0x2 "${f%.png}-blur.jpg"
done
```

### npm script

Add to root `package.json`:
```json
{
  "scripts": {
    "screenshots": "playwright test scripts/generate-screenshots.ts --config scripts/playwright-screenshots.config.ts"
  }
}
```

## Screenshot Inventory

| Filename | Section | Content | Size |
|----------|---------|---------|------|
| `hero.png` | Hero | Full app, agent working, explorer open | 1400x900 |
| `sidebar.png` | Multi-session | Sidebar with status indicators | ~250x600 |
| `explorer.png` | Explorer & Git | File tree + source control | ~300x600 |
| `diff.png` | Code Review | Side-by-side diff view | 1400x900 |
| `settings.png` | Agents & Repos | Settings panel with agent config | 1400x900 |

All captured at 2x resolution (2800x1800 actual pixels) for Retina displays.
