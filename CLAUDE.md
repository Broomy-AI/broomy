# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Setup

```bash
pnpm install         # Install dependencies (use pnpm, not npm/yarn)
```

## Commands

```bash
pnpm dev             # Development with hot reload (renderer only; restart for main/preload changes)
pnpm build           # Build without packaging
pnpm dist            # Build and package for macOS
pnpm storybook       # Storybook dev server on port 6006
pnpm storybook:test  # Visual regression test (screenshot + pixel-diff + report)
pnpm storybook:update-refs  # Accept current screenshots as reference baseline
```

## Shell Commands

**Never use `${}` syntax (shell parameter expansion) in Bash tool calls.** This includes `$(...)` subshells and `${VAR}` variable expansions. These trigger manual approval prompts. Instead, use plain variable references like `$VAR`, pipe chains, or break commands into multiple sequential tool calls.

**Don't run tests or checks manually** — use `/validate` instead. It runs all checks in the right order and fixes failures automatically.

## Troubleshooting

`pnpm dev` runs preflight checks automatically and fixes common issues (missing Electron binary, native module problems). If preflight can't fix something, it tells you what to do.

**Nuclear option**: `rm -rf node_modules && pnpm install`

**Important**: This project enforces pnpm via a preinstall script. Do not use npm or yarn.

## Architecture

Broomy is an Electron + React desktop app for managing multiple AI coding agent sessions across different repositories. See `docs/architecture.md` for the full technical guide.

### Process Structure

- **Main process** (`src/main/index.ts`): All IPC handlers -- PTY management (node-pty), git operations (simple-git), filesystem I/O, GitHub CLI wrappers, config persistence, window lifecycle. Every handler checks `isE2ETest` and returns mock data during tests.
- **Preload** (`src/preload/index.ts`): Context bridge + type definitions. Exposes `window.pty`, `window.fs`, `window.git`, `window.gh`, `window.config`, `window.profiles`, `window.shell`, `window.repos`, `window.app`, `window.menu`, `window.dialog`.
- **Renderer** (`src/renderer/`): React UI with Zustand state management and Tailwind CSS.

### Key Renderer Organization

- **Stores** (`store/`): Four Zustand stores -- `sessions.ts` (session state, panel visibility, layout sizes, agent monitoring), `agents.ts` (agent definitions), `repos.ts` (managed repositories), `profiles.ts` (multi-window profiles), `errors.ts` (error tracking).
- **Components** (`components/`): `Layout.tsx` (main layout with drag-to-resize), `Terminal.tsx` (xterm.js wrapper), `Explorer.tsx` (file tree + source control), `FileViewer.tsx` (Monaco editor + diff), `SessionList.tsx`, `TabbedTerminal.tsx`, `NewSessionDialog.tsx`, `AgentSettings.tsx`, `ProfileChip.tsx`.
- **Panel system** (`panels/`): Registry-based modular panel system. Panel IDs defined in `types.ts`, registered in `builtinPanels.tsx`, accessed via React context in `PanelContext.tsx`. Five built-in panels: sidebar, explorer, fileViewer, tutorial, settings. The terminal area (agent + user tabs) is always visible and not part of the panel toggle system.
- **Utils** (`utils/`): `stripAnsi.ts` (ANSI escape removal), `explorerHelpers.ts` (git status display), `terminalBufferRegistry.ts` (cross-component terminal access), `slugify.ts` (issue-to-branch names), `textDetection.ts` (binary vs text), `branchStatus.ts` (branch status computation).

### Agent Activity Detection

Agent status is detected by time-based heuristics in `Terminal.tsx`. The detection logic:
- **Warmup**: Ignores the first 5 seconds after terminal creation
- **Input suppression**: Pauses detection for 200ms after user input or window interaction
- **Working**: Set immediately when terminal data arrives (if not paused)
- **Idle**: Set after 1 second of no terminal output, with a 300ms debounce for store updates

When a session transitions from working to idle (after at least 3 seconds of working), it's marked as `isUnread` to alert the user.

### Data Persistence

Config files at `~/.broomy/profiles/<profileId>/`:
- `config.json` (production) / `config.dev.json` (development)
- Contains agents, sessions with panel visibility and layout sizes, repos, toolbar panel order

Session store debounces saves with 500ms delay. Runtime-only state (`status`, `isUnread`, `lastMessage`) is never persisted.

### IPC Patterns

- Request/response: `ipcRenderer.invoke()` / `ipcMain.handle()` for most operations
- Event streaming: `webContents.send()` / `ipcRenderer.on()` for PTY data and file watcher events
- Events namespaced by ID: `pty:data:${id}`, `fs:change:${id}`

## External API Guidelines

- **Never poll GitHub API on a timer.** Only call `gh` commands on explicit user action (button clicks, view changes).
- **Prefer deriving state from local git data** (e.g. `git status`, ahead/behind counts, tracking branch) where possible.
- **PR state is persisted** in session config as `lastKnownPrState` and refreshed only when the user clicks the refresh button or opens the source-control Explorer view.

## Testing

Unit tests are co-located with source files (`src/**/*.test.ts`). Vitest with 90% line coverage threshold. E2E tests use Playwright with `E2E_TEST=true` for deterministic mock data. Storybook visual regression tests screenshot every component and diff against reference images. See `docs/testing-guide.md` for patterns and conventions.

### Storybook Visual Regression

```bash
pnpm storybook              # Dev server on port 6006
pnpm storybook:build        # Build to storybook-static/
pnpm storybook:test         # Screenshot all stories, diff against refs, generate report
pnpm storybook:update-refs  # Accept current screenshots as new references
```

Stories are co-located as `*.stories.tsx` next to source files. Reference images live in `.storybook-refs/` (checked into git). The diff report is generated at `.storybook-report/index.html`.

### Adding a new store

1. Create `src/renderer/store/myStore.ts` with Zustand
2. Load in `App.tsx` on mount
3. Create `src/renderer/store/myStore.test.ts`

## Skills

**Use these skills instead of doing things manually.** They encode the project's conventions and ensure nothing is forgotten.

| Skill | When to use |
|---|---|
| `/validate` | **After any code changes.** Runs lint, typecheck, check:all, unit tests, coverage, E2E — fixes failures automatically. |
| `/sync` | **Before starting or after finishing a chunk of work.** Commits current work, merges latest main, resolves conflicts, then validates. |
| `/feature-doc <slug>` | **After completing a feature.** Creates the required screenshot walkthrough spec. Every feature needs one — this is not optional. |
| `/code-review [path]` | **Before submitting work.** Scans for duplication, bad naming, wrong-layer code, missing mocks, style violations. |
| `/new-handler <ns:action>` | **When adding a new IPC handler.** Scaffolds handler + preload API + Window type + test mock in one go. |
| `/new-panel <Name> <position>` | **When adding a new panel.** Scaffolds panel ID + definition + Layout rendering + default visibility. |
| `/coverage-run` | **After any code changes that affect coverage.** Runs full test suite with coverage, caches results for incremental checks. |
| `/coverage-check <file>` | **When iterating on a single file's tests.** Runs only that file's tests, updates cached coverage — much faster than the full suite. |
| `/coverage-increase` | **When coverage is below 90%.** Iteratively writes tests for under-covered files using cached data. |
| `/coverage-gaps` | **When coverage is low or before releases.** Finds untested code and suggests concrete test stubs. |
| `/tech-debt` | **Periodically.** Audits `docs/code-improvements.md` — marks resolved items, finds new issues. |
| `/release-readiness` | **Before a release.** Analyzes screenshot comparison report and produces a readiness assessment. |
| `/release-compare-issue` | **After release readiness review.** Creates a GitHub issue from the readiness report. |

### Workflow

1. Make your code changes
2. Write or update unit tests for any changed logic
3. Run `/validate` to run all checks and fix any failures
4. Run `/feature-doc <slug>` to create or update the screenshot walkthrough
5. Run `/code-review` to catch anything you missed

### Verification Checklist

**When writing a plan, ALWAYS include this in the Verification section:**

1. Run `/validate` (covers lint, typecheck, check:all, unit tests, coverage, E2E)
2. Run `/feature-doc <slug>` to create/update the screenshot walkthrough
3. Run `/code-review` on changed files
