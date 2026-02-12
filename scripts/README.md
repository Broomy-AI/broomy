# Scripts

Build, development, and testing scripts that support the Broomy development workflow. These handle environment setup, distribution signing, and fake agent simulation for E2E tests.

## How It Connects

Development scripts are invoked by `package.json` commands (`pnpm dev`, `pnpm dist:signed`). The postinstall hook runs automatically after `pnpm install`. Fake Claude scripts are used by E2E tests in `tests/` -- the main process spawns them as agent terminal commands when `E2E_TEST=true`. A specific fake script can be selected via the `FAKE_CLAUDE_SCRIPT` environment variable; otherwise the default `fake-claude.sh` is used.

## Development

| File | Description |
|------|-------------|
| `dev-preflight.cjs` | Runs before `pnpm dev`. Checks that `node_modules` exists, the Electron binary is downloaded, and native modules (node-pty) are built correctly. Auto-fixes issues when possible, then hands off to `electron-vite dev`. |
| `postinstall.cjs` | Post-install hook that fixes node-pty `spawn-helper` permissions on macOS/Linux. Runs automatically after `pnpm install`. |

## Distribution

| File | Description |
|------|-------------|
| `dist-signed.sh` | Builds, code-signs, and notarizes Broomy for macOS. Loads signing credentials from `.env`, verifies the signing identity in the keychain, runs `pnpm build`, then packages with `electron-builder` with notarization enabled. Verifies the output signature afterward. |

## Fake Agents (E2E Testing)

Shell scripts that simulate AI agent terminal output for E2E tests. Each script outputs a `FAKE_CLAUDE_READY` marker on start and a `FAKE_CLAUDE_IDLE` marker when it stops producing output, then sleeps indefinitely.

| File | Description |
|------|-------------|
| `fake-claude.sh` | Base fake agent. Outputs a spinner animation, simulated thinking/reading/generating phases (~4 seconds of activity), then goes idle. |
| `fake-claude.ps1` | Windows PowerShell version of the base fake agent with equivalent output. |
| `fake-claude-ansi.sh` | Fake agent with rich ANSI sequences: cursor movement (`\r`), line clearing (`\033[K`), bold/color codes, and box-drawing characters. Tests scroll behavior with formatted output. |
| `fake-claude-bigplan.sh` | Outputs a massive 190-step plan (5 phases) as a single `printf` call. Simulates real Claude dumping a large plan file in one PTY write, which stresses xterm.js scrolling. |
| `fake-claude-longlines.sh` | Outputs 50 lines of ~200 characters each. Tests terminal reflow behavior when lines wrap differently at different terminal widths. |
| `fake-claude-plan.sh` | Outputs an 80-step plan using line-by-line `echo` statements. Used by the basic terminal scrolling tests. |
| `fake-claude-screenshot.sh` | Outputs rich Claude Code terminal UI with ANSI colors -- welcome banner, user prompt, diff blocks, tool calls -- and keeps outputting indefinitely. Used to keep sessions in "working" state for screenshot generation. |
| `fake-claude-screenshot-idle.sh` | Outputs briefly (~3 seconds of Claude-style output) then goes idle. Creates the "unread" notification state for screenshot generation. |
| `fake-claude-streaming.sh` | Outputs a 190-step plan in small rapid chunks (2-5ms between writes) with ANSI formatting. Simulates real Claude's streaming API where data arrives in small token-sized pieces. |
