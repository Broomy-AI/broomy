# Documentation

Technical documentation for the Broomy codebase. These docs are intended for developers working on Broomy, covering architecture, processes, and detailed subsystem guides.

## Architecture & Process

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Full technical architecture guide covering the Electron process model, state management (Zustand stores), panel system, IPC patterns, agent activity detection, data persistence, terminal integration, and E2E testing architecture. |
| [RELEASING.md](./RELEASING.md) | Step-by-step guide for building, code-signing, notarizing, and publishing macOS releases. Covers certificate setup, credential management, the `dist:signed` script, and troubleshooting. |

## Developer Guides

| Document | Description |
|----------|-------------|
| IPC-GUIDE.md | How to add and modify IPC handlers across main, preload, and renderer. |
| PANEL-SYSTEM.md | Panel registration, positioning, visibility, and how to add new panels. |
| TESTING-GUIDE.md | Unit and E2E test patterns, mock setup, coverage requirements, and best practices. |
| STATE-MANAGEMENT.md | Zustand store conventions, persistence, runtime-only state, and migration patterns. |
| TERMINAL-INTEGRATION.md | xterm.js and node-pty integration, scroll behavior, buffer registry, and terminal tabs. |
| GIT-INTEGRATION.md | Git and GitHub CLI integration patterns, branch status computation, and PR state management. |
| STYLE-GUIDE.md | Code style conventions, Tailwind CSS patterns, and component organization. |
| CODE-IMPROVEMENTS.md | Tracked technical debt, refactoring opportunities, and improvement proposals. |

## Plans

| Directory | Description |
|-----------|-------------|
| [plans/website/](./plans/website/) | Website planning documents: site overview, visual design system, content copy, technical setup (Next.js), and screenshot generation plan. |
