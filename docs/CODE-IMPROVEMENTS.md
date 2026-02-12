# Code Quality Improvement Proposals

Prioritized list of code quality improvements for the Broomy codebase. Each item includes the problem, current state, proposed solution, and expected benefit.

---

## High Priority

### 1. Extract E2E Mock Data from `src/main/index.ts`

**Problem**: The main process file (`src/main/index.ts`) is 2,462 lines long and serves as both the application entry point and the repository for all E2E test mock data. Mock data definitions (`DEFAULT_AGENTS`, `E2E_DEMO_SESSIONS`, `E2E_DEMO_REPOS`, `E2E_MOCK_BRANCHES`, and screenshot-mode variants) are interspersed with handler logic, making the file difficult to navigate. There are 69 occurrences of `isE2ETest` checks scattered throughout, and every handler begins with an early-return mock block before the real logic.

**Current state**: Lines 306--394 define mock constants. Each of the 75 `ipcMain.handle` registrations begins with a mock-data block. For example, the `git:status` handler (line 567) has a 30-line mock section before the 35-line real implementation.

```typescript
// Lines 367-380: E2E mock session definitions mixed into main process file
const E2E_DEMO_SESSIONS = isScreenshotMode ? [
  { id: '1', name: 'backend-api', directory: normalizePath(join(tmpdir(), 'broomy-e2e-backend-api')), agentId: 'claude' },
  // ... 8 entries for screenshot mode, 3 for normal E2E
] : [ ... ]
```

**Proposed solution**: Create `src/main/e2eMocks.ts` that exports all mock constants and a helper to generate mock responses by channel name. Then each handler calls a single function:

```typescript
// src/main/e2eMocks.ts
export const E2E_MOCKS = {
  'git:status': (repoPath: string) => ({
    files: [...],
    ahead: 0,
    behind: 0,
    tracking: null,
    current: E2E_MOCK_BRANCHES[repoPath] || 'main',
  }),
  // ...
}

// In index.ts - handler becomes cleaner
ipcMain.handle('git:status', async (_event, repoPath: string) => {
  if (isE2ETest) return E2E_MOCKS['git:status'](repoPath)
  // ... real implementation only
})
```

**Expected benefit**: Reduces `index.ts` by roughly 300--400 lines of mock data. Makes it easier to update mock data for tests without touching production handler code. Centralizes screenshot-mode logic in one place.

---

### 2. Deduplicate Git Status Parsing

**Problem**: The `git:status` handler in `src/main/index.ts` (lines 599--623) contains inline parsing logic that is nearly identical to the `parseGitStatusFile` function already exported from `src/main/gitStatusParser.ts` (lines 36--56). Both implement the same algorithm: check `indexStatus` and `workingDirStatus` characters, determine staged vs. unstaged, and call `statusFromChar`.

**Current state**: The handler already imports `statusFromChar` from `gitStatusParser.ts` (line 16) but does not use `parseGitStatusFile`. There is even a comment at line 611 acknowledging the import: `// statusFromChar imported from ./gitStatusParser`. The inline code and the extracted function have identical branching logic:

```typescript
// In index.ts (lines 605-623) - inline duplication
for (const file of status.files) {
  const indexStatus = file.index || ' '
  const workingDirStatus = file.working_dir || ' '
  const hasIndexChange = indexStatus !== ' ' && indexStatus !== '?'
  const hasWorkingDirChange = workingDirStatus !== ' ' && workingDirStatus !== '?'
  if (hasIndexChange) {
    files.push({ path: file.path, status: statusFromChar(indexStatus), staged: true, indexStatus, workingDirStatus })
  }
  // ... same logic as parseGitStatusFile
}

// In gitStatusParser.ts (lines 36-56) - already extracted
export function parseGitStatusFile(file: { path: string; index: string; working_dir: string }): GitFileEntry[] {
  // ... identical logic
}
```

**Proposed solution**: Replace the inline loop in the `git:status` handler with a call to `parseGitStatusFile`:

```typescript
const files = status.files.flatMap(file =>
  parseGitStatusFile({ path: file.path, index: file.index, working_dir: file.working_dir })
)
```

**Expected benefit**: Eliminates ~20 lines of duplicated logic. Future changes to git status parsing only need to happen in one place. The extracted function already has unit tests in `gitStatusParser.test.ts`.

---

### 3. Break Up `Explorer.tsx`

**Problem**: `src/renderer/components/Explorer.tsx` is 1,790 lines -- one of the largest component files in the codebase. It implements four distinct tab views (file tree, source control, code search, recent files) plus sub-features (staging, committing, push-to-main, PR status, branch changes, commit diffs, PR comments) all in a single file.

**Current state**: The component accepts 26 props (as shown in its `ExplorerProps` interface, lines 30--66). It manages extensive local state for tree expansion, search results, commit lists, PR comments, and multiple loading states. The file tree, source control panel, search UI, and recent files list are all rendered inline with no sub-components.

**Proposed solution**: Extract into focused sub-components:

| Component | Responsibility | Estimated lines |
|-----------|---------------|----------------|
| `Explorer.tsx` | Tab switcher, shared state, coordination | ~200 |
| `FileTree.tsx` | Directory tree with lazy loading and git badges | ~400 |
| `SourceControl.tsx` | Working changes, staging, commit form, sync | ~500 |
| `BranchChanges.tsx` | Branch diff file list, per-commit diffs | ~300 |
| `SearchPanel.tsx` | Regex code search with results | ~200 |
| `RecentFiles.tsx` | Recently opened files list | ~100 |

Place these in `src/renderer/components/explorer/` following the same pattern as `fileViewers/`.

**Expected benefit**: Each sub-component becomes independently testable. Developers can work on the search panel without risk of breaking source control. Reduces cognitive load when navigating the file.

---

### 4. Break Up `NewSessionDialog.tsx`

**Problem**: `src/renderer/components/NewSessionDialog.tsx` is 1,842 lines implementing a multi-step wizard dialog with 8 different views (home, clone, add-existing-repo, new-branch, existing-branch, repo-settings, issues, review-prs, agent-picker). All views are defined as inner functions within the same file.

**Current state**: The component uses a `View` discriminated union type (lines 16--25) to drive a state machine, which is a good pattern. However, every view's UI, state, and logic lives in the same file:

```typescript
type View =
  | { type: 'home' }
  | { type: 'clone' }
  | { type: 'add-existing-repo' }
  | { type: 'new-branch'; repo: ManagedRepo; issue?: GitHubIssue }
  | { type: 'existing-branch'; repo: ManagedRepo }
  | { type: 'repo-settings'; repo: ManagedRepo }
  | { type: 'issues'; repo: ManagedRepo }
  | { type: 'review-prs'; repo: ManagedRepo }
  | { type: 'agent-picker'; directory: string; repoId?: string; repoName?: string }
```

**Proposed solution**: Extract each view into its own component file within `src/renderer/components/newSession/`:

| Component | View type |
|-----------|-----------|
| `NewSessionDialog.tsx` | Outer container and view router (~80 lines) |
| `HomeView.tsx` | Repo list with clone/add/folder actions |
| `CloneView.tsx` | Git clone form |
| `NewBranchView.tsx` | Branch creation with optional issue pre-fill |
| `ExistingBranchView.tsx` | Branch picker with search |
| `RepoSettingsView.tsx` | Repo configuration |
| `IssuesView.tsx` | GitHub issues browser |
| `ReviewPrsView.tsx` | PR review picker |
| `AgentPickerView.tsx` | Agent selection |

The `View` type and `NewSessionDialogProps` interface would move to a shared `types.ts` in the same directory.

**Expected benefit**: Each wizard step is independently maintainable. Adding new wizard steps does not require understanding all 1,842 lines. Each view component becomes easier to test.

---

## Medium Priority

### 5. Extract `App.tsx` Effect Hooks into Custom Hooks

**Problem**: `AppContent` in `src/renderer/App.tsx` (685 lines) contains 10 `useEffect` blocks handling unrelated concerns: directory existence checking, git status polling, branch status computation, profile loading, window title updates, Monaco project context, session read marking, branch change polling, keyboard shortcuts, and Playwright store exposure. This makes the component hard to reason about.

**Current state**: The effects span lines 103--280 and 669--673. Each manages its own intervals, timeouts, and cleanup. Several have complex dependency arrays:

```typescript
// Effect 1: Check directories (line 103)
useEffect(() => { ... }, [sessions])

// Effect 2: Poll git status (line 164)
useEffect(() => { ... }, [activeSession?.id, fetchGitStatus])

// Effect 3: Compute branch status (line 173)
useEffect(() => { ... }, [gitStatusBySession, isMergedBySession, sessions, updateBranchStatus])

// Effect 4: Load profiles (line 209)
useEffect(() => { ... }, [])

// ... 6 more effects
```

**Proposed solution**: Extract into custom hooks in `src/renderer/hooks/`:

| Hook | Responsibility |
|------|---------------|
| `useDirectoryCheck(sessions)` | Checks whether session directories exist |
| `useGitStatusPolling(activeSession, repos)` | Polls git status, computes branch status, tracks merged state |
| `useProfileInit()` | Loads profiles, sessions, agents, repos on mount |
| `useWindowTitle(activeSession, currentProfile)` | Updates document.title |
| `useMonacoContext(activeSession)` | Loads TypeScript project context |
| `useSessionFocus(activeSessionId)` | Marks session read and focuses terminal |
| `useBranchPolling(sessions)` | Polls for branch name changes |
| `useKeyboardShortcuts(activeSession)` | Global keyboard shortcuts (Cmd+Shift+C) |

**Expected benefit**: `AppContent` shrinks to ~200 lines of pure composition. Each hook is independently testable. Concerns are clearly separated.

---

### 6. Add React Error Boundaries Around Panels

**Problem**: There are currently zero error boundaries in the application (searching for `ErrorBoundary` yields no results). If any panel component throws during rendering (e.g., due to corrupt data from a git operation, a Monaco editor crash, or an unexpected file format), the entire application crashes to a white screen.

**Current state**: No `ErrorBoundary` components exist anywhere in `src/`.

**Proposed solution**: Create a reusable `PanelErrorBoundary` component that catches rendering errors per-panel and shows a recovery UI:

```typescript
// src/renderer/components/PanelErrorBoundary.tsx
class PanelErrorBoundary extends React.Component<Props, State> {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return <div className="p-4 text-red-400">
        <p>This panel encountered an error.</p>
        <button onClick={() => this.setState({ hasError: false })}>Retry</button>
      </div>
    }
    return this.props.children
  }
}
```

Wrap each panel in `Layout.tsx` with `<PanelErrorBoundary>`. Note: this is the one case where a class component is acceptable, since React error boundaries require `getDerivedStateFromError` (a class lifecycle method).

**Expected benefit**: A crash in the Explorer does not take down the terminal. Users can retry or continue working in other panels. Error details can be logged to the error store.

---

### 7. Type the `config:save` Parameter Properly

**Problem**: The `config:save` IPC handler in `src/main/index.ts` (line 481) uses an inline type with `unknown[]` for `agents`, `sessions`, and `repos` arrays, even though `ConfigData` is already defined in `src/preload/index.ts` with proper types.

**Current state**:

```typescript
// In main/index.ts (line 481)
ipcMain.handle('config:save', async (_event, config: {
  profileId?: string;
  agents?: unknown[];      // Should be AgentData[]
  sessions: unknown[];     // Should be SessionData[]
  repos?: unknown[];       // Should be ManagedRepo[]
  defaultCloneDir?: string;
  showSidebar?: boolean;
  sidebarWidth?: number;
  toolbarPanels?: string[]
}) => { ... })

// In preload/index.ts (lines 252-261) - already properly typed
export type ConfigData = {
  agents: AgentData[]
  sessions: SessionData[]
  showSidebar?: boolean
  sidebarWidth?: number
  toolbarPanels?: string[]
  repos?: ManagedRepo[]
  defaultCloneDir?: string
  profileId?: string
}
```

**Proposed solution**: Import and use `ConfigData` from the preload types. Since main and preload are separate build targets, either:
- Share the type definition via a common `src/shared/types.ts` file, or
- Import the preload types at the type level only (`import type { ConfigData } from '../preload/index'`).

**Expected benefit**: The main process gets compile-time type safety for config data. Changes to the config shape propagate automatically instead of requiring manual synchronization of two type definitions.

---

### 8. Consistent `expandHomePath` Usage

**Problem**: There are two separate `expandHome` functions in `src/main/index.ts`: one defined at line 204 (inside the `config:load` handler scope) and a module-level `expandHomePath` at line 1240. The module-level function is called 30+ times across git and shell handlers, but the config handler uses its own local version.

**Current state**:

```typescript
// Line 204 - local to config:load handler
const expandHome = (value: string) => {
  // ...
}

// Line 1240 - module-level, used 30+ times
const expandHomePath = (path: string) => {
  // ...
}
```

**Proposed solution**: Remove the local `expandHome` function and use the module-level `expandHomePath` consistently. Alternatively, extract path expansion to `src/main/platform.ts` alongside the existing `normalizePath` utility.

**Expected benefit**: Single source of truth for home-directory expansion. Easier to find and test. Reduces chance of divergent behavior between the two implementations.

---

## Lower Priority

### 9. Replace Blind PTY Delay with Ready Event

**Problem**: When a session becomes active, the agent terminal is focused after a fixed `setTimeout` of 100ms (in `App.tsx`, line 241). This is a race condition -- the terminal may not be rendered yet if the system is under load, or the 100ms may be unnecessarily long on fast machines.

**Current state**:

```typescript
// App.tsx, lines 240-247
useEffect(() => {
  if (activeSessionId) {
    markSessionRead(activeSessionId)
    const timeout = setTimeout(() => {
      const container = document.querySelector(`[data-panel-id="${PANEL_IDS.AGENT_TERMINAL}"]`)
      if (!container) return
      const xtermTextarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
      if (xtermTextarea) xtermTextarea.focus()
    }, 100)
    return () => clearTimeout(timeout)
  }
}, [activeSessionId, markSessionRead])
```

**Proposed solution**: Use a callback ref or a MutationObserver that fires when the xterm textarea actually appears in the DOM, or have the `Terminal` component emit a "ready" callback prop that `App.tsx` listens for.

**Expected benefit**: Eliminates the timing race. Terminal focus works reliably regardless of render speed.

---

### 10. Centralize Error Response Helper

**Problem**: The pattern `{ success: false, error: String(error) }` is repeated 30+ times across IPC handlers in `src/main/index.ts`. Each catch block constructs this object manually.

**Current state**:

```typescript
// Repeated across the file:
} catch (error) {
  return { success: false, error: String(error) }
}
```

**Proposed solution**: Create a helper function:

```typescript
// In src/main/ipcHelpers.ts
export function errorResponse(error: unknown) {
  return { success: false as const, error: String(error) }
}

export function successResponse<T>(data?: T) {
  return { success: true as const, ...data }
}
```

**Expected benefit**: Reduces boilerplate. Ensures consistent error shape across all handlers. The `as const` narrowing makes it easier for TypeScript to discriminate success vs failure on the renderer side.

---

### 11. Clean Up Legacy Compatibility Layer in Sessions Store

**Problem**: The sessions store in `src/renderer/store/sessions.ts` (932 lines) maintains a backwards-compatibility layer that maps between the old `showAgentTerminal` / `showUserTerminal` / `showExplorer` / `showFileViewer` boolean fields and the newer `panelVisibility` record. This layer adds complexity through `syncLegacyFields` and `createPanelVisibilityFromLegacy` helper functions that are called throughout the store.

**Current state**: The `Session` interface carries both the new `panelVisibility: PanelVisibility` and the legacy `showAgentTerminal`, `showUserTerminal`, `showExplorer`, `showFileViewer`, and `showDiff` booleans (lines 52--58). Every time panel visibility changes, `syncLegacyFields` is called to keep both representations in sync (lines 206--215, called at lines 525, 543, 558, 619). The `debouncedSave` function persists both formats (lines 264--276).

```typescript
// Lines 206-215 - syncing legacy fields on every visibility change
function syncLegacyFields(session: Session): Session {
  return {
    ...session,
    showAgentTerminal: session.panelVisibility[PANEL_IDS.AGENT_TERMINAL] ?? true,
    showUserTerminal: session.panelVisibility[PANEL_IDS.USER_TERMINAL] ?? false,
    showExplorer: session.panelVisibility[PANEL_IDS.EXPLORER] ?? false,
    showFileViewer: session.panelVisibility[PANEL_IDS.FILE_VIEWER] ?? false,
  }
}
```

**Proposed solution**: After enough time has passed since the panel system migration (i.e., when all users have been updated past the migration point):

1. Run a one-time config migration that converts any remaining legacy fields to `panelVisibility` format
2. Remove the legacy boolean fields from the `Session` interface
3. Remove `syncLegacyFields` and `createPanelVisibilityFromLegacy`
4. Stop persisting legacy fields in `debouncedSave`

**Expected benefit**: Removes ~60 lines of compatibility code. Simplifies the `Session` interface. Eliminates a class of bugs where the two representations could fall out of sync. Reduces the mental overhead of maintaining two parallel systems for the same state.
