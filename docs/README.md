# Documentation

Technical documentation for the Broomy codebase. These docs are intended for developers working on Broomy, covering architecture, processes, and detailed subsystem guides.

## Architecture & Process

| Document | Description |
|----------|-------------|
| [architecture.md](./architecture.md) | Full technical architecture guide covering the Electron process model, state management (Zustand stores), panel system, IPC patterns, agent activity detection, data persistence, terminal integration, and E2E testing architecture. |
| [releasing.md](./releasing.md) | Step-by-step guide for building, code-signing, notarizing, and publishing macOS releases. Covers certificate setup, credential management, the `dist:signed` script, and troubleshooting. |

## Developer Guides

| Document | Description |
|----------|-------------|
| [ipc-guide.md](./ipc-guide.md) | How to add and modify IPC handlers across main, preload, and renderer. |
| [panel-system.md](./panel-system.md) | Panel registration, positioning, visibility, and how to add new panels. |
| [testing-guide.md](./testing-guide.md) | Unit and E2E test patterns, mock setup, coverage requirements, and best practices. |
| [state-management.md](./state-management.md) | Zustand store conventions, persistence, runtime-only state, and migration patterns. |
| [terminal-integration.md](./terminal-integration.md) | xterm.js and node-pty integration, scroll behavior, buffer registry, and terminal tabs. |
| [git-integration.md](./git-integration.md) | Git and GitHub CLI integration patterns, branch status computation, and PR state management. |
| [review-system.md](./review-system.md) | Modular markdown-driven review system: how reviews are generated, rendered, and customized. |
| [style-guide.md](./style-guide.md) | Code style conventions, Tailwind CSS patterns, and component organization. |
| [code-improvements.md](./code-improvements.md) | Tracked technical debt, refactoring opportunities, and improvement proposals. |

## Plans

| Directory | Description |
|-----------|-------------|
| [plans/website/](./plans/website/) | Website planning documents: site overview, visual design system, content copy, technical setup (Next.js), and screenshot generation plan. |
