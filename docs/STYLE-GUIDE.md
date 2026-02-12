# Coding Style Guide

This document formalizes the coding conventions used throughout the Broomy codebase. Follow these patterns when contributing new code or refactoring existing code.

## TypeScript

### Strict Mode

The project uses TypeScript strict mode with additional strictness flags. See `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Avoid `any`

Use proper types instead of `any`. The main process has zero `any` usages. When IPC handler parameters cannot reference the preload types directly, use inline object types or `unknown[]` for collections that will be serialized:

```typescript
// Good - explicit inline type for IPC handler parameter
ipcMain.handle('config:save', async (_event, config: {
  profileId?: string;
  agents?: unknown[];
  sessions: unknown[];
  repos?: unknown[];
}) => { ... })

// Bad
ipcMain.handle('config:save', async (_event, config: any) => { ... })
```

### Shared Types Defined in Preload

All types shared between the main and renderer processes are defined and exported from `src/preload/index.ts`. The renderer imports them directly:

```typescript
// In preload/index.ts
export type GitFileStatus = {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
  indexStatus: string
  workingDirStatus: string
}

// In renderer code
import type { GitFileStatus, GitStatusResult } from '../../preload/index'
```

The preload file also includes a `declare global` block that augments the `Window` interface, so `window.git`, `window.pty`, etc. are fully typed without imports.

### Path Alias

The `@/` alias maps to `src/renderer/` (defined in `tsconfig.json` and the Vite config):

```json
{
  "paths": {
    "@/*": ["./src/renderer/*"]
  }
}
```

Use `@/` for imports within the renderer that would otherwise require deep relative paths. Prefer relative imports for files in the same directory or an immediate parent.

## React

### Functional Components Only

All components are functional components. Do not use class components:

```typescript
// Good
export default function ProfileChip({ onSwitchProfile }: ProfileChipProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  // ...
}

// Bad - never use class components
class ProfileChip extends React.Component { ... }
```

### Zustand for State Management

Global state is managed with Zustand stores (not Redux or React Context for state). There are five stores:

| Store | File | Purpose |
|-------|------|---------|
| `useSessionStore` | `store/sessions.ts` | Session state, panel visibility, layout sizes, agent monitoring |
| `useAgentStore` | `store/agents.ts` | Agent definitions (name, command, color) |
| `useRepoStore` | `store/repos.ts` | Managed repositories |
| `useProfileStore` | `store/profiles.ts` | Multi-window profiles |
| `useErrorStore` | `store/errors.ts` | Error tracking |

Store pattern:

```typescript
import { create } from 'zustand'

interface MyState {
  items: Item[]
  addItem: (item: Item) => void
}

export const useMyStore = create<MyState>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
}))
```

React Context is used only for the panel system (`PanelContext.tsx`), which provides registry-based panel resolution rather than global state.

### Tailwind CSS for Styling

All styling uses Tailwind CSS utility classes. Do not use CSS modules, styled-components, or inline style objects (except where dynamic values are required, such as computed colors or positions):

```typescript
// Good - Tailwind utilities
<button className="px-2 py-0.5 text-[11px] font-semibold rounded border cursor-pointer transition-opacity hover:opacity-80">

// Acceptable - dynamic values that can't be Tailwind classes
style={{
  backgroundColor: currentProfile.color + '20',
  color: currentProfile.color,
}}

// Bad - CSS modules or styled-components
import styles from './ProfileChip.module.css'
```

The project uses a custom color palette defined in `tailwind.config.js` with semantic names like `bg-bg-primary`, `text-text-secondary`, `border-border`.

## File Organization

### Co-located Tests

Test files live next to the source files they test, using the `.test.ts` or `.test.tsx` suffix:

```
src/renderer/utils/slugify.ts
src/renderer/utils/slugify.test.ts
src/renderer/store/sessions.ts
src/renderer/store/sessions.test.ts
src/main/gitStatusParser.ts
src/main/gitStatusParser.test.ts
```

Integration tests that span multiple modules live in `src/renderer/integration/`.

### No Barrel Exports (With Exceptions)

Avoid barrel exports (`index.ts` files that re-export). The two exceptions are:

1. **Panel system** (`src/renderer/panels/index.ts`) -- re-exports types, registry, built-in panels, and context hooks from a single entry point.
2. **File viewers** (`src/renderer/components/fileViewers/index.ts`) -- re-exports viewer components that share a common type interface.

For everything else, import directly from the source file:

```typescript
// Good - direct import
import { useSessionStore } from './store/sessions'

// Avoid - creating barrel exports for stores
import { useSessionStore } from './store'  // Don't create store/index.ts
```

### Component Subdirectories

Related component groups get their own subdirectory with shared types:

```
src/renderer/components/fileViewers/
  index.ts              # Barrel export (exception to the rule)
  types.ts              # Shared types for all viewers
  types.test.ts         # Tests for type utilities
  MonacoViewer.tsx       # Individual viewer components
  MonacoDiffViewer.tsx
  ImageViewer.tsx
  MarkdownViewer.tsx
```

## Naming Conventions

### General Rules

| Element | Convention | Example |
|---------|-----------|---------|
| Functions / variables | camelCase | `fetchGitStatus`, `activeSession` |
| React components | PascalCase | `ProfileChip`, `SessionList` |
| Types / interfaces | PascalCase | `GitFileStatus`, `PanelDefinition` |
| Constants (module-level) | UPPER_SNAKE_CASE | `PANEL_IDS`, `DEFAULT_AGENTS` |
| Enum-like const objects | UPPER_SNAKE_CASE | `PANEL_IDS`, `DEFAULT_TOOLBAR_PANELS` |

### File Names

| File type | Convention | Example |
|-----------|-----------|---------|
| React components | PascalCase | `ProfileChip.tsx`, `SessionList.tsx` |
| Utilities | camelCase | `slugify.ts`, `branchStatus.ts` |
| Stores | camelCase | `sessions.ts`, `agents.ts` |
| Type-only files | camelCase | `types.ts` |
| Test files | Match source + `.test` | `slugify.test.ts`, `Layout.test.tsx` |

### Interface Props

Component props interfaces use `ComponentNameProps`:

```typescript
interface ProfileChipProps {
  onSwitchProfile: (profileId: string) => void
}

interface ExplorerProps {
  directory?: string
  onFileSelect?: (filePath: string, openInDiffMode: boolean) => void
  // ...
}
```

## State Management Patterns

### Runtime vs Persisted State

Session state is split into persisted and runtime-only fields. Runtime fields are never saved to disk:

```typescript
export interface Session {
  // Persisted fields
  id: string
  name: string
  directory: string
  panelVisibility: PanelVisibility
  layoutSizes: LayoutSizes
  lastKnownPrState?: PrState

  // Runtime-only fields (never persisted)
  status: SessionStatus
  lastMessage: string | null
  isUnread: boolean
  workingStartTime: number | null
  branchStatus: BranchStatus
}
```

The `debouncedSave` function in `sessions.ts` explicitly maps which fields to persist, stripping runtime-only state.

### Debounced Saves

Config saves are debounced with a 500ms delay to avoid excessive writes during drag-to-resize operations:

```typescript
let saveTimeout: ReturnType<typeof setTimeout> | null = null
const debouncedSave = async (sessions: Session[], ...) => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    // ... save logic
  }, 500)
}
```

### Profile-Scoped Data

All config files are scoped to profiles at `~/.broomy/profiles/<profileId>/`:

```typescript
function getProfileConfigFile(profileId: string): string {
  return join(PROFILES_DIR, profileId, CONFIG_FILE_NAME)
}
```

## IPC Handler Patterns

### E2E Mock Data

Every IPC handler must check `isE2ETest` and return deterministic mock data first, before any real logic:

```typescript
ipcMain.handle('git:status', async (_event, repoPath: string) => {
  if (isE2ETest) {
    return {
      files: [
        { path: 'src/index.ts', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
      ],
      ahead: 0,
      behind: 0,
      tracking: null,
      current: 'main',
    }
  }

  // Real implementation follows...
})
```

### Error Response Shape

All IPC handlers that can fail use a consistent error response shape:

```typescript
try {
  // ... operation
  return { success: true }
} catch (error) {
  return { success: false, error: String(error) }
}
```

Always use `String(error)` rather than `error.message` to safely handle non-Error thrown values.

### Namespace Convention

IPC channels are namespaced with a colon separator:

| Namespace | Example Channels |
|-----------|-----------------|
| `pty:` | `pty:create`, `pty:write`, `pty:data:${id}` |
| `config:` | `config:load`, `config:save` |
| `git:` | `git:status`, `git:stage`, `git:commit` |
| `gh:` | `gh:issues`, `gh:pr-status` |
| `fs:` | `fs:readDir`, `fs:readFile`, `fs:change:${id}` |
| `profiles:` | `profiles:list`, `profiles:save` |

Event streams that target a specific instance append the instance ID: `pty:data:${id}`, `fs:change:${id}`.

## Testing

### Test Pure Functions and Store Actions

Test business logic (pure functions and Zustand store actions), not React component rendering:

```typescript
// Good - testing a pure function
describe('issueToBranchName', () => {
  it('converts issue to branch name', () => {
    expect(issueToBranchName({ number: 42, title: 'Fix login bug' })).toBe('42-fix-login-bug')
  })
})

// Good - testing a store action
it('adds a session', () => {
  useSessionStore.getState().addSession(...)
  expect(useSessionStore.getState().sessions).toHaveLength(1)
})
```

### Mock Window APIs

Use `vi.mocked()` to customize mock responses for window APIs (mocks are set up globally in `src/test/setup.ts`):

```typescript
vi.mocked(window.config.load).mockResolvedValue({
  agents: [],
  sessions: [{ id: '1', name: 'test', ... }],
})
```

### Coverage Target

The project enforces 90% line coverage on targeted source files. Run `pnpm test:unit:coverage` to verify.

### Fake Timers

Use `vi.useFakeTimers()` for time-dependent tests, and always clean up:

```typescript
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

it('debounces saves', async () => {
  // trigger save
  vi.advanceTimersByTime(500)
  // assert save happened
})
```

## Import Organization

Group imports in this order, separated by blank lines:

1. **External packages** (React, Zustand, Electron, etc.)
2. **Internal absolute** (`@/` path alias imports)
3. **Relative** (same module or nearby files)
4. **Type-only imports** (use `import type` when importing only types)

```typescript
// External
import { useState, useEffect, useCallback } from 'react'
import { create } from 'zustand'

// Internal absolute (when using @/ alias)
import { useSessionStore } from '@/store/sessions'

// Relative
import { statusLabel, getStatusColor } from '../utils/explorerHelpers'

// Type-only
import type { GitStatusResult } from '../../preload/index'
import type { ExplorerFilter, BranchStatus } from '../store/sessions'
```

Prefer specific imports over barrel imports. Import exactly what you need:

```typescript
// Good
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/types'

// Avoid importing everything through barrel
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels'
```

## Error Handling

### IPC Handlers

Wrap all IPC handler logic in try/catch. Use the standard error response shape:

```typescript
ipcMain.handle('git:stage', async (_event, repoPath: string, filePath: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.add([filePath])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})
```

### Renderer

In the renderer, silently catch errors for non-critical operations (git polling, directory checks) to avoid breaking the UI:

```typescript
try {
  const status = await window.git.status(activeSession.directory)
  // ...
} catch {
  // Ignore errors - git status polling is best-effort
}
```

For user-initiated actions, surface errors through the error store:

```typescript
const { addError } = useErrorStore()
// ...
addError('Failed to commit changes: ' + errorMessage)
```

## Git / GitHub Conventions

### Never Poll GitHub API

Never call `gh` CLI commands or GitHub APIs on a timer. Only invoke them on explicit user actions (button clicks, view navigation):

```typescript
// Good - triggered by user clicking refresh
const handleRefreshPr = async () => {
  const prStatus = await window.gh.prStatus(repoDir)
  updatePrState(sessionId, prStatus)
}

// Bad - never do this
setInterval(async () => {
  await window.gh.prStatus(repoDir)  // NO
}, 30000)
```

### Derive State Locally

Prefer deriving state from local git data (`git status`, ahead/behind counts, tracking branch) over GitHub API calls:

```typescript
// Good - derived from local git data
const status = computeBranchStatus({
  uncommittedFiles: gitStatus.files.length,
  ahead: gitStatus.ahead,
  hasTrackingBranch: !!gitStatus.tracking,
  isOnMainBranch: gitStatus.current === 'main',
  // ...
})
```

### Persist PR State

PR state is persisted in session config as `lastKnownPrState` and refreshed only when the user explicitly requests it:

```typescript
export interface Session {
  lastKnownPrState?: PrState
  lastKnownPrNumber?: number
  lastKnownPrUrl?: string
}
```

## JSDoc Comments

All files and major functions include JSDoc comments explaining their purpose. File-level comments describe what the module does, its dependencies, and key design decisions:

```typescript
/**
 * Profile indicator chip displayed in the title bar with a dropdown for profile management.
 *
 * Shows the current profile name as a colored chip. Clicking opens a dropdown listing
 * other profiles (click to switch, which opens a new window), an edit form for the
 * current profile's name and color, and a create-new-profile form.
 */
```

## Miscellaneous

- **Package manager**: Always use `pnpm`. The project enforces this via a `preinstall` script.
- **Semicolons**: No semicolons (the codebase omits them consistently).
- **Trailing commas**: Use trailing commas in multi-line structures.
- **String quotes**: Single quotes for strings.
- **Const assertions**: Use `as const` for constant objects that serve as enums (e.g., `PANEL_IDS`).
- **Event handlers**: Wrap event handlers in `useCallback` to maintain stable references for child components.
- **Default exports**: React components use `export default function ComponentName`. Stores and utilities use named exports.
