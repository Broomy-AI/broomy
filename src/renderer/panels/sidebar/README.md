# Sidebar Panel

The sessions sidebar listing all active, archived, and initializing sessions.

## What it does

Displays a scrollable list of session cards in the left sidebar. Each card shows the session name, branch, agent status (working/idle), and unread indicator. Supports creating, selecting, deleting, and archiving sessions. Right-clicking a card opens a native context menu with "Open in Finder / Explorer / File Manager" (OS-dependent) that opens the session's worktree folder in the OS file manager. Also shows an update banner when a new app version is available.

## Components

- `SessionList.tsx` -- Main session list with archive toggle and search
- `SessionCard.tsx` -- Individual session card with status indicators and a right-click "Open in <file manager>" context menu
- `DeleteSessionDialog.tsx` -- Confirmation dialog for session deletion
- `UpdateBanner.tsx` -- App update notification banner

## Store dependencies

- `store/sessions` -- Session list, active session, session CRUD actions
- `shared/hooks/useUpdateState` -- App update state
