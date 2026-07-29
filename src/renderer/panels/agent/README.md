# Agent Panel

Terminal emulator panel for AI coding agents and user shell tabs.

## What it does

Renders all session terminals in a stack with CSS visibility toggling. The active session's terminal is visible; others are hidden but never unmounted. This ensures agent state is preserved when switching between sessions.

Each session gets a `TabbedTerminal` with an agent tab and optional user shell tabs. The agent tab runs the configured AI agent command; user tabs are interactive shells.

## Critical invariant

**Terminal React trees are NEVER unmounted on session switch.** Visibility is toggled via CSS (`invisible pointer-events-none`). Unmounting would kill the PTY process and lose terminal history.

The one deliberate exception is **pause**. A paused session renders
`PausedSession` instead of its terminal, and the resulting unmount is exactly
how its PTYs get killed — the agent terminal, user shell tabs, services, and
docker. This is a user action, never a session switch: switching sessions
still only toggles CSS visibility.

## Components

- `TabbedTerminal.tsx` -- Tab bar + terminal switching for agent/user tabs
- `Terminal.tsx` -- xterm.js wrapper with activity detection
- `TerminalTabBar.tsx` -- Tab bar UI for terminal tabs
- `WelcomeScreen.tsx` -- Shown when no sessions exist

## Hooks

- `useTerminalSetup` -- PTY lifecycle (create, resize, cleanup)
- `useTerminalKeyboard` -- Keyboard shortcut handling in terminal
- `ptyDataHandler` -- Processes PTY data events, updates activity state

## Utils

- `stripAnsi` -- ANSI escape sequence removal
- `terminalActivityDetector` -- Heuristic agent working/idle detection
- `terminalBufferRegistry` -- Cross-component terminal buffer access

## Store dependencies

- `store/sessions` -- Session list, active session, terminal tabs, agent monitoring
