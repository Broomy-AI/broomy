# Panels

Registry-based modular panel system for the Broomy UI. Panels are the fundamental building blocks of the application layout -- sidebar, explorer, file viewer, agent terminal, user terminal, review, and settings. Each panel has a definition (ID, icon, position, defaults) and is registered in a global singleton that components query at render time.

## How It Connects

The panel registry is initialized in `PanelContext.tsx` by registering all built-in panels on import. The `PanelProvider` component wraps the app and makes the registry, toolbar state, and keyboard shortcuts available to any descendant via React context hooks. The session store (`store/sessions.ts`) imports `PANEL_IDS` and `DEFAULT_TOOLBAR_PANELS` to manage per-session and global panel visibility. `Layout.tsx` reads panel visibility to decide which panels to render and where.

## Panel Positions

Each panel declares one or more positions that control where it renders in the layout:

| Position | Location | Example Panels |
|----------|----------|----------------|
| `sidebar` | Left edge, always-visible strip | Sessions list |
| `left` | Left of center content | Explorer |
| `center-top` | Above the terminal area | File viewer (top mode) |
| `center-left` | Left of the terminal area | File viewer (left mode), Review |
| `center-main` | Main terminal area | Agent terminal |
| `center-bottom` | Below main terminal | User terminal |
| `overlay` | Replaces center content entirely | Settings |

Panels can support multiple positions (e.g. the file viewer supports both `center-top` and `center-left`). Global panels (`isGlobal: true`) like sidebar and settings are not per-session -- their visibility is stored in `globalPanelVisibility` rather than on individual sessions.

The toolbar shows up to 6 panels with keyboard shortcuts (Cmd+1 through Cmd+6). The toolbar order is persisted and can be customized by the user.

## Files

| File | Description |
|------|-------------|
| `types.ts` | Panel type definitions: `PanelPosition`, `PanelDefinition` interface, `PANEL_IDS` constants, and `DEFAULT_TOOLBAR_PANELS` order. |
| `registry.ts` | `PanelRegistry` class: a Map-backed registry with lookup by ID, position, and default state queries. Exports a global singleton. |
| `builtinPanels.tsx` | Defines the `BUILTIN_PANELS` array with all seven panel definitions and their inline SVG icon components. |
| `PanelContext.tsx` | React context provider and hooks: `PanelProvider`, `usePanelRegistry`, `usePanelContext`, `usePanelVisibility`, `usePanelToggle`, `useToolbarPanels`. Initializes the registry on import. |
| `index.ts` | Barrel export that re-exports all types, the registry, built-in panels, and context hooks. |
| `registry.test.ts` | Unit tests for the panel registry. |
| `types.test.ts` | Unit tests for panel type constants and defaults. |
