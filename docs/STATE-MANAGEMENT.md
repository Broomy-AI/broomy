# State Management Guide

Broomy uses Zustand for all client-side state management. Each domain has its own store,
and all stores follow the same pattern: load from config on mount, mutate in memory,
debounce-save back to disk.

## Zustand Store Pattern

Every store is created with `create<StoreInterface>((set, get) => ({ ... }))`. State and
actions live in the same object. Actions call `set()` to update state and `get()` to read
current state. There is no middleware, no Redux-style reducers, and no action creators --
just plain functions.

```ts
import { create } from 'zustand'

export const useMyStore = create<MyStore>((set, get) => ({
  items: [],
  isLoading: true,

  loadItems: async () => {
    const config = await window.config.load()
    set({ items: config.items || [], isLoading: false })
  },

  addItem: async (data) => {
    const item = { id: generateId(), ...data }
    const { items } = get()
    const updated = [...items, item]
    set({ items: updated })

    // Persist
    const config = await window.config.load()
    await window.config.save({ ...config, items: updated })
  },
}))
```

## The Five Stores

### 1. Sessions Store (`src/renderer/store/sessions.ts`)

The largest and most complex store. Manages:

- **Session list**: Each session represents an AI agent working in a git repository
- **Active session**: Which session the user is currently viewing
- **Panel visibility**: Per-session panel state (explorer, file viewer, terminals)
- **Global panel state**: Sidebar, settings panel visibility and width
- **Layout sizes**: Drag-to-resize dimensions for each panel
- **Agent monitoring**: Status (working/idle/error), last message, unread flag
- **Terminal tabs**: User terminal tab management
- **Branch status**: Derived status (in-progress, pushed, open, merged, closed)
- **PR state**: Last known PR state persisted for offline use
- **Archive state**: Sessions can be archived to hide from the main list

The session store uses a **debounced save** (500ms) to avoid excessive writes during
drag-to-resize operations.

### 2. Agents Store (`src/renderer/store/agents.ts`)

Manages agent configurations (name, command, environment variables). Each agent defines
a CLI command that gets spawned in a PTY for a session.

```ts
export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  isLoading: true,

  loadAgents: async (profileId?: string) => {
    const config = await window.config.load(profileId)
    set({ agents: config.agents || [], isLoading: false })
  },

  addAgent: async (agentData) => {
    const agent = { id: generateId(), ...agentData }
    const { agents, profileId } = get()
    const updatedAgents = [...agents, agent]
    set({ agents: updatedAgents })

    const config = await window.config.load(profileId)
    await window.config.save({ ...config, profileId, agents: updatedAgents })
  },
  // updateAgent, removeAgent follow the same pattern
}))
```

### 3. Repos Store (`src/renderer/store/repos.ts`)

Manages repositories the user has registered with Broomy. Tracks:

- List of managed repos (name, directory, default branch, options)
- Default clone directory (resolved from `~` via main process)
- GitHub CLI availability

The repo store resolves `~` paths to absolute paths using `window.app.homedir()`.

### 4. Profiles Store (`src/renderer/store/profiles.ts`)

Manages multi-window profiles. Each profile is an isolated workspace with its own
sessions, agents, and repos. The current profile ID comes from the URL query parameter
(`?profile=<id>`).

```ts
function getProfileIdFromUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('profile') || 'default'
}
```

Profile switching opens a new Electron window via `window.profiles.openWindow(profileId)`.

### 5. Errors Store (`src/renderer/store/errors.ts`)

A simple in-memory error queue. Errors are added by other stores and components when
IPC calls fail. The store keeps the last 50 errors and tracks an `hasUnread` flag for
the UI badge.

```ts
export const useErrorStore = create<ErrorStore>((set) => ({
  errors: [],
  hasUnread: false,

  addError: (message: string) => {
    const error = { id: generateId(), message, timestamp: Date.now() }
    console.error('[App Error]', message)
    set((state) => ({
      errors: [error, ...state.errors].slice(0, 50),
      hasUnread: true,
    }))
  },

  dismissError: (id) => set((state) => ({
    errors: state.errors.filter((e) => e.id !== id),
  })),

  clearAll: () => set({ errors: [], hasUnread: false }),
  markRead: () => set({ hasUnread: false }),
}))
```

The errors store does not persist to disk -- errors are runtime-only.

## Persistence Lifecycle

### Load

On app mount, `App.tsx` loads all stores in sequence:

```ts
useEffect(() => {
  loadProfiles().then(() => {
    loadSessions(currentProfileId)
    loadAgents(currentProfileId)
    loadRepos(currentProfileId)
    checkGhAvailability()
  })
}, [])
```

Profiles load first (to determine the current profile ID), then sessions, agents, and
repos load in parallel for that profile.

### Mutate

Store actions call `set()` to update in-memory state immediately. The UI re-renders
from the new state.

### Save

After mutation, stores persist to disk via `window.config.save()`. The sessions store
debounces saves with a 500ms delay to batch rapid changes (e.g., during drag-to-resize):

```ts
let saveTimeout: ReturnType<typeof setTimeout> | null = null
const debouncedSave = async (sessions, globalPanelVisibility, sidebarWidth, toolbarPanels) => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    const config = await window.config.load(currentProfileId)
    await window.config.save({
      profileId: currentProfileId,
      agents: config.agents,
      sessions: sessions.map((s) => ({
        id: s.id,
        name: s.name,
        directory: s.directory,
        // ... only persisted fields
      })),
      showSidebar: globalPanelVisibility[PANEL_IDS.SIDEBAR] ?? true,
      sidebarWidth,
      toolbarPanels,
    })
  }, 500)
}
```

The agents and repos stores save immediately (no debounce) because their mutations are
infrequent.

### Config File Location

All config files live under `~/.broomy/profiles/<profileId>/`:

- **Production**: `config.json`
- **Development**: `config.dev.json`

The config file stores agents, sessions (with panel visibility, layout sizes, terminal
tabs, PR state), repos, global UI state (sidebar width, toolbar panel order), and the
default clone directory.

## Runtime-Only vs Persisted State

The session store distinguishes between state that gets saved to disk and state that
exists only during the app's lifetime.

**Persisted fields** (saved to `config.json`):

- `id`, `name`, `directory`, `agentId`, `repoId`
- `panelVisibility`, `fileViewerPosition`, `layoutSizes`, `explorerFilter`
- `terminalTabs`, `pushedToMainAt`, `pushedToMainCommit`, `hasHadCommits`
- `lastKnownPrState`, `lastKnownPrNumber`, `lastKnownPrUrl`
- `isArchived`, `sessionType`, `prNumber`, `prTitle`, `prUrl`, `prBaseBranch`

**Runtime-only fields** (never saved, reset on app restart):

- `status` -- always starts as `'idle'`, set by terminal activity detection
- `lastMessage`, `lastMessageTime` -- the last line of agent output
- `isUnread` -- set when agent transitions from working to idle
- `workingStartTime` -- when the current working period began
- `agentPtyId` -- set by Terminal.tsx when the PTY is created
- `recentFiles` -- recently opened files in the file viewer
- `branch` -- fetched fresh from git on load, not read from config
- `branchStatus` -- derived from git status + PR state on every poll

## Legacy Compatibility Layer

The session store originally used individual boolean fields (`showAgentTerminal`,
`showUserTerminal`, `showExplorer`, `showFileViewer`) for panel visibility. These were
replaced by a generic `panelVisibility` map, but the legacy fields are maintained for
backwards compatibility with older config files.

Two helper functions handle the conversion:

```ts
// Sync legacy fields FROM panelVisibility (for runtime use)
function syncLegacyFields(session: Session): Session {
  return {
    ...session,
    showAgentTerminal: session.panelVisibility[PANEL_IDS.AGENT_TERMINAL] ?? true,
    showUserTerminal: session.panelVisibility[PANEL_IDS.USER_TERMINAL] ?? false,
    showExplorer: session.panelVisibility[PANEL_IDS.EXPLORER] ?? false,
    showFileViewer: session.panelVisibility[PANEL_IDS.FILE_VIEWER] ?? false,
  }
}

// Create panelVisibility FROM legacy fields (for loading old configs)
function createPanelVisibilityFromLegacy(data): PanelVisibility {
  if (data.panelVisibility) return data.panelVisibility
  return {
    [PANEL_IDS.AGENT_TERMINAL]: data.showAgentTerminal ?? true,
    [PANEL_IDS.USER_TERMINAL]: data.showUserTerminal ?? false,
    [PANEL_IDS.EXPLORER]: data.showExplorer ?? false,
    [PANEL_IDS.FILE_VIEWER]: data.showFileViewer ?? false,
  }
}
```

Both the old and new formats are saved to config for backwards compatibility.

## How Stores Interact

Stores are independent -- they do not import each other. Cross-store coordination
happens in `App.tsx`:

- **Profile -> Sessions/Agents/Repos**: After profiles load, the current profile ID is
  passed to `loadSessions()`, `loadAgents()`, and `loadRepos()`
- **Sessions + Agents**: `App.tsx` looks up agent commands from the agent store to pass
  to Terminal components
- **Sessions + Repos**: `App.tsx` matches `session.repoId` to repos for default branch
  detection and PR status
- **Errors**: Any store or component can call `useErrorStore.getState().addError()` to
  report failures

Git status polling also happens in `App.tsx`, which calls `window.git.status()` every
2 seconds for the active session and feeds results into `computeBranchStatus()` to update
`session.branchStatus`.

## Adding a New Store

1. **Create the store file** at `src/renderer/store/myStore.ts`:

```ts
import { create } from 'zustand'

interface MyStore {
  items: Item[]
  isLoading: boolean
  loadItems: (profileId?: string) => Promise<void>
  addItem: (data: Omit<Item, 'id'>) => Promise<void>
}

export const useMyStore = create<MyStore>((set, get) => ({
  items: [],
  isLoading: true,

  loadItems: async (profileId?: string) => {
    const config = await window.config.load(profileId)
    set({ items: config.myItems || [], isLoading: false })
  },

  addItem: async (data) => {
    const item = { id: generateId(), ...data }
    const updated = [...get().items, item]
    set({ items: updated })
    const config = await window.config.load()
    await window.config.save({ ...config, myItems: updated })
  },
}))
```

2. **Load in App.tsx** on mount:

```ts
const { loadItems } = useMyStore()

useEffect(() => {
  loadProfiles().then(() => {
    loadSessions(currentProfileId)
    loadAgents(currentProfileId)
    loadRepos(currentProfileId)
    loadItems(currentProfileId)   // Add here
  })
}, [])
```

3. **Create tests** at `src/renderer/store/myStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMyStore } from './myStore'

describe('useMyStore', () => {
  beforeEach(() => {
    useMyStore.setState({ items: [], isLoading: true })
    vi.mocked(window.config.load).mockResolvedValue({ myItems: [] })
    vi.clearAllMocks()
  })

  it('loads items', async () => {
    vi.mocked(window.config.load).mockResolvedValue({
      myItems: [{ id: '1', name: 'Test' }],
    })
    await useMyStore.getState().loadItems()
    expect(useMyStore.getState().items).toHaveLength(1)
  })
})
```

4. **Add to coverage** in `vitest.config.ts` if the file should be tracked.

5. **Add mock data** to `src/test/setup.ts` if your store introduces new `window.*` APIs.
