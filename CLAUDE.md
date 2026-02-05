# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

```bash
pnpm install         # Install dependencies (use pnpm, not npm)
```

## Build Commands

```bash
pnpm dev             # Development with hot reload
pnpm build           # Build without packaging
pnpm test            # Run E2E tests (headless)
pnpm test:headed     # Run E2E tests with visible window
pnpm dist            # Build and package for macOS
```

## Troubleshooting

**"Electron uninstall" error**: Run `rm -rf node_modules && pnpm install` to clean reinstall.

**"posix_spawnp failed" terminal errors**: Run `npx @electron/rebuild`

**Important**: This project uses pnpm. Do not use npm or yarn - it will cause dependency issues.

## Architecture

Broomer is an Electron + React desktop app for managing multiple AI coding agent sessions (like Claude Code) across different repositories.

### Process Structure

- **Main process** (`src/main/index.ts`): Electron app entry, window management, PTY spawning, IPC handlers for git/filesystem
- **Preload** (`src/preload/index.ts`): Context bridge exposing `window.pty`, `window.fs`, `window.git`, `window.config` APIs
- **Renderer** (`src/renderer/`): React UI with Zustand state management

### Key Renderer Organization

- `store/sessions.ts` - Session state (list, panel visibility, layout sizes, agent monitoring)
- `store/agents.ts` - Agent configuration definitions
- `components/Layout.tsx` - Main layout with drag-to-resize panels and keyboard shortcuts
- `components/Terminal.tsx` - xterm.js terminal with PTY integration
- `panels/` - Registry-based modular panel system

### Agent Activity Detection

Broomer detects agent status via terminal output parsing in `utils/claudeOutputParser.ts`. Any terminal output marks the agent as "working"; after 1 second of no output, it transitions to "idle". When transitioning from working to idle, the session is marked as unread to notify the user.

### Data Persistence

Config files at `~/.broomer/`:
- `config.json` (production) / `config.dev.json` (development)
- Contains agents, sessions with panel visibility and layout sizes

## Testing

Playwright E2E tests in `tests/`. The test system uses:
- Mock file system responses
- Mock git data
- `scripts/fake-claude.sh` for predictable Claude output
- `E2E_HEADLESS` env var controls visibility
