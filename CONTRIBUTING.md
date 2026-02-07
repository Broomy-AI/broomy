# Contributing to Broomy

## Getting Started

### Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) (enforced -- npm and yarn will not work)
- macOS (for native PTY support; Linux support is possible but untested)

### Setup

```bash
git clone <repo-url>
cd broomy
pnpm install
pnpm dev
```

If you hit issues, see [Troubleshooting](#troubleshooting) below.

### Development vs Production

Development mode (`pnpm dev`) uses a separate config file (`~/.broomy/config.dev.json`) so you can experiment without affecting real sessions. A yellow "DEV" chip in the title bar distinguishes dev from production builds.

---

## Development Workflow

### 1. Make Changes

The app uses Vite for hot module replacement. Most renderer changes (React components, stores, utilities) will update live without restarting. Changes to the main process or preload script require restarting `pnpm dev`.

### 2. Run Unit Tests

```bash
pnpm test:unit              # Run all unit tests
pnpm test:unit:watch        # Watch mode (re-runs on file changes)
pnpm test:unit:coverage     # Run with coverage report
```

Unit tests are co-located with source files (`*.test.ts` next to `*.ts`). The project enforces a **90% line coverage threshold** on targeted source files.

### 3. Run E2E Tests

```bash
pnpm test                   # Headless (for CI)
pnpm test:headed            # With visible window (for debugging)
```

E2E tests use Playwright to launch the full Electron app with mock data. They verify complete user workflows without touching real git repos or config files.

### 4. Verify Before Committing

Before considering any change done:

```bash
pnpm test:unit              # All unit tests pass
pnpm test:unit:coverage     # Coverage stays above 90%
pnpm test                   # E2E tests pass
```

---

## Project Structure

```
src/
├── main/                 # Electron main process (Node.js)
│   ├── index.ts          # IPC handlers, PTY management, window lifecycle
│   └── gitStatusParser.ts
├── preload/
│   └── index.ts          # Context bridge, shared types
└── renderer/             # React application
    ├── App.tsx           # Root component
    ├── components/       # UI components
    ├── panels/           # Panel registry system
    ├── store/            # Zustand state management
    └── utils/            # Shared utilities
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

---

## How To...

### Add a New IPC Handler

IPC handlers connect the renderer (React) to system operations (filesystem, git, etc.) via the main process.

**1. Add the handler in the main process** (`src/main/index.ts`):

```typescript
ipcMain.handle('myNamespace:myOperation', async (_event, arg1: string) => {
  if (isE2ETest) {
    return { mockData: true }  // Always provide E2E mock data
  }

  try {
    // Real implementation
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})
```

**2. Add the type and wiring in the preload** (`src/preload/index.ts`):

```typescript
// Add to the appropriate API type
export type MyApi = {
  myOperation: (arg1: string) => Promise<{ success: boolean; data?: any; error?: string }>
}

// Wire it up
const myApi: MyApi = {
  myOperation: (arg1) => ipcRenderer.invoke('myNamespace:myOperation', arg1),
}

// Expose on window
contextBridge.exposeInMainWorld('myNamespace', myApi)

// Add to Window type declaration
declare global {
  interface Window {
    myNamespace: MyApi
  }
}
```

**3. Use it in the renderer:**

```typescript
const result = await window.myNamespace.myOperation('hello')
```

### Add a New Panel

**1. Define the panel** in `src/renderer/panels/builtinPanels.tsx`:

```typescript
{
  id: 'myPanel',
  name: 'My Panel',
  icon: <MyIcon />,
  position: 'left',           // Where it renders
  defaultVisible: false,       // Hidden by default
  defaultInToolbar: true,      // Shows in the toolbar
  resizable: true,
  minSize: 150,
}
```

**2. Add the panel ID** to `src/renderer/panels/types.ts`:

```typescript
export const PANEL_IDS = {
  // ...existing
  MY_PANEL: 'myPanel',
} as const
```

**3. Render the panel** in `src/renderer/components/Layout.tsx`. Add a conditional render for your panel based on its visibility state.

**4. Update the default panel visibility** in `src/renderer/store/sessions.ts` if needed.

### Add a New Zustand Store

Create a new file in `src/renderer/store/`:

```typescript
import { create } from 'zustand'

interface MyStore {
  data: string[]
  loadData: () => Promise<void>
  addItem: (item: string) => void
}

export const useMyStore = create<MyStore>((set, get) => ({
  data: [],

  loadData: async () => {
    // Load from config or API
    set({ data: ['item1'] })
  },

  addItem: (item: string) => {
    const { data } = get()
    set({ data: [...data, item] })
  },
}))
```

**Conventions:**
- Store files are named after their domain (`sessions.ts`, `agents.ts`)
- Use `get()` to access current state within actions
- Debounce persistence operations that may be called rapidly (see `debouncedSave` in `sessions.ts`)
- Separate persisted state from runtime-only state (don't save `status`, `isUnread`, etc.)

### Write Unit Tests

Unit tests live next to source files with a `.test.ts` suffix.

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('myFunction', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()
  })

  it('should handle the normal case', () => {
    expect(myFunction('input')).toBe('expected output')
  })

  it('should handle edge cases', () => {
    expect(myFunction('')).toBe('')
  })
})
```

**Testing stores:** The test setup file (`src/test/setup.ts`) mocks all `window.*` APIs. You can customize mock return values per test:

```typescript
beforeEach(() => {
  vi.mocked(window.config.load).mockResolvedValue({
    agents: [{ id: 'test', name: 'Test', command: 'test' }],
    sessions: [],
  })
})
```

**What to test:**
- Pure utility functions -- test all branches
- Store actions -- test state changes and persistence calls
- Parsers -- test with real-world input samples

**What not to unit test:**
- React component rendering (covered by E2E tests)
- IPC wiring (covered by E2E tests)

---

## Code Conventions

### TypeScript

- **Strict mode** is enabled. No `any` types without good reason.
- **Types** shared between processes are defined in `src/preload/index.ts`.
- **Path alias:** `@/` maps to `src/renderer/` (e.g., `import { useSessionStore } from '@/store/sessions'`).

### React

- **Functional components** only.
- **Zustand** for state management (no Redux, no Context for app state).
- **Tailwind CSS** for styling. Custom colors are defined in `tailwind.config.js`.

### State Management

- Runtime-only state (e.g., `status`, `isUnread`) is never persisted to config files.
- Layout sizes and panel visibility are debounced (500ms) before persisting.
- Each store is responsible for its own persistence logic.

### IPC Handlers

- Every handler checks `isE2ETest` and returns mock data when testing.
- Error results use `{ success: false, error: String(error) }`.
- Success results use `{ success: true }` or return data directly.

### File Organization

- **Co-located tests:** `foo.ts` has `foo.test.ts` in the same directory.
- **No barrel exports** in most directories. Import from the specific file.
- **Component files** are in `components/`. Subdirectories for related groups (e.g., `fileViewers/`).

---

## Troubleshooting

### "Electron uninstall" error during `pnpm install`

pnpm v10+ blocks postinstall scripts by default. The fix is already in `package.json` (`pnpm.onlyBuiltDependencies`), but if you still hit it:

```bash
rm -rf node_modules
pnpm install
```

### "posix_spawnp failed" terminal errors

Native modules need rebuilding for Electron's Node.js version:

```bash
npx @electron/rebuild
```

### Blank screen on launch

Check the DevTools console (opens automatically in dev mode). Common causes:
- Preload script failed to load (must be CommonJS format, `.js` not `.mjs`)
- Missing dependencies (run `pnpm install`)

### Tests time out

E2E tests wait for the app to fully render. If timeouts occur:
- Ensure `pnpm build` completes without errors before running `pnpm test`
- Check that no other Electron instances are running
- Try `pnpm test:headed` to see what's happening visually

### Hot reload not working for main process changes

Vite HMR only covers the renderer process. For main process or preload changes, restart `pnpm dev`.

---

## Pull Request Guidelines

1. **Keep PRs focused.** One logical change per PR.
2. **Write tests.** New utility functions and store actions need unit tests. UI changes should be covered by E2E tests.
3. **Maintain coverage.** `pnpm test:unit:coverage` must stay above 90%.
4. **Test E2E.** Run `pnpm test` before opening a PR.
5. **Update docs.** If you change architecture, IPC APIs, or panel behavior, update the relevant documentation.
