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
pnpm test:unit       # Run Vitest unit tests
pnpm test:unit:watch # Unit tests in watch mode
pnpm test:unit:coverage # Unit tests with 90% line coverage threshold
pnpm test            # Run Playwright E2E tests (headless)
pnpm test:headed     # E2E tests with visible window
pnpm dist            # Build and package for macOS
```

## Troubleshooting

**"Electron uninstall" error**: `rm -rf node_modules && pnpm install`

**"posix_spawnp failed" terminal errors**: `npx @electron/rebuild`

**Important**: This project enforces pnpm via a preinstall script. Do not use npm or yarn.

## Architecture

Broomy is an Electron + React desktop app for managing multiple AI coding agent sessions across different repositories. See `docs/ARCHITECTURE.md` for the full technical guide.

### Process Structure

- **Main process** (`src/main/index.ts`): All IPC handlers -- PTY management (node-pty), git operations (simple-git), filesystem I/O, GitHub CLI wrappers, config persistence, window lifecycle. Every handler checks `isE2ETest` and returns mock data during tests.
- **Preload** (`src/preload/index.ts`): Context bridge + type definitions. Exposes `window.pty`, `window.fs`, `window.git`, `window.gh`, `window.config`, `window.profiles`, `window.shell`, `window.repos`, `window.app`, `window.menu`, `window.dialog`.
- **Renderer** (`src/renderer/`): React UI with Zustand state management and Tailwind CSS.

### Key Renderer Organization

- **Stores** (`store/`): Four Zustand stores -- `sessions.ts` (session state, panel visibility, layout sizes, agent monitoring), `agents.ts` (agent definitions), `repos.ts` (managed repositories), `profiles.ts` (multi-window profiles), `errors.ts` (error tracking).
- **Components** (`components/`): `Layout.tsx` (main layout with drag-to-resize), `Terminal.tsx` (xterm.js wrapper), `Explorer.tsx` (file tree + source control), `FileViewer.tsx` (Monaco editor + diff), `SessionList.tsx`, `TabbedTerminal.tsx`, `NewSessionDialog.tsx`, `AgentSettings.tsx`, `ProfileChip.tsx`.
- **Panel system** (`panels/`): Registry-based modular panel system. Panel IDs defined in `types.ts`, registered in `builtinPanels.tsx`, accessed via React context in `PanelContext.tsx`. Six built-in panels: sidebar, explorer, fileViewer, agentTerminal, userTerminal, settings.
- **Utils** (`utils/`): `claudeOutputParser.ts` (agent status detection from terminal output), `explorerHelpers.ts` (git status display), `terminalBufferRegistry.ts` (cross-component terminal access), `slugify.ts` (issue-to-branch names), `textDetection.ts` (binary vs text).

### Agent Activity Detection

Agent status is detected by `ClaudeOutputParser` in `utils/claudeOutputParser.ts`. It strips ANSI escape codes, then checks for:
- **Working**: Spinner characters, keywords like "Vibing...", "Reading", tool execution patterns
- **Idle**: Claude's `❯` prompt (excluding menus and confirmation dialogs)
- **Messages**: Action lines (Read/Write/Edit results) are prioritized over generic output

When a session transitions from working to idle, it's marked as `isUnread` to alert the user.

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

**Always run tests before considering work done.**

### Unit Tests

Co-located with source files (`src/**/*.test.ts`). Vitest with 90% line coverage threshold on targeted files. The setup file (`src/test/setup.ts`) mocks all `window.*` APIs.

When writing tests:
- Test pure functions and store actions, not React component rendering
- Use `vi.mocked(window.xyz.method).mockResolvedValue(...)` to customize mock responses
- Use `vi.useFakeTimers()` for time-dependent tests (remember to call `vi.useRealTimers()` in cleanup)

### E2E Tests

Playwright tests in `tests/`. The test system:
- Sets `E2E_TEST=true` so all IPC handlers return mock data
- Uses `scripts/fake-claude.sh` for predictable agent output
- Creates demo sessions with known repos, branches, and agents
- Never writes to real config files or touches real git repos
- `E2E_HEADLESS` env var controls window visibility

### Workflow

1. Make your code changes
2. Write or update unit tests for any changed logic
3. Run `pnpm test:unit` to verify all unit tests pass
4. Run `pnpm test:unit:coverage` to confirm coverage stays above 90%
5. Run `pnpm test` to verify E2E tests still pass

## Adding New Features

### New IPC handler
1. Add handler in `src/main/index.ts` (with E2E mock data)
2. Add type + wiring in `src/preload/index.ts`
3. Update `Window` type declaration in preload
4. Add mock to `src/test/setup.ts`

### New panel
1. Add panel ID to `PANEL_IDS` in `src/renderer/panels/types.ts`
2. Add definition in `src/renderer/panels/builtinPanels.tsx`
3. Add rendering in `src/renderer/components/Layout.tsx`
4. Add default visibility in `src/renderer/store/sessions.ts`

### New store
1. Create `src/renderer/store/myStore.ts` with Zustand
2. Load in `App.tsx` on mount
3. Create `src/renderer/store/myStore.test.ts`
