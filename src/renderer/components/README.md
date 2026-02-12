# Components

React UI components that make up Broomy's visual interface. Each component is a self-contained module handling its own local state, with shared state accessed via Zustand store hooks. Components communicate upward through callback props and downward through data props, following standard React patterns.

## How It Connects

`App.tsx` composes these components into a panels map that `Layout.tsx` renders into the resizable shell. Terminal components connect to backend PTY processes through `window.pty`. Explorer and FileViewer use `window.fs` and `window.git` for file system and git operations. NewSessionDialog and AgentSettings interact with the agent and repo stores for configuration. The `fileViewers/` subdirectory provides pluggable renderers that FileViewer delegates to.

## Files

| File | Description |
|------|-------------|
| `Layout.tsx` | Main layout shell with toolbar, drag-to-resize dividers, keyboard shortcuts, and panel cycling |
| `Layout.test.tsx` | Unit tests for Layout panel visibility and resize behavior |
| `Terminal.tsx` | xterm.js wrapper with PTY connection, scroll-following, activity detection, and plan file parsing |
| `Explorer.tsx` | File tree browser with source control, code search, recent files, and PR management views |
| `FileViewer.tsx` | File viewer host that loads content, selects viewer plugins, and manages diff/edit/save modes |
| `SessionList.tsx` | Sidebar session cards with status indicators, branch chips, and archive/unarchive support |
| `SessionList.test.tsx` | Unit tests for SessionList rendering and interaction |
| `NewSessionDialog.tsx` | Multi-step wizard for creating sessions from repos, branches, issues, or PR reviews |
| `ReviewPanel.tsx` | AI code review panel with findings display, comment tracking, and iteration comparison |
| `AgentSettings.tsx` | Agent CRUD and per-repo settings (default agent, push-to-main, init scripts) |
| `TabbedTerminal.tsx` | Tab bar container for multiple user terminal instances per session |
| `PanelPicker.tsx` | Toolbar configuration overlay for adding, removing, and reordering panel buttons |
| `ProfileChip.tsx` | Title bar profile chip with dropdown for switching, editing, and creating profiles |
| `ProfileChip.test.tsx` | Unit tests for ProfileChip dropdown and profile management |
| `ErrorIndicator.tsx` | Toolbar error button with dropdown listing accumulated errors |
| `ErrorIndicator.test.tsx` | Unit tests for ErrorIndicator display and dismissal |
