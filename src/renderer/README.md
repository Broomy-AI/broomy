# Renderer

The renderer process contains the entire React-based UI for Broomy. It runs inside an Electron BrowserWindow and communicates with the main process through the preload-exposed `window.*` APIs for file I/O, git operations, PTY management, and configuration persistence. All visual state is managed by Zustand stores, and all styling uses Tailwind CSS with a dark theme.

## How It Connects

The renderer receives its API surface from the preload layer (`src/preload/`), which bridges `ipcRenderer` calls to main-process handlers. Stores persist session/agent/repo configuration via `window.config` calls back to the main process. Terminal components stream data bidirectionally through `window.pty`. The panel system in `panels/` defines a registry that Layout reads to build the toolbar and keyboard shortcuts.

## Directory Structure

| Directory | Description |
|-----------|-------------|
| `components/` | React UI components (layout, terminals, explorer, file viewer, dialogs, settings) |
| `components/fileViewers/` | Plugin-based file viewer implementations (Monaco, image, markdown) |
| `panels/` | Panel registry, context provider, and built-in panel definitions |
| `store/` | Zustand state stores (sessions, agents, repos, profiles, errors) |
| `types/` | Shared TypeScript type definitions (e.g. review types) |
| `utils/` | Pure utility functions (ANSI stripping, git helpers, slugify, text detection) |
| `integration/` | Integration-level modules that coordinate across subsystems |

## Files

| File | Description |
|------|-------------|
| `App.tsx` | Root component that initializes stores, polls git status, wires panels, and manages navigation |
| `main.tsx` | React entry point that mounts App into the DOM with StrictMode |
| `index.css` | Global styles: Tailwind imports, scrollbar theming, panel focus indicators, title bar drag region |
| `index.html` | HTML shell with the #root mount point for the React app |
| `vite-env.d.ts` | Vite client type declarations for import.meta and asset modules |
