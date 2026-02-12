# Test Infrastructure

Vitest setup files that mock the Electron preload APIs for unit testing. These files run before every unit test, replacing all `window.*` APIs with Vitest mocks so that store logic, utilities, and other renderer code can be tested without an Electron process.

## How It Connects

The setup files are referenced in `vitest.config.ts` as setup files. Every Zustand store and utility module in `src/renderer/` imports from `window.*` APIs defined in the preload script -- these mocks intercept those calls. When writing unit tests, you customize mock return values with `vi.mocked(window.xyz.method).mockResolvedValue(...)`.

Co-located unit test files (`src/**/*.test.ts`) automatically get these mocks. React component tests that need DOM APIs should use the `react-setup.ts` entry point, which layers DOM-specific tooling on top of the base mocks.

## Files

| File | Description |
|------|-------------|
| `setup.ts` | Core Vitest setup that mocks all `window.*` APIs (config, git, app, profiles, gh, shell, repos, agents, menu, fs, pty, dialog) with sensible defaults. Works in both DOM and Node environments. |
| `react-setup.ts` | Extends `setup.ts` with `@testing-library/jest-dom/vitest` matchers for React component tests that need DOM assertions. |
