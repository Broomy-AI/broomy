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

Global state is managed with Zustand stores (not Redux or React Context for state). There are six stores:

| Store | File | Purpose |
|-------|------|---------|
| `useSessionStore` | `store/sessions.ts` | Session state, panel visibility, layout sizes, agent monitoring |
| `useAgentStore` | `store/agents.ts` | Agent definitions (name, command, color) |
| `useRepoStore` | `store/repos.ts` | Managed repositories |
| `useProfileStore` | `store/profiles.ts` | Multi-window profiles |
| `useErrorStore` | `store/errors.ts` | Error tracking |
| `useTutorialStore` | `store/tutorial.ts` | Tutorial/onboarding state |

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

### Colors: use the tokens, never a raw Tailwind color

Colors resolve through CSS custom properties declared in `src/renderer/index.css`, mirrored by `PALETTE` in `src/shared/theme.ts` (the renderer needs channel triplets; main and preload need real hex for the window background, xterm and Monaco). `scripts/check-colors.cjs` runs in `pnpm check:all` and fails the build on any raw Tailwind color, arbitrary hex, or arbitrary `text-[Npx]` in `src/renderer`.

A raw `text-red-400` is hardcoded for a dark background and cannot follow a theme. That is the whole reason the tokens exist.

| Group | Tokens |
|---|---|
| Surfaces | `bg-primary` `bg-secondary` `bg-tertiary` `surface-hover` |
| Lines | `border` `border-strong` |
| Text | `text-primary` `text-secondary` `text-tertiary` |
| Brand | `accent` `on-accent` (the label that sits *on* a saturated fill) |
| Status | `status-working` `status-waiting` `status-idle` `status-error` |
| Roles | `danger-*` `warning-*` `success-*` `info-*` `review-*` `attention-*` `note-*` |
| Neutral roles | `muted` `overlay` (modal scrim, dark in every theme) `elevate` (a wash *over* a surface) |

Each role is a small scale, because the app uses several steps of a hue for different jobs:

| Tier | Job |
|---|---|
| `subtle` / `soft` | quiet text |
| `fg` | the role's default text |
| `base` | tints and borders, used with an alpha modifier (`bg-danger-base/20`) |
| `solid` | button fill, pairs with `on-accent` |
| `strong` / `deeper` / `deep` | strong borders, and the dark grounds of banners |

```tsx
// Good
<span className="text-danger-fg">Failed</span>
<div className="bg-warning-base/20 border border-warning-base/30" />
<button className="bg-accent text-on-accent hover:bg-accent/80" />

// Bad — cannot follow a theme, and check:all will fail
<span className="text-red-400">Failed</span>
<div className="bg-[#1a1a1a]" />
```

Two rules the Tailwind config itself must keep:

1. Colors use the `rgb(var(--x) / <alpha-value>)` **function** form. A bare `var(--x)` holding a hex makes Tailwind emit **nothing** for every alpha-modifier utility (`bg-accent/80`, `border-border/50`).
2. The palette stays under `theme.extend.colors`. Under `theme.colors` it would drop Tailwind's gray scale, which is what Preflight's `borderColor.DEFAULT` resolves to — every bare `border` would repaint.

Font sizes multiply through `--app-text-scale`, so use `text-micro` / `text-3xs` / `text-2xs` rather than `text-[10px]`; an arbitrary px size cannot scale. Note those three tokens set font-size **only** — an arbitrary value sets no line-height, so giving them one would make those elements taller and shift every row beneath them.

**Never** express a theme with `@media (prefers-color-scheme: ...)`. The headless Chromium in `scripts/storybook-screenshot-test.mjs` reports `light` by default, so such a rule repaints every story and blows all 264 reference screenshots at once. Themes attach as `[data-theme='...']` on top of the `:root` default.

Agent and profile colors (`style={{ backgroundColor: agent.color }}`) are user data, not theme, and are deliberately exempt.

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

### Barrel Exports

Barrel exports (`index.ts` files that re-export) are used only when a subdirectory needs a clean public API. The current barrel exports are:

1. **Panel system** (`src/renderer/panels/index.ts`) -- re-exports types, registry, built-in panels, and context hooks from a single entry point.
2. **File viewers** (`src/renderer/components/fileViewers/index.ts`) -- re-exports viewer components that share a common type interface.
3. **Explorer** (`src/renderer/components/explorer/index.tsx`) -- re-exports the Explorer component from its subdirectory.
4. **New session** (`src/renderer/components/newSession/index.tsx`) -- re-exports the NewSessionDialog component from its subdirectory.
5. **Review** (`src/renderer/components/review/index.tsx`) -- re-exports the ReviewPanel component from its subdirectory.

For everything else, import directly from the source file:

```typescript
// Good - direct import
import { useSessionStore } from './store/sessions'

// Avoid - creating barrel exports for stores
import { useSessionStore } from './store'  // Don't create store/index.ts
```

### Component Subdirectories

Related component groups get their own subdirectory with shared types and a barrel export:

```
src/renderer/components/fileViewers/
  index.ts              # Barrel export
  types.ts              # Shared types for all viewers
  types.test.ts         # Tests for type utilities
  MonacoViewer.tsx       # Individual viewer components
  MonacoDiffViewer.tsx
  ImageViewer.tsx
  MarkdownViewer.tsx

src/renderer/components/explorer/
  index.tsx             # Barrel export
  types.ts              # Shared types
  FileTree.tsx           # Directory tree with lazy loading and git badges
  SourceControl.tsx      # Working changes, staging, commit form
  SCWorkingView.tsx      # Working changes sub-view
  SCBranchView.tsx       # Branch diff file list
  SCCommitsView.tsx      # Per-commit diffs
  SCCommentsView.tsx     # PR comments
  SearchPanel.tsx        # Regex code search with results
  RecentFiles.tsx        # Recently opened files list

src/renderer/components/newSession/
  index.tsx             # Barrel export
  types.ts              # Shared types and View union type
  HomeView.tsx           # Repo list with clone/add/folder actions
  CloneView.tsx          # Git clone form
  NewBranchView.tsx      # Branch creation with optional issue pre-fill
  ExistingBranchView.tsx # Branch picker with search
  AgentPickerView.tsx    # Agent selection

src/renderer/components/review/
  index.tsx             # Barrel export
  ReviewContent.tsx      # Review panel content
  ReviewHelpers.tsx      # Helper utilities
  CollapsibleSection.tsx # Collapsible UI section
  PrComments.tsx         # PR comment display
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
