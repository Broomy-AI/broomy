# Broomy

A desktop application for managing multiple AI coding agent sessions across different repositories. See all your agent sessions at a glance, monitor their status, and interact with them through embedded terminals.

Built with Electron, React, and xterm.js.

## Features

- **Multi-session management** -- Run multiple AI coding agents (Claude Code, Aider, etc.) side-by-side
- **Agent status detection** -- Automatically detects whether agents are working, idle, or need input by parsing terminal output
- **Embedded terminals** -- Interactive xterm.js terminals with PTY integration for both agent and user shells
- **File explorer** -- Browse files, view diffs, and edit code with Monaco Editor integration
- **Git integration** -- Branch tracking, staging, committing, pushing, PR creation, and worktree support
- **GitHub integration** -- View issues assigned to you, check PR status, and manage code review comments
- **Profiles** -- Separate workspaces with independent sessions, agents, and repos (each opens in its own window)
- **Customizable panels** -- Toggle and reorder panels (Explorer, File Viewer, Agent Terminal, User Terminal, Settings)
- **Keyboard shortcuts** -- `Cmd+1-6` to toggle panels, `Cmd+Shift+C` to copy terminal content

## Quick Start

### Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) (required -- npm/yarn will not work)

### Installation

```bash
git clone <repo-url>
cd broomy
pnpm install
pnpm dev
```

The app opens automatically in development mode with hot reload. Dev mode uses a separate config file (`~/.broomy/config.dev.json`) so your test sessions don't interfere with real work. A yellow "DEV" chip appears in the title bar to distinguish dev from production.

### Building for Distribution

```bash
pnpm dist          # Build and package for macOS
pnpm start         # Run the packaged app
```

## Usage

### Creating a Session

1. Click "+ New Session" in the sidebar
2. Select a git repository directory
3. Choose an agent (e.g., "Claude Code", "Aider") or no agent for a plain terminal
4. The session appears in the sidebar with the repo name and branch

### Managing Sessions

- Click a session in the sidebar to switch to it
- Status indicators show agent state:
  - **Working** (green) -- Agent is actively processing
  - **Idle** (gray) -- Agent is at its prompt, waiting for a command
  - **Error** (red) -- Something went wrong
- Sessions with new activity show an unread indicator (blue dot)

### Panels

Each session has independently togglable panels:

| Panel | Description |
|-------|-------------|
| **Sessions** (sidebar) | List of all sessions with status, branch, and last activity |
| **Explorer** | File tree and source control view with staging, committing, and search |
| **File Viewer** | Monaco-based file editor and diff viewer |
| **Agent Terminal** | The main terminal running the AI agent |
| **User Terminal** | Additional terminals for manual commands (supports multiple tabs) |
| **Settings** | Agent configuration and repo management |

### Keyboard Shortcuts

- `Cmd+1` through `Cmd+6` -- Toggle panels (based on toolbar order)
- `Cmd+Shift+C` -- Copy terminal content + session summary to clipboard

## Architecture

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for a detailed technical guide.

### Quick Overview

Broomy is a standard Electron app with three process layers:

```
Main Process (Node.js)          Preload (Context Bridge)       Renderer (React)
─────────────────────           ──────────────────────         ─────────────────
PTY management (node-pty)  ──►  window.pty                ──►  Terminal component
Git operations (simple-git)──►  window.git                ──►  Explorer, SessionList
Filesystem I/O             ──►  window.fs                 ──►  FileViewer, Explorer
Config persistence         ──►  window.config             ──►  Zustand stores
GitHub CLI (gh)            ──►  window.gh                 ──►  Explorer (PR/Issues)
Profile management         ──►  window.profiles           ──►  ProfileChip
```

State is managed by four Zustand stores in the renderer: `sessions`, `agents`, `repos`, and `profiles`. The panel system uses a registry pattern for extensibility.

## Testing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full testing guide.

```bash
pnpm test:unit              # Vitest unit tests
pnpm test:unit:coverage     # With 90% line coverage threshold
pnpm test                   # Playwright E2E tests (headless)
pnpm test:headed            # E2E tests with visible window
```

## Project Structure

```
broomy/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # App entry, IPC handlers, PTY/Git/FS operations
│   │   └── gitStatusParser.ts   # Git status code parsing
│   ├── preload/
│   │   └── index.ts             # Context bridge: types + IPC wiring
│   └── renderer/                # React application
│       ├── App.tsx              # Root component, initialization
│       ├── components/          # UI components
│       │   ├── Layout.tsx       # Main layout with drag-to-resize panels
│       │   ├── Terminal.tsx     # xterm.js terminal wrapper
│       │   ├── Explorer.tsx     # File tree, source control, search
│       │   ├── FileViewer.tsx   # Monaco file/diff viewer
│       │   ├── SessionList.tsx  # Sidebar session list
│       │   └── ...
│       ├── panels/              # Panel registry system
│       │   ├── types.ts         # Panel position/definition types
│       │   ├── registry.ts      # PanelRegistry class
│       │   ├── builtinPanels.tsx # Built-in panel definitions
│       │   └── PanelContext.tsx  # React context for panel state
│       ├── store/               # Zustand state management
│       │   ├── sessions.ts      # Session state, panel visibility, layout
│       │   ├── agents.ts        # Agent definitions (name, command, env)
│       │   ├── repos.ts         # Managed repositories
│       │   ├── profiles.ts      # Multi-window profiles
│       │   └── errors.ts        # Application error tracking
│       └── utils/               # Shared utilities
│           ├── claudeOutputParser.ts  # Agent status detection from terminal output
│           ├── explorerHelpers.ts     # Git status display helpers
│           ├── terminalBufferRegistry.ts # Cross-component terminal buffer access
│           ├── slugify.ts             # Issue-to-branch-name conversion
│           └── textDetection.ts       # Binary vs text file detection
├── scripts/
│   └── fake-claude.sh           # Mock agent for E2E tests
├── tests/                       # Playwright E2E tests
├── electron.vite.config.ts      # Electron-vite build configuration
├── vitest.config.ts             # Unit test configuration
├── playwright.config.ts         # E2E test configuration
└── package.json
```

## Configuration

Config files are stored at `~/.broomy/`:

```
~/.broomy/
├── profiles.json                # Profile definitions + last active profile
├── profiles/
│   ├── default/
│   │   ├── config.json          # Sessions, agents, repos (production)
│   │   ├── config.dev.json      # Same structure (development)
│   │   └── init-scripts/        # Per-repo init scripts (repo-id.sh)
│   └── <profile-id>/
│       └── ...
```

## Troubleshooting

**"Electron uninstall" error** -- Run `rm -rf node_modules && pnpm install` to clean reinstall.

**"posix_spawnp failed" terminal errors** -- Run `npx @electron/rebuild` to rebuild native modules for Electron.

**Blank screen on launch** -- Check the DevTools console for preload script errors. Ensure the preload script is built as CommonJS (`.js`, not `.mjs`).

**pnpm is required** -- This project enforces pnpm via a `preinstall` script. Using npm or yarn will fail.

## License

MIT
