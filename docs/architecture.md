# Architecture Guide

This document describes Broomy's technical architecture in detail. It's intended for developers who want to understand how the codebase works before making changes.

## Process Model

Broomy follows the standard Electron three-process model:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Main Process (Node.js)                          │
│                                                                     │
│  Window Management   PTY Pool (node-pty)   Git (simple-git)        │
│  Config Persistence  File System I/O       GitHub CLI (gh)         │
│  Profile Management  File Watchers         Shell Execution         │
│  Native Menus/Dialogs                                               │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                    IPC via contextBridge
                            │
┌───────────────────────────┴─────────────────────────────────────────┐
│                     Preload Script                                   │
│                                                                     │
│  Exposes typed APIs on the window object:                           │
│  window.pty  window.fs  window.git  window.gh  window.config       │
│  window.profiles  window.shell  window.repos  window.app           │
│  window.menu  window.dialog                                         │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                    contextBridge.exposeInMainWorld()
                            │
┌───────────────────────────┴─────────────────────────────────────────┐
│                     Renderer Process (React)                         │
│                                                                     │
│  Zustand Stores          React Components         Utility Modules   │
│  ├── sessions.ts         ├── Layout.tsx           ├── stripAnsi.ts  │
│  ├── agents.ts           ├── Terminal.tsx         ├── explorerHelpers│
│  ├── repos.ts            ├── TabbedTerminal.tsx   │   .ts           │
│  ├── profiles.ts         ├── SessionList.tsx      ├── slugify.ts    │
│  ├── errors.ts           ├── FileViewer.tsx       ├── textDetection │
│  └── tutorial.ts         ├── AgentSettings.tsx    │   .ts           │
│                          ├── explorer/            ├── branchStatus  │
│  Panel System            ├── newSession/          │   .ts           │
│  ├── types.ts            ├── review/              ├── terminalBuffer│
│  ├── builtinPanels.tsx   └── fileViewers/         │   Registry.ts   │
│  └── PanelContext.tsx                             └── terminalActiv │
│                          Custom Hooks                 ityDetector.ts│
│                          ├── useTerminalSetup.ts                    │
│                          ├── ptyDataHandler.ts                      │
│                          ├── useFileViewer.ts                       │
│                          └── useGitPolling.ts                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Main Process (`src/main/index.ts`)

The main process entry point (`src/main/index.ts`) manages window lifecycle and registers all IPC handlers via `registerAllHandlers()`. The handlers themselves are organized into modular files under `src/main/handlers/`:

| Handler file | Responsibility |
|-------------|----------------|
| `gitBasic.ts` | Core git operations (status, commit, diff) |
| `gitBranch.ts` | Branch management (create, switch, delete) |
| `gitSync.ts` | Remote sync (push, pull, fetch) |
| `fsCore.ts` | File reading, writing, watching |
| `fsSearch.ts` | Directory tree searching |
| `ghCore.ts` | GitHub CLI issue/PR operations |
| `ghComments.ts` | PR comment management |
| `config.ts` | Config file persistence |
| `pty.ts` | PTY lifecycle and data routing |
| `shell.ts` | Shell command execution |
| `app.ts` | App info and utilities |
| `typescript.ts` | TypeScript project analysis |
| `updater.ts` | Auto-update management |

The main process also uses **worker threads** (`src/main/workers/`) managed by a worker pool (`src/main/workerPool.ts`) for CPU-intensive operations:
- `fsSearch.worker.ts` -- File system searching off the main thread
- `tsProject.worker.ts` -- TypeScript project analysis off the main thread

The main process manages:

- **Window lifecycle** -- Creating BrowserWindows, tracking them by profile ID, cleanup on close
- **PTY pool** -- Spawning pseudo-terminals via `node-pty`, routing data to the correct window
- **Git operations** -- All git commands run here via `simple-git`, keeping the renderer process free of Node.js APIs
- **File system** -- Reading, writing, watching files, and searching directory trees
- **GitHub CLI** -- Wrapping `gh` commands for issue/PR management
- **Configuration** -- Reading and writing JSON config files at `~/.broomy/`
- **Profile management** -- Multi-window support where each profile gets its own window

Every IPC handler checks for E2E test mode (`E2E_TEST=true`) and returns mock data when testing, so tests never touch the real filesystem or git repos.

### Preload Script (`src/preload/index.ts`)

The preload script serves two purposes:

1. **Security boundary** -- With `contextIsolation: true` and `nodeIntegration: false`, the renderer has no direct access to Node.js APIs. The preload script exposes only the specific operations needed.

2. **Type definitions** -- All shared types (`SessionData`, `AgentData`, `ConfigData`, `GitStatusResult`, etc.) are defined in the preload file and imported by both main and renderer code.

The preload exposes these APIs on the `window` object:

| API | Purpose | Example |
|-----|---------|---------|
| `window.pty` | Terminal operations | `create()`, `write()`, `resize()`, `kill()`, `onData()` |
| `window.fs` | File system | `readDir()`, `readFile()`, `writeFile()`, `watch()`, `search()` |
| `window.git` | Git operations | `status()`, `commit()`, `push()`, `diff()`, `worktreeAdd()` |
| `window.gh` | GitHub CLI | `issues()`, `prStatus()`, `prComments()`, `prChecksStatus()` |
| `window.config` | Config persistence | `load(profileId)`, `save(config)` |
| `window.profiles` | Profile management | `list()`, `save()`, `openWindow()` |
| `window.shell` | Shell execution | `exec(command, cwd)`, `openExternal(url)` |
| `window.repos` | Init scripts | `getInitScript(repoId)`, `saveInitScript(repoId, script)` |
| `window.app` | App info | `isDev()`, `homedir()` |
| `window.menu` | Context menus | `popup(items)` |
| `window.dialog` | System dialogs | `openFolder()` |

### Renderer Process (`src/renderer/`)

The renderer is a React application with Zustand for state management and Tailwind CSS for styling.

---

## State Management

State is split across six Zustand stores plus a panel context. Each store owns a specific domain and persists its data through the config API.

### Session Store (`store/sessions.ts`)

The largest store. Manages the list of sessions and all per-session UI state.

**Key state:**
```typescript
interface SessionStore {
  sessions: Session[]           // All sessions
  activeSessionId: string | null
  showSidebar: boolean          // Global panel state
  sidebarWidth: number
  toolbarPanels: string[]       // Panel toolbar order
  globalPanelVisibility: PanelVisibility
}
```

**Session shape:**
```typescript
interface Session {
  // Identity (persisted)
  id: string
  name: string
  directory: string
  agentId: string | null
  repoId?: string

  // Git state (refreshed at runtime)
  branch: string

  // Panel visibility (persisted) -- generic key-value map
  panelVisibility: PanelVisibility  // e.g., { explorer: true, fileViewer: false }

  // Layout sizes (persisted)
  layoutSizes: LayoutSizes

  // Runtime-only state (not persisted)
  status: 'working' | 'idle' | 'error'
  lastMessage: string | null
  isUnread: boolean
  recentFiles: string[]
}
```

**Persistence:** The store debounces saves with a 500ms delay to avoid excessive writes during panel drag operations. Only persisted fields are written; runtime state like `status` and `isUnread` is transient.

**Legacy compatibility:** The store maintains both the new `panelVisibility` map and legacy boolean fields (`showExplorer`, `showFileViewer`, etc.) for backwards compatibility with older config files. The `syncLegacyFields()` helper keeps them in sync.

### Agent Store (`store/agents.ts`)

Manages agent definitions (command presets like "Claude Code", "Aider").

```typescript
interface AgentConfig {
  id: string
  name: string
  command: string
  color?: string
  env?: Record<string, string>  // Custom environment variables
}
```

Agents are profile-scoped -- each profile can have different agent configurations.

### Repo Store (`store/repos.ts`)

Manages "managed repositories" -- repos that Broomy knows about for features like worktree creation and GitHub integration.

```typescript
interface ManagedRepo {
  id: string
  name: string
  remoteUrl: string
  rootDir: string
  defaultBranch: string
  defaultAgentId?: string
  allowApproveAndMerge?: boolean
}
```

### Profile Store (`store/profiles.ts`)

Manages multi-window profiles. Each profile opens in its own Electron window with independent sessions, agents, and repos.

```typescript
interface ProfileData {
  id: string
  name: string
  color: string
}
```

Profile switching calls `window.profiles.openWindow(profileId)`, which either creates a new window or focuses an existing one.

### Error Store (`store/errors.ts`)

Simple error accumulator. Keeps the last 50 errors for display in the UI.

### Tutorial Store (`store/tutorial.ts`)

Tracks onboarding progress: which tutorial steps the user has completed. Persists completion state to config.

---

## Panel System

The panel system uses a registry pattern to make panels modular and potentially extensible.

### Panel Definitions

Each panel is defined by a `PanelDefinition`:

```typescript
interface PanelDefinition {
  id: string                          // Unique identifier (e.g., 'explorer')
  name: string                        // Display name (e.g., 'Explorer')
  icon: ReactNode                     // Toolbar icon
  position: PanelPosition             // Where it renders in the layout
  defaultVisible: boolean             // Shown by default?
  defaultInToolbar: boolean           // In toolbar by default?
  isGlobal?: boolean                  // Per-session or global?
  resizable?: boolean
  minSize?: number
  maxSize?: number
}
```

### Panel Positions

```
┌─────────┬──────────────────────────────────────────┐
│         │                                          │
│ sidebar │        center-left    center-top         │
│         │        (file viewer)  (file viewer)      │
│         │                                          │
│         │               center-main                │
│         │               (tabbed terminal:           │
│  left   │                agent tab + user tabs)    │
│(explorer│                                          │
│         │        overlay (settings -- replaces     │
│         │                  center content)          │
│         │                                   right  │
│         │                              (tutorial)  │
└─────────┴──────────────────────────────────────────┘
```

### Built-in Panels

| ID | Name | Position | Global? |
|----|------|----------|---------|
| `sidebar` | Sessions | sidebar | Yes |
| `explorer` | Explorer | left | No |
| `fileViewer` | File | center-top / center-left | No |
| `tutorial` | Guide | right | Yes |
| `settings` | Settings | overlay | Yes |

The terminal area (agent tab + user terminal tabs) is always visible in the center and is not part of the panel toggle system.

Global panels share state across sessions. Per-session panels have independent visibility per session.

### Panel Context

The `PanelProvider` wraps the app and provides:
- Access to the panel registry
- The current toolbar panel order
- Keyboard shortcut mapping (`Cmd+1` through `Cmd+5`)

Hooks: `usePanelRegistry()`, `usePanelContext()`, `usePanelVisibility()`, `usePanelToggle()`, `useToolbarPanels()`

---

## IPC Communication Patterns

### Request-Response (invoke/handle)

Most operations use Electron's invoke/handle pattern:

```typescript
// Renderer (via preload)
const branch = await window.git.getBranch('/path/to/repo')

// Preload (wiring)
getBranch: (path) => ipcRenderer.invoke('git:getBranch', path)

// Main (handler)
ipcMain.handle('git:getBranch', async (_event, repoPath: string) => {
  const git = simpleGit(repoPath)
  const status = await git.status()
  return status.current || 'unknown'
})
```

### Event Streaming (send/on)

PTY data and file change notifications use event streaming:

```typescript
// Main → Renderer
ptyProcess.onData((data) => {
  ownerWindow.webContents.send(`pty:data:${options.id}`, data)
})

// Renderer (via preload)
window.pty.onData(id, (data) => {
  terminal.write(data)  // Write to xterm.js
})
```

Events are namespaced by ID (`pty:data:${id}`, `fs:change:${id}`) so multiple terminals and watchers can coexist.

### Window Ownership

Each PTY and file watcher is tracked by the window that created it. This ensures:
- Data goes to the correct window (important with multiple profile windows open)
- Resources are cleaned up when a window closes

---

## Agent Activity Detection

Agent status is detected by time-based heuristics spread across three files. Rather than parsing terminal output for specific patterns, the detector uses timing to determine whether the agent is working or idle.

- `src/renderer/utils/terminalActivityDetector.ts` -- Pure `evaluateActivity()` function containing the detection logic
- `src/renderer/hooks/ptyDataHandler.ts` -- Handles the PTY data callback, invoking activity detection on each data event
- `src/renderer/hooks/useTerminalSetup.ts` -- Sets up the terminal instance and wires the data handler

### Detection Flow

```
Terminal output data arrives
        │
        ▼
┌─────────────────┐
│  Warmup check   │  Ignore first 5 seconds after terminal creation
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Input check    │  Was there user input or window interaction
│                 │  within the last 200ms? If so, pause detection.
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Set working    │  Immediately update status to 'working'
│                 │  (flushed to store without debounce)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Start idle     │  After 1 second of no output, set status
│  timeout        │  to 'idle' (300ms debounce for store update)
└─────────────────┘
```

### Status States

- **working** -- Terminal output is actively being received (set immediately)
- **idle** -- No terminal output for 1 second (debounced 300ms before store update)
- **error** -- Set externally when the PTY process exits with a non-zero code

### Unread Notifications

When a session transitions from `working` to `idle` after at least 3 seconds of working, it's marked as `isUnread: true`. This tells the user "the agent finished doing something -- you should check the results." Clicking the session clears the unread state. Brief working periods (< 3 seconds) are filtered out to avoid false alerts from notifications like usage threshold warnings.

---

## Data Persistence

### Config File Structure

```
~/.broomy/
├── profiles.json                    # Profile list
│   {
│     "profiles": [{ "id": "default", "name": "Default", "color": "#3b82f6" }],
│     "lastProfileId": "default"
│   }
│
└── profiles/
    └── default/
        ├── config.json              # Production config
        │   {
        │     "agents": [...],
        │     "sessions": [...],
        │     "repos": [...],
        │     "defaultCloneDir": "~/repos",
        │     "showSidebar": true,
        │     "sidebarWidth": 224,
        │     "toolbarPanels": [...]
        │   }
        │
        ├── config.dev.json          # Development config (same structure)
        │
        └── init-scripts/
            └── <repo-id>.sh         # Per-repo initialization scripts
```

Development mode (`pnpm dev`) uses `config.dev.json` so your test sessions stay separate from production.

### Migration

When upgrading from the pre-profiles flat config structure, a one-time migration copies the legacy config into the `default` profile directory. This runs at startup in `migrateToProfiles()`.

---

## Terminal Integration

### xterm.js + node-pty

Each terminal in the UI is backed by:
- An **xterm.js** instance in the renderer for display
- A **node-pty** process in the main process for shell execution

The flow:
1. Renderer calls `window.pty.create({ id, cwd, command })`
2. Main process spawns a PTY with the user's shell (or a mock shell in E2E tests)
3. If a `command` is provided (for agent terminals), it's written to the PTY after a 100ms delay
4. PTY output streams to the renderer via `pty:data:${id}` events
5. User keystrokes flow back via `window.pty.write(id, data)`

### Terminal Tabs

The terminal area combines agent and user terminals into a single tabbed interface. The first tab is always the "Agent" tab — it runs the configured AI agent command and cannot be closed, renamed, or reordered. Additional user terminal tabs can be added alongside it. Each tab gets its own PTY. Tab state (list, active tab) is persisted. The `TabbedTerminal` component manages the tab bar UI and routes to individual `Terminal` instances.

### Terminal Buffer Registry

The `terminalBufferRegistry` is a global singleton that allows non-Terminal components to access terminal content. This is used by `Cmd+Shift+C` to copy the agent terminal's buffer content. Terminals register/unregister their buffer getter on mount/unmount.

---

## File Viewing

### Viewer Selection

The `FileViewer` component picks a viewer based on file extension:

| Extension | Viewer | Features |
|-----------|--------|----------|
| `.md` | MarkdownViewer | Rendered markdown with GFM support |
| `.png`, `.jpg`, `.gif`, `.svg`, etc. | ImageViewer | Displays with zoom, dimensions, and file size |
| All other text files | MonacoViewer | Full Monaco Editor with syntax highlighting |
| (diff mode) | MonacoDiffViewer | Side-by-side diff against HEAD |

The `isTextContent()` utility checks for binary content by looking for null bytes and character printability ratios.

---

## E2E Testing Architecture

E2E tests run the full Electron app with mock data:

```
Playwright Test Runner
        │
        ▼
┌─────────────────────────┐
│  Electron App            │
│  E2E_TEST=true           │
│                          │
│  ┌────────────────────┐  │
│  │ Main Process       │  │
│  │ - Mock git data    │  │
│  │ - Mock FS data     │  │
│  │ - fake-claude.sh   │  │
│  │ - No config writes │  │
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │ Renderer           │  │
│  │ - Real React UI    │  │
│  │ - Real xterm.js    │  │
│  │ - Real stores      │  │
│  └────────────────────┘  │
└─────────────────────────┘
```

Key testing patterns:
- **`E2E_TEST`** -- When true, all IPC handlers return predictable mock data
- **`E2E_HEADLESS`** -- Controls window visibility (default: hidden for CI)
- **`fake-claude.sh`** -- A shell script that simulates Claude Code output with spinners and status transitions
- **Demo sessions** -- Three predefined sessions with different repos, branches, and agents
- **No side effects** -- Config files are never written, real git repos are never touched
