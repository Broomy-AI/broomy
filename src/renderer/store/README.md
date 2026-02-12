# Store

Zustand state management stores for the Broomy renderer process. Each store owns a distinct domain of application state -- sessions, agents, repositories, profiles, and errors -- and exposes actions that update state in-memory then persist changes to the main process via IPC.

## How It Connects

Stores are created with `zustand/create` and consumed by React components via hooks (e.g. `useSessionStore()`). On app startup, `App.tsx` calls each store's `load*` method with the current profile ID. Stores read from and write to the config file through `window.config.load` / `window.config.save` (IPC to main process). The session store also calls `window.git.*` to resolve branch names and validate directories.

## Persistence

All stores follow the same lifecycle: **load from config on mount, mutate in-memory, then persist back**.

- **Load**: Each store has a `load*` action that reads from `window.config.load(profileId)` and populates state.
- **Mutate**: Actions update Zustand state synchronously via `set()`, giving the UI instant feedback.
- **Debounce + Save**: The session store debounces config writes with a 500ms delay (`debouncedSave`) to avoid excessive disk I/O during rapid changes like drag-resizing. The agents, repos, and profiles stores save immediately after mutations since their changes are less frequent.
- **Runtime-only state**: Fields like `status`, `isUnread`, `lastMessage`, `workingStartTime`, `branchStatus`, `agentPtyId`, and `recentFiles` are never written to the config file. They exist only for the lifetime of the window.
- **Legacy compatibility**: The session store maintains both a generic `panelVisibility` map and legacy boolean fields (`showAgentTerminal`, etc.), syncing them via `syncLegacyFields` to support older config formats.

## Files

| File | Description |
|------|-------------|
| `sessions.ts` | Session state management: CRUD, panel visibility, layout sizes, agent monitoring, terminal tabs, branch status, PR tracking, and archive. The largest store. |
| `agents.ts` | Agent definitions store: CRUD for AI agent configurations (name, command), persisted per profile. |
| `repos.ts` | Managed repositories store: CRUD for tracked repos, default clone directory, and GitHub CLI availability check. |
| `profiles.ts` | Multi-window profiles store: profile list management, switching profiles (opens new Electron window), and reading the profile ID from the URL query parameter. |
| `errors.ts` | Error tracking store: accumulates app errors (capped at 50), tracks unread state, and provides dismiss/clear actions. Purely in-memory, not persisted. |
| `sessions.test.ts` | Unit tests for the session store. |
| `agents.test.ts` | Unit tests for the agent store. |
| `repos.test.ts` | Unit tests for the repo store. |
| `profiles.test.ts` | Unit tests for the profile store. |
| `errors.test.ts` | Unit tests for the error store. |
