# Preload

The preload script is the bridge between the renderer (browser) context and the main (Node.js) process. It defines every API type the renderer can use and wires each method to the corresponding IPC channel via Electron's context bridge.

## How It Connects

Electron's context isolation means the renderer cannot access Node.js or Electron internals directly. This file defines typed API objects (e.g. `PtyApi`, `GitApi`, `FsApi`, `GhApi`) and exposes them on `window.*` using `contextBridge.exposeInMainWorld()`. Each method maps one-to-one to an `ipcMain.handle()` call in `src/main/index.ts`. Event-streaming APIs (PTY data, file-watcher changes) use `ipcRenderer.on()` with per-ID channel names and return unsubscribe functions. The global `Window` interface is augmented at the bottom of the file so TypeScript knows about every API throughout the renderer codebase.

## Files

| File | Description |
|------|-------------|
| `index.ts` | Type definitions for all renderer-facing APIs (PTY, filesystem, git, GitHub CLI, config, profiles, shell, dialog, menu, agents, TypeScript context), IPC wiring via `contextBridge`, and the global `Window` type augmentation |
