# E2E Tests

Playwright end-to-end tests that launch the full Electron app with mock data and verify UI behavior. The app runs in E2E mode (`E2E_TEST=true`) where all IPC handlers return predictable mock data, fake Claude scripts simulate agent output, and no real config files or git repos are touched.

## How It Connects

Tests depend on the build output (`pnpm build` via `global-setup.ts`), the fake Claude scripts in `scripts/`, and the E2E mock data paths in `src/main/index.ts`. The main process checks `isE2ETest` to return demo sessions, mock file trees, and mock git status. Each test launches its own Electron instance, optionally specifying a custom fake Claude script via `FAKE_CLAUDE_SCRIPT`.

The `E2E_HEADLESS` environment variable controls window visibility -- set to `'false'` for local debugging, defaults to `'true'` for CI. The `pnpm test` command runs tests headlessly; `pnpm test:headed` shows the window.

## Files

| File | Description |
|------|-------------|
| `global-setup.ts` | Runs once before all tests: ensures the Electron binary is downloaded and runs `pnpm build` so every spec can skip its own build step. |
| `app.spec.ts` | Core app E2E tests covering session display, sidebar navigation, panel toggling (Explorer, Terminal), session switching, terminal persistence across session changes, and shell integration with the fake Claude script. |
| `screenshots.spec.ts` | Generates marketing screenshots by launching the app in screenshot mode (`SCREENSHOT_MODE=true`), injecting varied session states (working, idle, unread, pushed, merged, PR open), and capturing cropped screenshots of the sidebar, status cards, review panel, and explorer. |
| `status-detection.spec.ts` | Validates the agent activity detection system: verifies that terminal output triggers "working" status, that silence after output transitions to "idle" status, and that the timing heuristics (1-second idle timeout) work correctly. |
| `terminal-bigplan-scroll.spec.ts` | Tests terminal scrolling with large plan output. Covers two scenarios: single-chunk (all-at-once dump via `fake-claude-bigplan.sh`) and streaming chunks (small rapid writes via `fake-claude-streaming.sh`). Validates scroll-to-bottom after output, wheel-up/down round-trips, session-switch scroll preservation, resize behavior, and rapid scroll-during-output resilience. |
| `terminal-dom-scroll.spec.ts` | Reproduces and regression-tests the original DOM scroll manipulation bug where setting `viewport.scrollTop = 0` was ignored because xterm's `onRender` auto-correct snapped it back to the bottom. Tests direct DOM `scrollTop` assignment and validates `scrollHeight` reflects all content. |
| `terminal-scrolling.spec.ts` | Tests the core scroll UX: auto-scroll to bottom after large output, "Go to End" button visibility when scrolled up, scroll position stability when no new output arrives, manual scroll-to-bottom re-engagement, and scroll position preservation across window resizes. |
