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

## Medium Priority

### 3. Type the `config:save` Parameter Properly

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

### 4. Consistent `expandHomePath` Usage

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

### 8. Command Injection in `ghCore.ts`

**Problem**: Shell command string interpolation allows potential command injection.

**Current state**: In `src/main/handlers/ghCore.ts` (line 45):

```typescript
await runShellCommand(`command -v ${command}`, { timeout: 5000 })
```

The `command` parameter is interpolated directly into a shell string. If a malicious agent name like `; rm -rf /` were provided, it would execute arbitrary shell commands.

**Proposed solution**: Use `execFileAsync` with array-style arguments instead of string interpolation:

```typescript
await execFileAsync('command', ['-v', command], { timeout: 5000 })
```

Or validate `command` against an allowlist of known CLI tool names before interpolation.

**Expected benefit**: Eliminates a command injection vector. Even though this is somewhat mitigated by context isolation, defense-in-depth matters.

---

### 9. Deduplicate Default Branch Detection

**Problem**: The "detect default branch" logic is copy-pasted 7+ times across 3 files, totalling ~60+ duplicated lines.

**Current state**: The following nested try/catch pattern appears in:
- `src/main/handlers/ghCore.ts` (lines 183-195, 225-237)
- `src/main/handlers/gitSync.ts` (lines 17-28, 53-64, 114-130, 172-188)
- `src/main/handlers/gitBranch.ts` (lines 87-113)

```typescript
try {
  const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
  defaultBranch = ref.trim().replace('refs/remotes/origin/', '')
} catch {
  try {
    await git.raw(['rev-parse', '--verify', 'origin/main'])
    defaultBranch = 'main'
  } catch {
    try {
      await git.raw(['rev-parse', '--verify', 'origin/master'])
      defaultBranch = 'master'
    } catch {
      defaultBranch = 'main'
    }
  }
}
```

**Proposed solution**: Extract to a shared utility:

```typescript
// src/main/handlers/gitUtils.ts
export async function getDefaultBranch(git: SimpleGit): Promise<string> {
  try {
    const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
    return ref.trim().replace('refs/remotes/origin/', '')
  } catch {
    for (const candidate of ['main', 'master']) {
      try {
        await git.raw(['rev-parse', '--verify', `origin/${candidate}`])
        return candidate
      } catch { /* try next */ }
    }
    return 'main'
  }
}
```

**Expected benefit**: Any bug fix or change to the detection logic only needs to happen once. Reduces ~60 lines of duplication to ~15 lines in one place.

---

### 10. Validate `profileId` to Prevent Path Traversal

**Problem**: The `profileId` parameter in `config:save` and `config:load` handlers is used to construct file paths without validation.

**Current state**: In `src/main/handlers/config.ts` (line 224):

```typescript
const configFile = config.profileId
  ? getProfileConfigFile(config.profileId, ctx.isDev)
  : legacyConfigFile
```

A crafted `profileId` like `../../../etc` could write config data to arbitrary filesystem locations.

**Proposed solution**: Validate that `profileId` matches a safe pattern (e.g., alphanumeric + hyphens only) and/or check it against the known set of profiles from `profiles.json`.

```typescript
function isValidProfileId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id)
}
```

**Expected benefit**: Prevents path traversal attacks via IPC. Defense-in-depth even with context isolation.

---

### 11. ~~Validate URL Schemes Before `openExternal`~~ ✅ Resolved

**Resolved**: `ReviewContent.tsx` was removed in the modular review rewrite. The review panel now uses custom link handling that routes GitHub URLs to the embedded webview and other `https://` URLs to `openExternal`. The `MarkdownViewer.tsx` file still uses `openExternal` without scheme validation — this remaining instance should be addressed separately.

---

### 12. Deduplicate `Divider` Component

**Problem**: An identical `Divider` component is defined in two separate files with the same logic.

**Current state**:
- `src/renderer/components/Layout.tsx` (lines 24-43)
- `src/renderer/components/LayoutContentArea.tsx` (lines 18-38)

Both define a `Divider` component with identical drag-to-resize behavior, hover styling, and cursor handling.

**Proposed solution**: Extract `Divider` into its own file `src/renderer/components/Divider.tsx` and import it in both locations.

**Expected benefit**: Single source of truth. Changes to divider behavior only need to happen once.

---

### 13. ~~Deduplicate Markdown Rendering Configuration~~ ✅ Resolved

**Resolved**: `ReviewContent.tsx` was removed in the modular review rewrite. The review panel now renders markdown sections directly in `index.tsx` using `react-markdown` with its own link handler (GitHub URLs → webview, others → system browser). The duplication no longer exists.

---

### 14. Deduplicate Store CRUD Patterns

**Problem**: The `agents.ts`, `repos.ts`, and `profiles.ts` stores all implement identical ID generation, add/update/remove patterns.

**Current state**: Each store has its own `generateId()` function (agents line 27, repos line 14, profiles line 28) and near-identical `addX`, `updateX`, `removeX` actions using the same spread-and-filter patterns.

**Proposed solution**: Create a generic store factory or utility for CRUD operations:

```typescript
function createCrudActions<T extends { id: string }>(
  get: () => { items: T[] },
  set: (partial: { items: T[] }) => void
) {
  return {
    add: (item: Omit<T, 'id'>) => { ... },
    update: (id: string, changes: Partial<T>) => { ... },
    remove: (id: string) => { ... },
  }
}
```

**Expected benefit**: Reduces boilerplate across 3 stores. Ensures consistent behavior for basic entity operations.

---

### 15. Fix `debouncedSave` Accepting Unused Parameters

**Problem**: The `debouncedSave()` function in `sessionPersistence.ts` accepts parameters but ignores all of them.

**Current state**: In `src/renderer/store/sessionPersistence.ts` (lines 45-52), `debouncedSave()` accepts `_sessions`, `_globalPanelVisibility`, `_sidebarWidth`, `_toolbarPanels` but just calls `scheduleSave()`. Callers in `sessionCoreActions.ts` and `sessionBranchActions.ts` still pass these values.

**Proposed solution**: Remove the parameters from `debouncedSave()` and update all call sites to not pass them.

**Expected benefit**: Eliminates confusion about whether the parameters are used. Makes the API honest.

---

### 16. Fix Potential Deduplication Bug in `slugify.ts`

**Problem**: The deduplication logic in `issueToBranchName()` may not work as intended due to an operator precedence issue.

**Current state**: In `src/renderer/utils/slugify.ts` (lines 59-66):

```typescript
if (deduped[deduped.length - 1] !== w || !backfillWords.has(w)) {
  deduped.push(w)
}
```

The condition uses `||` but the intent appears to be "don't add consecutive duplicates unless it's not a backfill word." With `||`, duplicates of non-backfill words are always added. This may need to be `&&`.

**Proposed solution**: Verify intended behavior with tests, then fix the operator if needed. Add test cases covering consecutive duplicate words in branch names.

**Expected benefit**: Correct branch name generation from issue titles.

---

### 17. Inconsistent Error Contracts Across IPC Handlers

**Problem**: Different IPC handlers return errors in incompatible formats, making it hard for the renderer to handle failures consistently.

**Current state**: Examples of inconsistency across `src/main/handlers/`:
- `handleReadDir()` returns `[]` on error
- `handleStatus()` returns a full object with empty arrays on error
- `handleDiff()` returns `''` (empty string) on error
- Other handlers return `{ success: false, error: string }`
- Some handlers return `null`

Many catch blocks silently swallow errors with no logging (e.g., `gitBasic.ts` lines 102, 235; `gitBranch.ts` lines 68-69, 174-175).

**Proposed solution**: Define a standard error envelope type and apply it consistently:

```typescript
type IpcResult<T> = { success: true; data: T } | { success: false; error: string }
```

Add `console.error` logging to all catch blocks that currently swallow errors silently.

**Expected benefit**: Renderer code can handle errors uniformly. Silent failures become diagnosable.

---

### 18. Reduce Review File Polling Frequency

**Problem**: The review file poller creates IPC traffic with 1-second interval polling.

**Current state**: In `src/renderer/components/review/useReviewFilePoller.ts`, a `setInterval` polls `.broomy/review.md` at 1-second intervals. The poller also resolves `<!-- include: path -->` directives, adding extra `fs:exists` and `fs:readFile` calls per include. The poller skips updates when content hasn't changed, but the IPC calls still happen.

**Proposed solution**: Either:
- Use a file watcher instead of polling (the infrastructure already exists in `fsCore.ts`)
- Increase the interval to 3-5 seconds when the review is not actively being generated
- Debounce/batch the IPC calls

**Expected benefit**: Reduced IPC overhead and CPU usage, especially with multiple sessions.

---

### 19. Add Missing Unit Tests for Key Files

**Problem**: Several files with significant logic have no unit tests.

**Current state**: Files without corresponding `.test.ts`:
- `src/main/index.ts` - Window lifecycle, PTY cleanup, multi-profile logic
- `src/main/shellEnv.ts` - Shell environment resolution (critical for PATH)
- `src/main/handlers/scenarios.ts` - 528 lines of mock data generation, no validation
- `src/renderer/utils/focusHelpers.ts` - DOM focus management with `requestAnimationFrame`
- `src/renderer/utils/commonWords.ts` - Word list used by slugify

**Proposed solution**: Add unit tests for at least the pure logic in these files. For `scenarios.ts`, add schema validation tests ensuring mock data matches real types. For `shellEnv.ts`, test PATH merging logic.

**Expected benefit**: Catches regressions in critical paths. The `scenarios.ts` mock data drifting from real types is a particularly insidious class of bug.

---

### 20. Add Accessibility Attributes to `TerminalTabBar`

**Problem**: The tab bar component lacks proper ARIA roles and attributes for screen reader support.

**Current state**: In `src/renderer/components/TerminalTabBar.tsx` (lines 94-143):
- Container lacks `role="tablist"`
- Tabs lack `role="tab"` and `aria-selected` attributes
- No keyboard navigation between tabs (Arrow keys)

**Proposed solution**: Add standard ARIA tab pattern attributes:

```tsx
<div role="tablist" aria-label="Terminal tabs">
  {tabs.map(tab => (
    <button
      role="tab"
      aria-selected={tab.id === activeTabId}
      // ...
    >
```

**Expected benefit**: Screen reader users can navigate terminal tabs. Aligns with WAI-ARIA tab pattern.

---

### 21. Break Up `SessionList.tsx`

**Problem**: `SessionList.tsx` is 516 lines with multiple inline sub-components and mixed concerns.

**Current state**: The file contains:
- `Spinner`, `StatusIndicator`, `BranchStatusChip` (lines 34-96) - pure display components
- `UpdateBanner` (lines 217-276) - update notification UI
- `DeleteSessionDialog` (lines 278-312) - confirmation dialog
- `SessionCard` (lines 98-215) - session card with complex conditional rendering
- Main `SessionList` component (lines 314-516) with 6 useState hooks

**Proposed solution**: Extract sub-components to separate files:
- `src/renderer/components/sessionList/SessionCard.tsx`
- `src/renderer/components/sessionList/DeleteSessionDialog.tsx`
- `src/renderer/components/sessionList/UpdateBanner.tsx`
- Small shared components to a `ui/` directory

**Expected benefit**: Each component is independently understandable and testable. Reduces cognitive load when working on any single piece.

---

### 22. Reduce `TerminalTabBar` Props Count

**Problem**: `TerminalTabBar` accepts 27 props, indicating the component is orchestrating too many concerns.

**Current state**: In `src/renderer/components/TerminalTabBar.tsx` (lines 33-60), the props interface includes tab data, active state, event handlers for clicking/closing/renaming/reordering/creating tabs, plus layout state.

**Proposed solution**: Group related props into objects or extract sub-components:
- Tab actions: `{ onClick, onClose, onRename, onReorder }`
- Tab creation: `{ onAdd, defaultAgent }`
- Layout: `{ isOverflowing, onDropdownToggle }`

Or decompose into `TabBar` (rendering) + `useTabBarActions` (behavior) to reduce the interface surface.

**Expected benefit**: Easier to understand what each prop group does. Simpler to test individual concerns.

---

### 23. Fix Map Mutation During Iteration in `index.ts`

**Problem**: Maps are modified while being iterated, which is a code smell even though ES2015 Map handles it.

**Current state**: In `src/main/index.ts` (lines 115-124):

```typescript
for (const [id, owner] of ptyOwnerWindows) {
  if (owner === window) {
    ptyOwnerWindows.delete(id)  // Modifying map during iteration
    ptyProcesses.delete(id)
  }
}
```

**Proposed solution**: Collect IDs to delete first, then delete in a separate loop:

```typescript
const idsToDelete = [...ptyOwnerWindows.entries()]
  .filter(([, owner]) => owner === window)
  .map(([id]) => id)
for (const id of idsToDelete) {
  ptyOwnerWindows.delete(id)
  ptyProcesses.delete(id)
}
```

**Expected benefit**: Eliminates a subtle footgun. Makes the code's intent clearer.

---

### 24. Extract Hardcoded Values to Constants

**Problem**: Magic numbers are scattered across the codebase without named constants or explanatory comments.

**Current state**: Examples:
- `src/main/handlers/pty.ts:137` - `setTimeout(..., 100)` (unexplained 100ms delay)
- `src/main/handlers/shell.ts:16` - `timeout: 300000` (5 min timeout)
- `src/main/handlers/fsCore.ts:66` - `5 * 1024 * 1024` (5MB file size limit)
- `src/renderer/components/explorer/FileTree.tsx:93` - `depth * 16 + 8` (tree indent pixels)
- `src/renderer/components/MonacoViewer.tsx:208` - `setTimeout(..., 100)` (another unexplained 100ms)

**Proposed solution**: Define named constants in appropriate locations:

```typescript
// src/main/constants.ts
export const PTY_STARTUP_DELAY_MS = 100
export const SHELL_EXEC_TIMEOUT_MS = 300_000
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

// src/renderer/constants.ts
export const TREE_INDENT_PX = 16
export const TREE_BASE_PADDING_PX = 8
```

**Expected benefit**: Self-documenting code. Easy to find and tune values. Grep-friendly.

---

### 25. Address Circular Module Dependency in Config Persistence

**Problem**: There's a known circular dependency chain between store modules.

**Current state**: In `src/renderer/store/configPersistence.ts` (lines 12-17), the code acknowledges: `sessions -> sessionPersistence -> configPersistence -> sessions`. This relies on runtime module initialization order.

**Proposed solution**: Break the cycle by using lazy imports or dependency injection:

```typescript
// Instead of importing sessions directly
let getSessionState: () => SessionState
export function initConfigPersistence(getter: () => SessionState) {
  getSessionState = getter
}
```

**Expected benefit**: Eliminates fragile dependency on import order. Makes the data flow explicit.

---

## Lower Priority

### 5. Replace Blind PTY Delay with Ready Event

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

### 6. Centralize Error Response Helper

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

### 7. Clean Up Legacy Compatibility Layer in Sessions Store

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

---

## Completed

### Break Up `Explorer.tsx`

**Status: COMPLETED**

**Original problem**: `Explorer.tsx` was 1,790 lines implementing four distinct tab views (file tree, source control, code search, recent files) plus sub-features in a single file.

**Implementation**: Extracted into `src/renderer/components/explorer/` with focused sub-components: `FileTree.tsx`, `SourceControl.tsx`, `SCWorkingView.tsx`, `SCBranchView.tsx`, `SCCommitsView.tsx`, `SCCommentsView.tsx`, `SearchPanel.tsx`, `RecentFiles.tsx`, `SCPrBanner.tsx`, `SCViewToggle.tsx`, shared hooks (`useSourceControlActions.ts`, `useSourceControlData.ts`), and `types.ts`. The barrel export at `index.tsx` provides the public API.

---

### Break Up `NewSessionDialog.tsx`

**Status: COMPLETED**

**Original problem**: `NewSessionDialog.tsx` was 1,842 lines implementing a multi-step wizard dialog with 8 different views, all defined as inner functions in the same file.

**Implementation**: Extracted into `src/renderer/components/newSession/` with per-view components: `HomeView.tsx`, `CloneView.tsx`, `NewBranchView.tsx`, `ExistingBranchView.tsx`, `RepoSettingsView.tsx`, `IssuesView.tsx`, `ReviewPrsView.tsx`, `AgentPickerView.tsx`, `AddExistingRepoView.tsx`. The `View` type and shared props live in `types.ts`, with a barrel export at `index.tsx`.

---

### Extract `App.tsx` Effect Hooks into Custom Hooks

**Status: COMPLETED**

**Original problem**: `AppContent` in `App.tsx` contained 10 `useEffect` blocks handling unrelated concerns, making the component hard to reason about.

**Implementation**: Hooks were extracted to `src/renderer/hooks/` including `useGitPolling.ts`, `useSessionLifecycle.ts`, `useLayoutKeyboard.ts`, `useTerminalSetup.ts`, `useFileViewer.ts`, `useFileWatcher.ts`, `useFileTree.ts`, `useAppCallbacks.ts`, `useErrorBanners.ts`, and others. Each hook is independently testable with co-located test files.

---

### Add React Error Boundaries Around Panels

**Status: COMPLETED**

**Original problem**: Zero error boundaries existed in the application. Any panel rendering error would crash the entire app to a white screen.

**Implementation**: `PanelErrorBoundary.tsx` exists at `src/renderer/components/PanelErrorBoundary.tsx` with a co-located test file. Panels are wrapped with error boundaries in `Layout.tsx` to isolate rendering crashes.
