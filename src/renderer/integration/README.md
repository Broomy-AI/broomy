# Integration Tests

Cross-cutting integration tests that verify behavior spanning multiple stores and utilities. Unlike unit tests (co-located with their source files), these tests exercise realistic multi-store workflows: loading profiles, creating and managing sessions, and computing branch status through its full lifecycle.

## How It Connects

These tests import from `store/sessions`, `store/agents`, `store/repos`, `panels/types`, and `utils/branchStatus`. They use the shared test setup (`src/test/setup.ts`) which mocks all `window.*` IPC APIs, allowing the tests to run without Electron. The tests validate that stores interoperate correctly -- for example, that all three data stores load with the same profile ID, or that session lifecycle events produce the expected state transitions.

## Files

| File | Description |
|------|-------------|
| `git-branch-status.test.ts` | Tests the `computeBranchStatus` function through complete branch lifecycle scenarios: empty to in-progress to pushed to open to merged, squash merges, PR closures, resumed work, and local-only branches. |
| `profile-reload.test.ts` | Tests that all three data stores (sessions, agents, repos) load correctly with a given profile ID, handle profile switching, and degrade gracefully when config loading fails. |
| `session-lifecycle.test.ts` | Tests end-to-end session management: creation with correct defaults, active session switching, panel visibility isolation between sessions, deletion with active-session fallback, archiving, agent monitoring unread transitions, review session defaults, and hydration from config. |
