# Drag-to-reorder in the session sidebar

Sessions and repo groups in the sidebar can be dragged into an explicit order that
persists across restarts. Archived sessions are excluded — they always sort by how
recently they were archived.

## Motivation

The sidebar currently computes its order: `groupSessionsByRepo` sorts sessions A→Z by
branch and orders groups by `kind rank → label → repoId`. That order is nobody's
priority order. A user with a dozen sessions wants the two they're actively driving at
the top, regardless of what their branches are called.

The alphabetical sort arrived in `fcba7e3` and has not shipped in a release; the last
released version ordered sessions by insertion. Removing the sort restores the released
behavior rather than changing it, so no migration of persisted config is needed.

## Order model

**Session order is the order of the persisted `sessions` array.** No new field. The
array already persists through `configPersistence.ts`, and `addSession` already appends
(`sessionCoreActions.ts:194`), so "new sessions appear at the bottom" falls out for
free. A group's session order is the global array filtered to that group, order
preserved. Reordering splices the dragged session out of the array and reinserts it
adjacent to the drop target.

**Group order is a new `repoGroupOrder: string[]` in config**, holding repo group keys
(`repo:<id>` or `ungrouped`) and sitting alongside the existing `collapsedRepoGroups`.
Rendering: groups whose key appears in `repoGroupOrder` come first, in that order;
groups not listed — a repo added since the last drag — follow, ordered by today's
`kind rank → label → repoId` rule. Any group dragged for the first time is appended to
the list at its dropped position, so the list grows only as the user reorders. Stale
keys for deleted repos are filtered at render and pruned on the next reorder.

`collapsedRepoGroups` and `repoGroupOrder` stay separate config keys rather than
merging into one `repoGroups: {key, collapsed, order}` structure. A combined structure
would be tidier but needs a migration of already-persisted collapse state.

**Archived sessions sort by `archivedAt` descending**, most recently archived first, and
are never draggable. `archivedAt: number` is a new persisted field on `Session`, set in
`archiveSession` (`sessionBranchActions.ts:139`) and cleared in `unarchiveSession`.
Sessions archived before this change carry no timestamp; they sort below every session
that has one, keeping their relative array order among themselves.

## Drag mechanics

HTML5 drag events, following the existing precedent in
`panels/agent/TerminalTabBar.tsx`. No new dependency.

- **Session cards** are `draggable`. Valid drop targets are the other session cards **in
  the same repo group**. A card dragged over a different group's card shows no drop
  indicator and its drop is rejected, so a session can never be re-homed to a repo whose
  worktree it does not live in.
- **Repo group headers** are `draggable`, with the other headers as drop targets. A
  collapsed group can still be dragged.
- **Drop indicator**: a 2px accent line rendered above or below the hovered target
  depending on which vertical half the cursor is in. (`TerminalTabBar` marks the target
  itself with `border-l-2`; a half-based line reads better in a vertical list, where
  "between these two cards" is the meaningful position.)
- **Dragging is disabled while searching.** The search view is a flat filtered
  projection of the full list, so a drop between two visible cards has no unambiguous
  position in the underlying array.
- No keyboard equivalent for reordering. Arrow-key navigation and selection are
  unchanged.

## Components

**`sidebarDragOrder.ts`** (new, `panels/sidebar/`) — pure order arithmetic, no React:

- `moveSessionWithinGroup(sessions, draggedId, targetId, before): Session[]` — returns a
  new array with the dragged session spliced adjacent to the target. Returns the input
  unchanged if either id is missing or the two sessions resolve to different groups.
- `moveGroupKey(order, allKeys, draggedKey, targetKey, before): string[]` — returns the
  new `repoGroupOrder`, seeding from the currently-rendered key order when `order` is
  empty or partial, and dropping keys no longer in `allKeys`.

**`useSidebarDrag.ts`** (new, next to `useSessionGrouping.ts`) — holds `draggingId`,
`draggingGroupKey`, and the current drop target (`{id, before}`), and exposes the
`onDragStart` / `onDragOver` / `onDragLeave` / `onDrop` / `onDragEnd` handlers. Rejects
cross-group session drops by comparing group keys via the existing
`groupKeyForSession`.

**Store** — two actions in `sessionPanelActions.ts` (which already owns
`setRepoGroupCollapsed`): `reorderSession(draggedId, targetId, before)` and
`reorderRepoGroup(draggedKey, targetKey, before)`. Both delegate to the pure helpers and
persist through the existing 500ms debounce.

**`repoGroups.ts`** — delete the within-group `collator` sort on `group.sessions`; keep
the collator for the fallback ordering of groups absent from `repoGroupOrder`.
`groupSessionsByRepo` gains a `repoGroupOrder` parameter used to order its result.

**Presentational changes** are prop-only: `SessionList` renders the drop indicator state
it gets from the hook; `RepoGroupSection` and `RepoGroupHeader` forward drag props;
`SessionCard` becomes `draggable` and forwards its drag handlers. `SessionCard`'s memo
must not be defeated — handlers stay stable and take the session id as an argument, the
pattern already used for `onDelete` / `onArchive`.

## Testing

- Unit tests for `sidebarDragOrder.ts`: move up, move down, move to either end,
  cross-group rejection, missing ids, group-order seeding from a partial list, stale-key
  pruning.
- Unit test that archived sessions sort by `archivedAt` descending with
  timestamp-less sessions last.
- `SessionList` tests: a cross-group drop leaves the order unchanged; no drag handlers
  are attached while a search query is active; a completed drop calls the store action.
- Update `repoGroups.test.ts`, which currently asserts alphabetical within-group
  ordering.
- Storybook: a `SessionList` story with a drop indicator visible, for the visual
  regression baseline.

## Verification

1. `/validate` — lint, typecheck, check:all, unit tests, coverage, E2E.
2. `/feature-doc sidebar-drag-order` — screenshot walkthrough.
3. `/code-review` on the changed files.
