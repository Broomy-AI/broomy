# Panel System Guide

Broomy uses a registry-based panel system that manages which UI panels are visible, where they appear in the layout, and how their state is persisted.

## Overview

The panel system has four layers:

1. **Types** (`panels/types.ts`) -- panel ID constants, position types, and the `PanelDefinition` interface.
2. **Registry** (`panels/registry.ts`) -- a singleton `PanelRegistry` that stores panel definitions and provides lookup methods.
3. **Built-in panels** (`panels/builtinPanels.tsx`) -- the seven default panel definitions registered at startup.
4. **Context and hooks** (`panels/PanelContext.tsx`) -- React context that provides registry access, toolbar ordering, and keyboard shortcut mapping.

The `Layout` component reads panel visibility state and renders each panel region conditionally. The session store manages per-session and global panel visibility, persisted to config files.

## Panel IDs

Every panel has a constant ID:

```ts
// src/renderer/panels/types.ts
export const PANEL_IDS = {
  SIDEBAR: 'sidebar',
  EXPLORER: 'explorer',
  FILE_VIEWER: 'fileViewer',
  REVIEW: 'review',
  AGENT_TERMINAL: 'agentTerminal',
  USER_TERMINAL: 'userTerminal',
  SETTINGS: 'settings',
} as const
```

Always reference panels by these constants rather than raw strings.

## Panel Positions

Each panel occupies a specific region in the layout:

```ts
export type PanelPosition =
  | 'sidebar'        // Left edge (session list)
  | 'left'           // Left of center (explorer)
  | 'center-top'     // Above terminals (file viewer in top mode)
  | 'center-left'    // Left of terminals (file viewer in left mode, review)
  | 'center-main'    // Main terminal area (agent terminal)
  | 'center-bottom'  // Below main terminal (user terminal)
  | 'overlay'        // Replaces center content (settings)
```

```
+----------+-----------+--------------------+
| sidebar  | left      | center-top         |
|          | (explorer)|--------------------+
|          |           | center-left |center |
|          |           | (fileViewer | main  |
|          |           |  or review) |       |
|          |           |-------------|-------+
|          |           | center-bottom       |
+----------+-----------+--------------------+
```

A panel can support multiple positions (e.g., the file viewer supports both `center-top` and `center-left`).

## Panel Definition

```ts
export interface PanelDefinition {
  id: string                                 // Unique ID (use PANEL_IDS constant)
  name: string                               // Display name in toolbar
  icon: ReactNode                            // SVG icon component
  position: PanelPosition | PanelPosition[]  // Where it renders
  defaultVisible: boolean                    // Visible when first created
  defaultInToolbar: boolean                  // Shows in toolbar by default
  resizable?: boolean                        // Has drag-to-resize divider
  minSize?: number                           // Minimum width/height in px
  maxSize?: number                           // Maximum width/height in px
  isGlobal?: boolean                         // Not per-session (sidebar, settings)
}
```

The `isGlobal` flag is the key distinction: global panels share visibility across all sessions, while per-session panels can differ between sessions.

## Built-in Panels

| ID | Name | Position | Default Visible | Global | Resizable |
|---|---|---|---|---|---|
| `sidebar` | Sessions | `sidebar` | yes | yes | no |
| `explorer` | Explorer | `left` | no | no | yes (150-500px) |
| `fileViewer` | File | `center-top`, `center-left` | no | no | yes |
| `review` | Review | `center-left` | no | no | yes (250-600px) |
| `agentTerminal` | Agent | `center-main` | yes | no | no |
| `userTerminal` | Terminal | `center-bottom` | no | no | yes (100-500px) |
| `settings` | Settings | `overlay` | no | yes | no |

## The Panel Registry

A singleton that stores all panel definitions:

```ts
// src/renderer/panels/registry.ts
export class PanelRegistry {
  register(panel: PanelDefinition): void
  get(id: string): PanelDefinition | undefined
  getAll(): PanelDefinition[]
  getByPosition(position: PanelPosition): PanelDefinition[]
  getDefaultVisible(): string[]
}
export const panelRegistry = new PanelRegistry()
```

Built-in panels are registered when `PanelContext.tsx` is first imported:

```ts
panelRegistry.registerAll(BUILTIN_PANELS)
```

## React Context and Hooks

The `PanelProvider` wraps the app and provides panel context to all components:

```tsx
<PanelProvider toolbarPanels={toolbarPanels} onToolbarPanelsChange={setToolbarPanels}>
  <Layout ... />
</PanelProvider>
```

| Hook | Purpose |
|---|---|
| `usePanelRegistry()` | Access the singleton registry |
| `usePanelContext()` | Full context: registry, toolbar state, shortcut keys |
| `usePanelVisibility(id, sessionVis, globalVis)` | Check if a panel is visible (respects global vs session) |
| `usePanelToggle(id, onToggle, onGlobalToggle)` | Toggle function that dispatches to correct handler |
| `useToolbarPanels()` | Ordered toolbar panels with keyboard shortcut info |

The first 6 toolbar panels get keyboard shortcuts (Cmd+1 through Cmd+6).

## Panel Visibility State

### Global panels (sidebar, settings)

```ts
// src/renderer/store/sessions.ts
const DEFAULT_GLOBAL_PANEL_VISIBILITY: PanelVisibility = {
  [PANEL_IDS.SIDEBAR]: true,
  [PANEL_IDS.SETTINGS]: false,
}
```

Toggling updates `globalPanelVisibility` in the store and persists to config.

### Per-session panels

Each session has its own `panelVisibility` map:

```ts
const DEFAULT_PANEL_VISIBILITY: PanelVisibility = {
  [PANEL_IDS.AGENT_TERMINAL]: true,
  [PANEL_IDS.USER_TERMINAL]: true,
  [PANEL_IDS.EXPLORER]: true,
  [PANEL_IDS.FILE_VIEWER]: false,
}
```

Toggling updates only that session's visibility:

```ts
togglePanel: (sessionId, panelId) => {
  const updatedSessions = sessions.map((s) => {
    if (s.id !== sessionId) return s
    const newVisibility = { ...s.panelVisibility, [panelId]: !s.panelVisibility[panelId] }
    return syncLegacyFields({ ...s, panelVisibility: newVisibility })
  })
  set({ sessions: updatedSessions })
  debouncedSave(updatedSessions, globalPanelVisibility, sidebarWidth, toolbarPanels)
}
```

### Layout sizes

Resizable panels store pixel dimensions per-session:

```ts
export interface LayoutSizes {
  explorerWidth: number       // Default: 256px
  fileViewerSize: number      // Default: 300px (height or width depending on position)
  userTerminalHeight: number  // Default: 192px
  diffPanelWidth: number      // Default: 320px
  reviewPanelWidth: number    // Default: 320px
}
```

Updated via drag-to-resize dividers in `Layout.tsx` and persisted with a 500ms debounce.

### Legacy field compatibility

The codebase migrated from individual booleans (`showExplorer`, `showUserTerminal`) to the generic `panelVisibility` map. `createPanelVisibilityFromLegacy()` converts old config fields at load time, and `syncLegacyFields()` keeps them in sync after changes.

## How Panels Connect to Layout

The `Layout` component receives panel content as `Record<string, ReactNode>` and uses `isPanelVisible` to conditionally render each region:

```ts
const isPanelVisible = (panelId: string): boolean => {
  const panel = registry.get(panelId)
  if (!panel) return false
  if (panel.isGlobal) return globalPanelVisibility[panelId] ?? panel.defaultVisible
  return panelVisibility[panelId] ?? panel.defaultVisible
}

const showSidebar = isPanelVisible(PANEL_IDS.SIDEBAR)
const showExplorer = isPanelVisible(PANEL_IDS.EXPLORER)
// ... etc
```

Toolbar buttons dispatch to either `onTogglePanel` or `onToggleGlobalPanel` based on `panel.isGlobal`.

## Toolbar Customization

The `PanelPicker` component (`src/renderer/components/PanelPicker.tsx`) lets users customize the toolbar. It shows an "In Toolbar" section with drag-to-reorder and an "Available" section for panels not yet added. The order is persisted as `toolbarPanels: string[]` in config.

## How to Add a New Panel

### Step 1: Add the panel ID

```ts
// src/renderer/panels/types.ts
export const PANEL_IDS = {
  // ... existing IDs
  MY_PANEL: 'myPanel',
} as const
```

### Step 2: Define the panel

```tsx
// src/renderer/panels/builtinPanels.tsx
{
  id: PANEL_IDS.MY_PANEL,
  name: 'My Panel',
  icon: <MyPanelIcon />,
  position: 'center-left',
  defaultVisible: false,
  defaultInToolbar: true,
  resizable: true,
  minSize: 200,
  maxSize: 500,
}
```

### Step 3: Render in Layout

Pass content via the `panels` prop and add rendering logic in `Layout.tsx` for the panel's position. If resizable, add a divider and drag handling.

### Step 4: Set default visibility

```ts
// src/renderer/store/sessions.ts
const DEFAULT_PANEL_VISIBILITY: PanelVisibility = {
  // ... existing defaults
  [PANEL_IDS.MY_PANEL]: false,
}
```

### Step 5: Choose global vs per-session

- **Per-session** (default): Leave `isGlobal` unset.
- **Global**: Set `isGlobal: true` and add to `DEFAULT_GLOBAL_PANEL_VISIBILITY`.

The registry, context, toolbar, keyboard shortcuts, and persistence all work automatically.
