# Feature Documentation Tests

Screenshot-driven E2E tests that exercise feature flows and generate visual HTML walkthroughs. Each subdirectory contains a Playwright spec that launches the app, steps through a feature, captures cropped screenshots at each stage, and produces an `index.html` report. The specs are committed; the generated screenshots and HTML are gitignored.

## How It Connects

Feature doc specs reuse the shared Electron fixture from `_shared/`, which launches a single Electron instance per worker with `E2E_TEST=true` and provides `resetApp()` for fast state resets. Screenshot helpers crop to relevant UI regions. The `generateFeaturePage()` and `generateIndex()` functions in `_shared/template.ts` produce the HTML output. These tests are run on demand with `pnpm test:feature-docs <slug>`, not as part of the regular `pnpm test:e2e` suite.

## Shared Infrastructure

| File | Description |
|------|-------------|
| `_shared/electron-fixture.ts` | Launches a shared Electron instance per Playwright worker with deterministic time and disabled animations. |
| `_shared/screenshot-helpers.ts` | Utilities for cropped screenshots: `screenshotElement()`, `screenshotRegion()`, `screenshotClip()`, Monaco/diff waiters, and scroll helpers. |
| `_shared/template.ts` | Generates per-feature `index.html` pages and the top-level table-of-contents index. |

## Features

| Directory | Description |
|-----------|-------------|
| `better-default-branch-names/` | Branch name generation from GitHub issues, stripping common words for cleaner names. |
| `check-for-updates/` | Update notification flow: sidebar banner, toolbar button, download progress, ready-to-install. |
| `diff-markdown-wrap/` | Monaco diff editor wrapping long lines, useful for markdown paragraphs. |
| `editor-diff-save-prompt/` | Save prompt when clicking Diff with unsaved edits, offering Save/Discard/Cancel. |
| `explorer-move-rename/` | Renaming files via context menu and moving files via drag-and-drop in the file tree. |
| `file-outline/` | Outline (symbol list) in the file viewer via Monaco's quick outline widget. |
| `issue-link/` | Creating a session from a GitHub issue and seeing the issue/PR link in source control. |
| `markdown-link/` | Clicking markdown links opens them in the external browser, not the Electron window. |
| `merge-focus/` | "Resolve Conflicts" sends the command and auto-focuses the Agent terminal tab. |
| `new-session-close/` | Dialog dismissal only via Cancel/Escape, not by clicking outside. |
| `per-session-file-editor/` | Independent file editor per session with unsaved changes preserved across switches. |
| `pr-description-comments/` | Viewing PR description and GitHub comments within the Review panel. |
| `pr-review-ui/` | PR review panel with markdown rendering, collapsible threads, filters, reactions, and replies. |
| `push-progress/` | "Working" spinner on session cards during long-running git operations. |
| `select-all/` | Cmd+A selects within the focused pane (Monaco) rather than the whole page. |
| `session-open-in-file-manager/` | Right-click a session to open its worktree folder in the OS file manager. |
| `session-switching/` | Switching between sessions in the sidebar. |
| `shell-selection/` | Shell selection in Settings and dropdown reset behavior. |
| `simple-merge-commit/` | Merge commit UI: "Resolve Conflicts" with conflict markers, "Commit Merge" when resolved. |
