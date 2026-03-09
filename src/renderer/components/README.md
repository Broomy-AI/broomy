# Components

React UI components that make up Broomy's visual interface. Each component is a self-contained module handling its own local state, with shared state accessed via Zustand store hooks. Components communicate upward through callback props and downward through data props, following standard React patterns.

## How It Connects

`App.tsx` composes these components into a panels map that `Layout.tsx` renders into the resizable shell. Terminal components connect to backend PTY processes through `window.pty`. Explorer and FileViewer use `window.fs` and `window.git` for file system and git operations. NewSessionDialog and AgentSettings interact with the agent and repo stores for configuration. The `fileViewers/` subdirectory provides pluggable renderers that FileViewer delegates to.

## Files

| File | Description |
|------|-------------|
| `Layout.tsx` | Main layout shell with toolbar, drag-to-resize dividers, keyboard shortcuts, and panel cycling |
| `LayoutContentArea.tsx` | Content area rendering for the main layout (panel slots and resizable regions) |
| `LayoutToolbar.tsx` | Toolbar component with panel toggle buttons and profile/error indicators |
| `Terminal.tsx` | xterm.js wrapper with PTY connection, scroll-following, activity detection, and plan file parsing |
| `FileViewer.tsx` | File viewer host that loads content, selects viewer plugins, and manages diff/edit/save modes |
| `FileViewerToolbar.tsx` | Toolbar for the file viewer with breadcrumb, edit/save/diff controls |
| `SessionList.tsx` | Sidebar session cards with status indicators, branch chips, and archive/unarchive support |
| `NewSessionDialog.tsx` | Entry point for the new session wizard (delegates to `newSession/`) |
| `AgentSettings.tsx` | Agent CRUD and per-repo settings (default agent, approve-and-merge, init scripts) |
| `AgentSettingsAgentTab.tsx` | Agent configuration tab within AgentSettings |
| `AgentSettingsRepoTab.tsx` | Repository configuration tab within AgentSettings |
| `EnvVarEditor.tsx` | Editable key-value list for agent environment variables |
| `RepoSettingsEditor.tsx` | Per-repo settings editor (default agent, approve-and-merge, init scripts) |
| `TabbedTerminal.tsx` | Tab bar container for multiple user terminal instances per session |
| `TerminalTabBar.tsx` | Tab bar component for switching between user terminal tabs |
| `PanelPicker.tsx` | Toolbar configuration overlay for adding, removing, and reordering panel buttons |
| `ProfileChip.tsx` | Title bar profile chip with dropdown for switching, editing, and creating profiles |
| `ProfileDropdown.tsx` | Dropdown menu for profile switching, editing, and creation |
| `ErrorIndicator.tsx` | Toolbar error button with dropdown listing accumulated errors |
| `ErrorBanner.tsx` | Dismissible error banner displayed at the top of the content area |
| `ErrorBoundary.tsx` | React error boundary for catching and displaying component crashes |
| `ErrorDetailModal.tsx` | Modal dialog showing full error details and stack traces |
| `PanelErrorBoundary.tsx` | Error boundary scoped to individual panels with retry support |
| `HelpModal.tsx` | Help/about modal with version info and useful links |
| `ShortcutsModal.tsx` | Keyboard shortcuts reference modal |
| `TutorialPanel.tsx` | Onboarding tutorial panel for new users |
| `VersionIndicator.tsx` | Version display and update availability indicator |
| `WelcomeScreen.tsx` | Welcome screen shown when no sessions exist |

## Subdirectories

| Directory | Description |
|-----------|-------------|
| `explorer/` | File tree browser with source control, code search, recent files, and PR management views |
| `newSession/` | Multi-step new session wizard views (repo selection, branch, issues, clone, agent picker, PR review) |
| `review/` | AI code review panel with findings display, comment tracking, and iteration comparison |
| `fileViewers/` | Plugin-based file viewer implementations (Monaco, image, markdown) |
