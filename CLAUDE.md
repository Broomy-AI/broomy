# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run dev          # Development with hot reload
npm run build        # Build without packaging
npm test             # Run E2E tests (headless)
npm run test:headed  # Run E2E tests with visible window
npm run dist         # Build and package for macOS
```

If you encounter "posix_spawnp failed" terminal errors, run: `npx @electron/rebuild`

## Architecture

Agent Manager is an Electron + React desktop app for managing multiple AI coding agent sessions (like Claude Code) across different repositories.

### Process Structure

- **Main process** (`src/main/index.ts`): Electron app entry, window management, PTY spawning, IPC handlers for git/filesystem/hooks
- **Preload** (`src/preload/index.ts`): Context bridge exposing `window.pty`, `window.fs`, `window.git`, `window.config`, `window.hooks` APIs
- **Renderer** (`src/renderer/`): React UI with Zustand state management

### Key Renderer Organization

- `store/sessions.ts` - Session state (list, panel visibility, layout sizes, agent monitoring)
- `store/agents.ts` - Agent configuration definitions
- `components/Layout.tsx` - Main layout with drag-to-resize panels and keyboard shortcuts
- `components/Terminal.tsx` - xterm.js terminal with PTY integration
- `panels/` - Registry-based modular panel system

### Claude Code Hook Integration

Agent Manager monitors Claude Code state via a hook system:
- `scripts/claude-hook.sh` - Hook script triggered when `AGENT_MANAGER_SESSION_ID` env var is set
- Writes JSONL events to `~/.agent-manager/hooks-events/{sessionId}.jsonl`
- Events: `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`
- Fallback: terminal output parsing in `utils/claudeOutputParser.ts`

### Data Persistence

Config files at `~/.agent-manager/`:
- `config.json` (production) / `config.dev.json` (development)
- Contains agents, sessions with panel visibility and layout sizes

## Testing

Playwright E2E tests in `tests/`. The test system uses:
- Mock file system responses
- Mock git data
- `scripts/fake-claude.sh` for predictable Claude output
- `E2E_HEADLESS` env var controls visibility
