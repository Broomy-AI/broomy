# Sidebar Drag-to-Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user drag session cards and repo group headers in the sidebar into an explicit persisted order, with archived sessions always sorted most-recently-archived first.

**Architecture:** Session order becomes the order of the persisted `sessions` array — no new ordering field, and `addSession` already appends so new sessions land at the bottom. Repo group order is a new persisted `repoGroupOrder: string[]` of group keys. All order arithmetic lives in one pure module (`sidebarDragOrder.ts`); drag event state lives in one hook (`useSidebarDrag.ts`); the card and header components only receive props.

**Tech Stack:** TypeScript, React 19, Zustand, Tailwind, Vitest + Testing Library, Storybook. HTML5 drag-and-drop events — **no new dependency**.

**Spec:** `docs/superpowers/specs/2026-07-27-sidebar-drag-order-design.md`

## Global Constraints

- Use `pnpm`, never npm/yarn. Run `pnpm install` before any test run.
- Never use `${}`, `$(...)`, or `${VAR}` shell expansion in Bash tool calls.
- Do not run tests or checks ad hoc at the end — the final task runs `/validate`. Per-task test runs use the exact `pnpm vitest run <path>` commands given in the steps.
- Unit tests are co-located with source (`src/**/*.test.ts[x]`). 90% line coverage threshold.
- Follow the existing HTML5 drag precedent in `src/renderer/panels/agent/TabbedTerminal.tsx:24-75` (`useTabDragDrop`). Do not add a drag-and-drop library.
- `SessionCard` is wrapped in `memo` and each card subscribes to its own store slice. Every callback passed to it must be stable (`useCallback`) and take the session id as an argument — the pattern already used by `onDelete` / `onArchive` in `SessionList.tsx:82-96`. Do not pass per-card inline closures.
- Sessions have no `createdAt`. Timestamps come from `Date.now()`; tests that assert on them use `vi.setSystemTime`.
- Commit after each task with the message given in the task's final step.

---

### Task 1: Archived sessions sort by most-recently-archived

Adds the persisted `archivedAt` timestamp and makes `ArchivedSection` order by it. Independent of all drag work.

**Files:**
- Modify: `src/renderer/store/sessions.ts:115-116` (Session type)
- Modify: `src/renderer/store/sessionBranchActions.ts:136-157` (archive/unarchive)
- Modify: `src/renderer/store/sessionCoreActions.ts:292` (load)
- Modify: `src/renderer/store/configPersistence.ts:127-128` (save)
- Modify: `src/preload/apis/types.ts:217` (SessionData)
- Create: `src/renderer/panels/sidebar/archivedOrder.ts`
- Create: `src/renderer/panels/sidebar/archivedOrder.test.ts`
- Modify: `src/renderer/panels/sidebar/SessionList.tsx:65`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `Session.archivedAt?: number`; `sortArchived(sessions: Session[]): Session[]` from `archivedOrder.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/panels/sidebar/archivedOrder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sortArchived } from './archivedOrder'
import type { Session } from '../../store/sessions'

const mk = (id: string, archivedAt?: number) =>
  ({ id, archivedAt, isArchived: true }) as unknown as Session

describe('sortArchived', () => {
  it('puts the most recently archived first', () => {
    const out = sortArchived([mk('a', 100), mk('b', 300), mk('c', 200)])
    expect(out.map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts sessions with no timestamp last, keeping their input order', () => {
    const out = sortArchived([mk('old1'), mk('a', 100), mk('old2'), mk('b', 300)])
    expect(out.map((s) => s.id)).toEqual(['b', 'a', 'old1', 'old2'])
  })

  it('does not mutate the input array', () => {
    const input = [mk('a', 100), mk('b', 300)]
    sortArchived(input)
    expect(input.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('returns an empty array unchanged', () => {
    expect(sortArchived([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/panels/sidebar/archivedOrder.test.ts`
Expected: FAIL — cannot resolve `./archivedOrder`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/panels/sidebar/archivedOrder.ts`:

```ts
/**
 * Ordering for the sidebar's Archived section: most recently archived first.
 *
 * Archived sessions are never manually ordered — unlike active sessions, whose order
 * is the user-dragged order of the persisted array. Sessions archived before
 * `archivedAt` existed carry no timestamp; they sort below every timestamped session
 * and keep their relative array order among themselves (the sort is stable).
 */
import type { Session } from '../../store/sessions'

export function sortArchived(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const at = a.archivedAt
    const bt = b.archivedAt
    if (at === undefined && bt === undefined) return 0
    if (at === undefined) return 1
    if (bt === undefined) return -1
    return bt - at
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/renderer/panels/sidebar/archivedOrder.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the field to the Session type**

In `src/renderer/store/sessions.ts`, replace the archive-state block (currently `// Archive state (persisted)` / `isArchived: boolean`) with:

```ts
  // Archive state (persisted)
  isArchived: boolean
  // When the session was archived, epoch ms (persisted). Absent on sessions archived
  // before this field existed — those sort last in the Archived section.
  archivedAt?: number
```

In `src/preload/apis/types.ts`, directly after `isArchived?: boolean` in `SessionData`, add:

```ts
  archivedAt?: number
```

- [ ] **Step 6: Set and clear the timestamp**

In `src/renderer/store/sessionBranchActions.ts`, in `archiveSession`, change the map callback to stamp the time:

```ts
      const now = Date.now()
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? { ...s, isArchived: true, archivedAt: now } : s
      )
```

In `unarchiveSession`, clear it:

```ts
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? { ...s, isArchived: false, archivedAt: undefined } : s
      )
```

- [ ] **Step 7: Persist and restore the field**

In `src/renderer/store/configPersistence.ts`, next to the existing `isArchived: s.isArchived || undefined,` line, add:

```ts
      archivedAt: s.archivedAt,
```

In `src/renderer/store/sessionCoreActions.ts`, next to the existing `isArchived: sessionData.isArchived ?? false,` line, add:

```ts
            archivedAt: sessionData.archivedAt,
```

- [ ] **Step 8: Write the failing store test**

Append to the existing `src/renderer/store/sessionBranchActions.test.ts`, reusing its imports:

```ts
describe('archivedAt', () => {
  it('stamps archivedAt on archive and clears it on unarchive', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z'))
    useSessionStore.setState({
      sessions: [{ id: 's1', isArchived: false } as unknown as Session],
      activeSessionId: null,
    })

    useSessionStore.getState().archiveSession('s1')
    expect(useSessionStore.getState().sessions[0].archivedAt).toBe(
      new Date('2026-07-27T12:00:00Z').getTime(),
    )

    useSessionStore.getState().unarchiveSession('s1')
    expect(useSessionStore.getState().sessions[0].archivedAt).toBeUndefined()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 9: Run the store test**

Run: `pnpm vitest run src/renderer/store/sessionBranchActions.test.ts`
Expected: PASS. (Steps 5-7 already made it pass; this test guards the wiring.)

- [ ] **Step 10: Apply the sort in the sidebar**

In `src/renderer/panels/sidebar/SessionList.tsx`, add the import:

```ts
import { sortArchived } from './archivedOrder'
```

and replace the `archivedSessions` memo:

```ts
  const archivedSessions = useMemo(
    () => sortArchived(sessions.filter((s) => s.isArchived && matchesSearch(s))),
    [sessions, matchesSearch],
  )
```

- [ ] **Step 11: Run the sidebar tests**

Run: `pnpm vitest run src/renderer/panels/sidebar/`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/renderer/panels/sidebar/archivedOrder.ts src/renderer/panels/sidebar/archivedOrder.test.ts src/renderer/panels/sidebar/SessionList.tsx src/renderer/store/sessions.ts src/renderer/store/sessionBranchActions.ts src/renderer/store/sessionBranchActions.test.ts src/renderer/store/sessionCoreActions.ts src/renderer/store/configPersistence.ts src/preload/apis/types.ts
git commit -m "feat(sidebar): sort archived sessions by most recently archived"
```

---

### Task 2: Pure order arithmetic

The whole reordering algorithm, with no React and no store. Everything later is wiring.

**Files:**
- Create: `src/renderer/panels/sidebar/sidebarDragOrder.ts`
- Create: `src/renderer/panels/sidebar/sidebarDragOrder.test.ts`

**Interfaces:**
- Consumes: `groupKeyForSession(session, repos)` from `./repoGroups` (already exists, `repoGroups.ts:82`).
- Produces:
  - `moveSessionWithinGroup(sessions: Session[], repos: ManagedRepo[], draggedId: string, targetId: string, before: boolean): Session[]`
  - `moveGroupKey(order: string[], renderedKeys: string[], draggedKey: string, targetKey: string, before: boolean): string[]`

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/panels/sidebar/sidebarDragOrder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { moveSessionWithinGroup, moveGroupKey } from './sidebarDragOrder'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'

const repos = [
  { id: 'r1', name: 'One', rootDir: '/repos/one' },
  { id: 'r2', name: 'Two', rootDir: '/repos/two' },
] as unknown as ManagedRepo[]

const mk = (id: string, repoId: string) =>
  ({ id, repoId, isArchived: false }) as unknown as Session

/** r1: a, b, c interleaved with r2: x, y — so index math can't accidentally pass. */
const sessions = [mk('a', 'r1'), mk('x', 'r2'), mk('b', 'r1'), mk('y', 'r2'), mk('c', 'r1')]
const ids = (out: Session[]) => out.map((s) => s.id)

describe('moveSessionWithinGroup', () => {
  it('moves a session down, before the target', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'a', 'c', true)))
      .toEqual(['x', 'b', 'y', 'a', 'c'])
  })

  it('moves a session down, after the target', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'a', 'c', false)))
      .toEqual(['x', 'b', 'y', 'c', 'a'])
  })

  it('moves a session up, before the target', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'c', 'a', true)))
      .toEqual(['c', 'a', 'x', 'b', 'y'])
  })

  it('moves a session up, after the target', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'c', 'a', false)))
      .toEqual(['a', 'c', 'x', 'b', 'y'])
  })

  it('rejects a drop onto a session in a different repo group', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'a', 'x', true)))
      .toEqual(['a', 'x', 'b', 'y', 'c'])
  })

  it('is a no-op when dragged and target are the same session', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'a', 'a', true)))
      .toEqual(['a', 'x', 'b', 'y', 'c'])
  })

  it('is a no-op when either id is unknown', () => {
    expect(ids(moveSessionWithinGroup(sessions, repos, 'nope', 'a', true)))
      .toEqual(['a', 'x', 'b', 'y', 'c'])
    expect(ids(moveSessionWithinGroup(sessions, repos, 'a', 'nope', true)))
      .toEqual(['a', 'x', 'b', 'y', 'c'])
  })

  it('does not mutate the input array', () => {
    const input = [...sessions]
    moveSessionWithinGroup(input, repos, 'a', 'c', true)
    expect(ids(input)).toEqual(['a', 'x', 'b', 'y', 'c'])
  })
})

describe('moveGroupKey', () => {
  const rendered = ['repo:r1', 'repo:r2', 'ungrouped']

  it('seeds from the rendered order when no order is stored yet', () => {
    expect(moveGroupKey([], rendered, 'ungrouped', 'repo:r1', true))
      .toEqual(['ungrouped', 'repo:r1', 'repo:r2'])
  })

  it('drops the dragged key after the target', () => {
    expect(moveGroupKey(rendered, rendered, 'repo:r1', 'ungrouped', false))
      .toEqual(['repo:r2', 'ungrouped', 'repo:r1'])
  })

  it('appends keys rendered but not yet stored, preserving stored order first', () => {
    expect(moveGroupKey(['repo:r2'], rendered, 'ungrouped', 'repo:r2', true))
      .toEqual(['ungrouped', 'repo:r2', 'repo:r1'])
  })

  it('prunes stored keys that are no longer rendered', () => {
    expect(moveGroupKey(['repo:gone', 'repo:r1', 'repo:r2'], rendered, 'repo:r2', 'repo:r1', true))
      .toEqual(['repo:r2', 'repo:r1', 'ungrouped'])
  })

  it('is a no-op when dragged and target are the same key', () => {
    expect(moveGroupKey(rendered, rendered, 'repo:r1', 'repo:r1', true)).toEqual(rendered)
  })

  it('is a no-op when the target is not rendered', () => {
    expect(moveGroupKey(rendered, rendered, 'repo:r1', 'repo:gone', true)).toEqual(rendered)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/renderer/panels/sidebar/sidebarDragOrder.test.ts`
Expected: FAIL — cannot resolve `./sidebarDragOrder`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/panels/sidebar/sidebarDragOrder.ts`:

```ts
/**
 * Pure order arithmetic for sidebar drag-and-drop. No React, no store.
 *
 * Active session order IS the order of the persisted `sessions` array, so moving a
 * session means splicing it to sit next to its drop target in that global array. A
 * session may only move within its own repo group: group membership is derived from
 * the session's repo, so a cross-group drop has no meaning and is rejected here rather
 * than being silently coerced.
 *
 * Group order is a separate list of group keys. It is sparse by design — it holds only
 * the groups the user has actually dragged, and unlisted groups fall back to the
 * computed order in `groupSessionsByRepo`.
 */
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import { groupKeyForSession } from './repoGroups'

/**
 * Move `draggedId` adjacent to `targetId` in the global session array.
 * Returns the input array unchanged if either id is unknown, they are the same
 * session, or the two sessions live in different repo groups.
 */
export function moveSessionWithinGroup(
  sessions: Session[],
  repos: ManagedRepo[],
  draggedId: string,
  targetId: string,
  before: boolean,
): Session[] {
  if (draggedId === targetId) return sessions
  const dragged = sessions.find((s) => s.id === draggedId)
  const target = sessions.find((s) => s.id === targetId)
  if (!dragged || !target) return sessions
  if (groupKeyForSession(dragged, repos) !== groupKeyForSession(target, repos)) return sessions

  const next = sessions.filter((s) => s.id !== draggedId)
  // Index is recomputed AFTER the removal — using the pre-removal index would be
  // off by one for every downward move.
  const targetIndex = next.findIndex((s) => s.id === targetId)
  next.splice(before ? targetIndex : targetIndex + 1, 0, dragged)
  return next
}

/**
 * Move `draggedKey` adjacent to `targetKey` in the persisted group order.
 * Seeds from `renderedKeys` (the order the groups are currently displayed in) so the
 * first-ever drag produces a complete list, and prunes stored keys whose group no
 * longer renders. Returns `order` unchanged if either key is not currently rendered.
 */
export function moveGroupKey(
  order: string[],
  renderedKeys: string[],
  draggedKey: string,
  targetKey: string,
  before: boolean,
): string[] {
  if (draggedKey === targetKey) return order
  if (!renderedKeys.includes(draggedKey) || !renderedKeys.includes(targetKey)) return order

  // Stored order first (pruned of vanished groups), then anything rendered but unstored.
  const seeded = [
    ...order.filter((k) => renderedKeys.includes(k)),
    ...renderedKeys.filter((k) => !order.includes(k)),
  ]

  const next = seeded.filter((k) => k !== draggedKey)
  const targetIndex = next.indexOf(targetKey)
  next.splice(before ? targetIndex : targetIndex + 1, 0, draggedKey)
  return next
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/renderer/panels/sidebar/sidebarDragOrder.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/sidebar/sidebarDragOrder.ts src/renderer/panels/sidebar/sidebarDragOrder.test.ts
git commit -m "feat(sidebar): pure order arithmetic for drag reordering"
```

---

### Task 3: Store state and actions

Adds `repoGroupOrder` to the store and the two reorder actions, both persisted.

**Files:**
- Modify: `src/renderer/store/sessions.ts:145` (state) and `:163` (action signatures)
- Modify: `src/renderer/store/sessions.ts:232` (initial state)
- Modify: `src/renderer/store/sessionPanelActions.ts:89-95` (new actions next to `setRepoGroupCollapsed`)
- Modify: `src/renderer/store/sessionCoreActions.ts:98-101, 109, 119, 314, 320` (load + reset)
- Modify: `src/renderer/store/configPersistence.ts:140`
- Modify: `src/preload/apis/types.ts:230`
- Create: `src/renderer/store/sessionReorder.test.ts`

**Interfaces:**
- Consumes: `moveSessionWithinGroup` and `moveGroupKey` from `../panels/sidebar/sidebarDragOrder` (Task 2).
- Produces: store state `repoGroupOrder: string[]`; actions
  `reorderSession(draggedId: string, targetId: string, before: boolean): void` and
  `reorderRepoGroup(draggedKey: string, targetKey: string, renderedKeys: string[], before: boolean): void`.

> **Note on `reorderSession` and repos:** the session store does not hold repos — they live in `useRepoStore` (`src/renderer/store/repos.ts`). The action reads them with `useRepoStore.getState().repos`, the same cross-store read pattern `configPersistence.ts` uses.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/store/sessionReorder.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSessionStore } from './sessions'
import { useRepoStore } from './repos'
import type { Session } from './sessions'
import type { ManagedRepo } from '../../preload/index'

vi.mock('./configPersistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./configPersistence')>()),
  scheduleSave: vi.fn(),
}))

const mk = (id: string, repoId: string) =>
  ({ id, repoId, isArchived: false }) as unknown as Session

const ids = () => useSessionStore.getState().sessions.map((s) => s.id)

describe('reorderSession', () => {
  beforeEach(() => {
    useRepoStore.setState({
      repos: [
        { id: 'r1', name: 'One', rootDir: '/repos/one' },
        { id: 'r2', name: 'Two', rootDir: '/repos/two' },
      ] as unknown as ManagedRepo[],
    })
    useSessionStore.setState({
      sessions: [mk('a', 'r1'), mk('x', 'r2'), mk('b', 'r1'), mk('c', 'r1')],
      repoGroupOrder: [],
    })
  })

  it('moves a session before its target within the group', () => {
    useSessionStore.getState().reorderSession('c', 'a', true)
    expect(ids()).toEqual(['c', 'a', 'x', 'b'])
  })

  it('ignores a drop onto a session in another repo group', () => {
    useSessionStore.getState().reorderSession('a', 'x', true)
    expect(ids()).toEqual(['a', 'x', 'b', 'c'])
  })
})

describe('reorderRepoGroup', () => {
  beforeEach(() => {
    useSessionStore.setState({ repoGroupOrder: [] })
  })

  it('stores a full group order seeded from the rendered order', () => {
    useSessionStore
      .getState()
      .reorderRepoGroup('repo:r2', 'repo:r1', ['repo:r1', 'repo:r2', 'ungrouped'], true)
    expect(useSessionStore.getState().repoGroupOrder).toEqual([
      'repo:r2',
      'repo:r1',
      'ungrouped',
    ])
  })

  it('ignores a drag onto a key that is not rendered', () => {
    useSessionStore
      .getState()
      .reorderRepoGroup('repo:r1', 'repo:gone', ['repo:r1', 'repo:r2'], true)
    expect(useSessionStore.getState().repoGroupOrder).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/store/sessionReorder.test.ts`
Expected: FAIL — `reorderSession is not a function`.

- [ ] **Step 3: Add state and action types**

In `src/renderer/store/sessions.ts`, directly after the existing `collapsedRepoGroups: string[]` state field, add:

```ts
  // User-dragged repo-group order, by group key (persisted per profile). Sparse: holds
  // only groups the user has reordered; unlisted groups fall back to the computed order.
  repoGroupOrder: string[]
```

After the `setRepoGroupCollapsed` signature in the `SessionStore` action list, add:

```ts
  reorderSession: (draggedId: string, targetId: string, before: boolean) => void
  reorderRepoGroup: (draggedKey: string, targetKey: string, renderedKeys: string[], before: boolean) => void
```

In the store's initial state, next to `collapsedRepoGroups: [],` add:

```ts
  repoGroupOrder: [],
```

- [ ] **Step 4: Implement the actions**

In `src/renderer/store/sessionPanelActions.ts`, add these imports at the top:

```ts
import { useRepoStore } from './repos'
import { moveSessionWithinGroup, moveGroupKey } from '../panels/sidebar/sidebarDragOrder'
```

and add the two actions immediately after `setRepoGroupCollapsed`:

```ts
    // Active session order IS the array order, so a drag rewrites the array. Repos come
    // from the repo store — the session store never holds them.
    reorderSession: (draggedId: string, targetId: string, before: boolean) => {
      const { sessions } = get()
      const next = moveSessionWithinGroup(
        sessions,
        useRepoStore.getState().repos,
        draggedId,
        targetId,
        before,
      )
      if (next === sessions) return // rejected drop — nothing changed
      set({ sessions: next })
      debouncedSave()
    },

    reorderRepoGroup: (draggedKey: string, targetKey: string, renderedKeys: string[], before: boolean) => {
      const current = get().repoGroupOrder
      const next = moveGroupKey(current, renderedKeys, draggedKey, targetKey, before)
      if (next === current) return
      set({ repoGroupOrder: next })
      debouncedSave()
    },
```

`sessionPanelActions.ts` declares local `StoreGet` and `StoreSet` types at the top of the file (lines 15-32). Add `repoGroupOrder: string[]` to **both** — `StoreGet` so `get().repoGroupOrder` typechecks, `StoreSet` so `set({ repoGroupOrder })` does. `sessions: Session[]` is already present in both; leave it alone.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/renderer/store/sessionReorder.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Persist and restore `repoGroupOrder`**

In `src/preload/apis/types.ts`, next to `collapsedRepoGroups?: string[]` in `ConfigData`, add:

```ts
  repoGroupOrder?: string[]
```

In `src/renderer/store/configPersistence.ts`, next to `collapsedRepoGroups: sessionState.collapsedRepoGroups,` add:

```ts
    repoGroupOrder: sessionState.repoGroupOrder,
```

and add `repoGroupOrder: string[]` to whatever local type describes `sessionState` in that file (it mirrors the store shape).

In `src/renderer/store/sessionCoreActions.ts`:

- Rename the existing `normalizeCollapsedGroups` to `normalizeGroupKeys` (it is a generic string-array normalizer and is now used for two fields), updating its one existing call site. Keep the body as-is.
- In the success branch of `loadSessions`, next to `collapsedRepoGroups: normalizeGroupKeys(config.collapsedRepoGroups),` add:

```ts
          repoGroupOrder: normalizeGroupKeys(config.repoGroupOrder),
```

- In the catch branch, add `repoGroupOrder: []` to the reset `set({...})` alongside `collapsedRepoGroups: []`, so a failed profile load cannot leak the previous profile's order.
- Add `repoGroupOrder: string[]` to the `StoreGet` / store-set types in that file that already list `collapsedRepoGroups: string[]` (lines 109 and 119).

- [ ] **Step 7: Run the store tests**

Run: `pnpm vitest run src/renderer/store/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/store/ src/preload/apis/types.ts
git commit -m "feat(sidebar): store actions and persistence for drag order"
```

---

### Task 4: Honour the manual order in grouping

Removes the alphabetical within-group sort (which arrived in `fcba7e3` and never shipped in a release) and applies `repoGroupOrder` to group ordering.

**Files:**
- Modify: `src/renderer/panels/sidebar/repoGroups.ts:98-147`
- Modify: `src/renderer/panels/sidebar/repoGroups.test.ts`
- Modify: `src/renderer/panels/sidebar/useSessionGrouping.ts:22-44`
- Modify: `src/renderer/panels/sidebar/SessionList.grouping.test.tsx` (only if its assertions depend on alphabetical order)

**Interfaces:**
- Consumes: store state `repoGroupOrder` (Task 3).
- Produces: `groupSessionsByRepo(sessions: Session[], repos: ManagedRepo[], repoGroupOrder?: string[]): RepoGroup[]` — third parameter optional, defaulting to `[]`, so existing call sites and tests keep compiling.

- [ ] **Step 1: Write the failing tests**

Add to `src/renderer/panels/sidebar/repoGroups.test.ts` (use the file's existing `mk` session factory and repo fixtures — do not introduce new ones):

```ts
describe('manual ordering', () => {
  it('keeps sessions in array order within a group, not alphabetical', () => {
    const groups = groupSessionsByRepo(
      [mk({ id: '1', repoId: 'r-a', branch: 'zebra' }), mk({ id: '2', repoId: 'r-a', branch: 'alpha' })],
      repos,
    )
    expect(groups[0].sessions.map((s) => s.branch)).toEqual(['zebra', 'alpha'])
  })

  it('orders groups by repoGroupOrder, with unlisted groups after', () => {
    const groups = groupSessionsByRepo(
      [mk({ id: '1', repoId: 'r-a' }), mk({ id: '2', repoId: 'r-b' }), mk({ id: '3', directory: '/elsewhere' })],
      repos,
      ['ungrouped', 'repo:r-b'],
    )
    expect(groups.map((g) => g.key)).toEqual(['ungrouped', 'repo:r-b', 'repo:r-a'])
  })

  it('falls back entirely to the computed order when repoGroupOrder is empty', () => {
    const groups = groupSessionsByRepo(
      [mk({ id: '1', repoId: 'r-b' }), mk({ id: '2', repoId: 'r-a' })],
      repos,
      [],
    )
    expect(groups.map((g) => g.key)).toEqual(['repo:r-a', 'repo:r-b'])
  })
})
```

Then update the file's existing assertions that expect alphabetical within-group ordering — they now describe removed behavior. Search the file for `sort`, `branch`, and `A→Z` in test names, and rewrite each to assert array order instead. Do not delete the group-ordering tests: with an empty `repoGroupOrder` the `kind rank → label → repoId` fallback still applies and must stay covered.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/renderer/panels/sidebar/repoGroups.test.ts`
Expected: FAIL — sessions come back alphabetized, and `repoGroupOrder` is ignored.

- [ ] **Step 3: Update `repoGroups.ts`**

Change the module docblock's second and third paragraphs to describe the new model:

```
 * Sessions cluster by repo. Order is the user's: sessions appear in the order of the
 * persisted `sessions` array (dragged in the sidebar, appended on creation), and groups
 * appear in `repoGroupOrder`. Groups absent from that list fall back to a computed order
 * — named repos first, then "Unknown repository", then "No repo" — so a newly added repo
 * lands somewhere predictable until the user drags it.
 *
 * That fallback ordering goes through ONE shared `Intl.Collator('en-US', …)` so it is
 * identical across dev machines and CI (bare `localeCompare` is host-locale dependent).
 * Ties fall back to the stable id, never to insertion order.
```

Change the signature and delete the within-group sort:

```ts
export function groupSessionsByRepo(
  sessions: Session[],
  repos: ManagedRepo[],
  repoGroupOrder: string[] = [],
): RepoGroup[] {
```

Delete the entire `// Sort sessions within each group: branch A→Z, then id.` block including its `for` loop — sessions now keep the array order they were pushed in.

Replace the group sort with an order-aware one:

```ts
  // Groups the user has dragged come first, in that order; the rest fall back to the
  // computed order. `indexOf` is fine here — the list is one entry per visible repo.
  const rank = (g: RepoGroup) => {
    const i = repoGroupOrder.indexOf(g.key)
    return i === -1 ? repoGroupOrder.length : i
  }
  result.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      rankForKind(a.kind) - rankForKind(b.kind) ||
      collator.compare(a.label, b.label) ||
      byId(a.repoId ?? '', b.repoId ?? ''),
  )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/renderer/panels/sidebar/repoGroups.test.ts`
Expected: PASS.

- [ ] **Step 5: Feed the order in from the hook**

In `src/renderer/panels/sidebar/useSessionGrouping.ts`, subscribe to the new state next to the existing `collapsedRepoGroups` subscription:

```ts
  const repoGroupOrder = useSessionStore((s) => s.repoGroupOrder)
```

and pass it to both `groupSessionsByRepo` call sites, updating their dependency arrays:

```ts
  const groups = useMemo(
    () => groupSessionsByRepo(allActive, repos, repoGroupOrder),
    [allActive, repos, repoGroupOrder],
  )
  const orderedSessions = useMemo(
    () => groupSessionsByRepo(activeSessions, repos, repoGroupOrder).flatMap((g) => g.sessions),
    [activeSessions, repos, repoGroupOrder],
  )
```

Also return `groups` keys for the drag hook to use in Task 6 — no code change needed, `groups` is already returned.

- [ ] **Step 6: Run the full sidebar suite**

Run: `pnpm vitest run src/renderer/panels/sidebar/`
Expected: PASS. If `SessionList.grouping.test.tsx` fails, its expectations assumed alphabetical ordering — rewrite those expectations to the array order the test's own fixture defines.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/panels/sidebar/repoGroups.ts src/renderer/panels/sidebar/repoGroups.test.ts src/renderer/panels/sidebar/useSessionGrouping.ts src/renderer/panels/sidebar/SessionList.grouping.test.tsx
git commit -m "feat(sidebar): order sessions and groups by the manual order"
```

---

### Task 5: Drag state hook

All drag event handling in one hook, modelled on `useTabDragDrop` in `TabbedTerminal.tsx:24-75`.

**Files:**
- Create: `src/renderer/panels/sidebar/useSidebarDrag.ts`
- Create: `src/renderer/panels/sidebar/useSidebarDrag.test.ts`

**Interfaces:**
- Consumes: store actions `reorderSession` / `reorderRepoGroup` (Task 3).
- Produces: `useSidebarDrag(enabled: boolean, renderedGroupKeys: string[])` returning
  `{ dropTarget: DropTarget | null, sessionDrag: DragHandlers, groupDrag: DragHandlers }` where
  `DropTarget = { id: string; kind: 'session' | 'group'; before: boolean }` and
  `DragHandlers = { onDragStart(e, id), onDragOver(e, id), onDragLeave(), onDrop(e, id), onDragEnd(e) }`.
  All handlers are `useCallback`-stable and take the id as their second argument.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/panels/sidebar/useSidebarDrag.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSidebarDrag } from './useSidebarDrag'
import { useSessionStore } from '../../store/sessions'

/** Minimal stand-in for a React.DragEvent over a 100px-tall card at y=0. */
const dragEvent = (clientY: number) =>
  ({
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientY,
    dataTransfer: { effectAllowed: '', dropEffect: '', setData: vi.fn() },
    currentTarget: {
      getBoundingClientRect: () => ({ top: 0, height: 100 }),
      style: {},
    },
  }) as unknown as React.DragEvent

describe('useSidebarDrag', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('marks the drop target as before when the cursor is in the top half', () => {
    const { result } = renderHook(() => useSidebarDrag(true, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'b'))
    expect(result.current.dropTarget).toEqual({ id: 'b', kind: 'session', before: true })
  })

  it('marks the drop target as after when the cursor is in the bottom half', () => {
    const { result } = renderHook(() => useSidebarDrag(true, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(80), 'b'))
    expect(result.current.dropTarget).toEqual({ id: 'b', kind: 'session', before: false })
  })

  it('never targets the dragged item itself', () => {
    const { result } = renderHook(() => useSidebarDrag(true, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'a'))
    expect(result.current.dropTarget).toBeNull()
  })

  it('does nothing at all when disabled', () => {
    const reorderSession = vi.fn()
    useSessionStore.setState({ reorderSession })
    const { result } = renderHook(() => useSidebarDrag(false, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'b'))
    act(() => result.current.sessionDrag.onDrop(dragEvent(20), 'b'))
    expect(result.current.dropTarget).toBeNull()
    expect(reorderSession).not.toHaveBeenCalled()
  })

  it('calls reorderSession on drop and clears the drop target', () => {
    const reorderSession = vi.fn()
    useSessionStore.setState({ reorderSession })
    const { result } = renderHook(() => useSidebarDrag(true, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'b'))
    act(() => result.current.sessionDrag.onDrop(dragEvent(20), 'b'))
    expect(reorderSession).toHaveBeenCalledWith('a', 'b', true)
    expect(result.current.dropTarget).toBeNull()
  })

  it('calls reorderRepoGroup with the rendered keys on a group drop', () => {
    const reorderRepoGroup = vi.fn()
    useSessionStore.setState({ reorderRepoGroup })
    const keys = ['repo:r1', 'repo:r2']
    const { result } = renderHook(() => useSidebarDrag(true, keys))
    act(() => result.current.groupDrag.onDragStart(dragEvent(0), 'repo:r1'))
    act(() => result.current.groupDrag.onDragOver(dragEvent(80), 'repo:r2'))
    act(() => result.current.groupDrag.onDrop(dragEvent(80), 'repo:r2'))
    expect(reorderRepoGroup).toHaveBeenCalledWith('repo:r1', 'repo:r2', keys, false)
  })

  it('does not mix a session drag with a group drop target', () => {
    const { result } = renderHook(() => useSidebarDrag(true, ['repo:r1']))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.groupDrag.onDragOver(dragEvent(20), 'repo:r1'))
    expect(result.current.dropTarget).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/panels/sidebar/useSidebarDrag.test.ts`
Expected: FAIL — cannot resolve `./useSidebarDrag`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/panels/sidebar/useSidebarDrag.ts`:

```ts
/**
 * Drag-and-drop state for the sidebar: session cards within their repo group, and repo
 * group headers among themselves.
 *
 * Sessions and groups are two separate drags that must never cross — the hook tracks
 * which kind is in flight and ignores drop targets of the other kind, so dragging a
 * card over a header (or vice versa) shows nothing and drops nowhere. The cross-repo
 * rejection itself lives in the store action, which owns the session data needed to
 * judge it.
 *
 * Drop position is "before or after this item", decided by which vertical half of the
 * target the cursor is in — in a vertical list the meaningful position is the gap
 * between two items, not the item itself.
 */
import { useState, useCallback } from 'react'
import { useSessionStore } from '../../store/sessions'

export type DropKind = 'session' | 'group'

export interface DropTarget {
  id: string
  kind: DropKind
  before: boolean
}

export interface DragHandlers {
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, id: string) => void
  onDragEnd: (e: React.DragEvent) => void
}

/** True when the cursor sits in the top half of the event's target element. */
function isBefore(e: React.DragEvent): boolean {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return e.clientY < rect.top + rect.height / 2
}

export function useSidebarDrag(enabled: boolean, renderedGroupKeys: string[]) {
  const reorderSession = useSessionStore((s) => s.reorderSession)
  const reorderRepoGroup = useSessionStore((s) => s.reorderRepoGroup)
  const [dragging, setDragging] = useState<{ id: string; kind: DropKind } | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const start = useCallback((kind: DropKind) => (e: React.DragEvent, id: string) => {
    if (!enabled) { e.preventDefault(); return }
    setDragging({ id, kind })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }, [enabled])

  const over = useCallback((kind: DropKind) => (e: React.DragEvent, id: string) => {
    if (!enabled || !dragging || dragging.kind !== kind) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragging.id === id) { setDropTarget(null); return }
    setDropTarget({ id, kind, before: isBefore(e) })
  }, [enabled, dragging])

  const leave = useCallback(() => setDropTarget(null), [])

  const drop = useCallback((kind: DropKind) => (e: React.DragEvent, id: string) => {
    if (!enabled || !dragging || dragging.kind !== kind) return
    e.preventDefault()
    e.stopPropagation()
    const before = isBefore(e)
    setDropTarget(null)
    setDragging(null)
    if (dragging.id === id) return
    if (kind === 'session') reorderSession(dragging.id, id, before)
    else reorderRepoGroup(dragging.id, id, renderedGroupKeys, before)
  }, [enabled, dragging, reorderSession, reorderRepoGroup, renderedGroupKeys])

  const end = useCallback(() => {
    setDragging(null)
    setDropTarget(null)
  }, [])

  const sessionDrag: DragHandlers = {
    onDragStart: start('session'),
    onDragOver: over('session'),
    onDragLeave: leave,
    onDrop: drop('session'),
    onDragEnd: end,
  }

  const groupDrag: DragHandlers = {
    onDragStart: start('group'),
    onDragOver: over('group'),
    onDragLeave: leave,
    onDrop: drop('group'),
    onDragEnd: end,
  }

  return { dropTarget, sessionDrag, groupDrag }
}
```

Note: `start`/`over`/`drop` are curried by kind, so the objects they build are recreated each render. That is fine for `RepoGroupSection` and `RepoGroupHeader`, which are not memoized — but `SessionCard` IS memoized, so Task 6 passes the individual `sessionDrag.on*` functions down rather than the object, and those inner functions are `useCallback`-stable.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/renderer/panels/sidebar/useSidebarDrag.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/sidebar/useSidebarDrag.ts src/renderer/panels/sidebar/useSidebarDrag.test.ts
git commit -m "feat(sidebar): drag state hook for session and group reordering"
```

---

### Task 6: Wire drag into the components

Makes cards and headers draggable and renders the drop indicator.

**Files:**
- Modify: `src/renderer/panels/sidebar/SessionCard.tsx:35-48, 95-117`
- Modify: `src/renderer/panels/sidebar/RepoGroupHeader.tsx:28-53`
- Modify: `src/renderer/panels/sidebar/RepoGroupSection.tsx:11-42`
- Modify: `src/renderer/panels/sidebar/SessionList.tsx:104-203`
- Modify: `src/renderer/panels/sidebar/SessionList.test.tsx`
- Modify: `src/renderer/panels/sidebar/SessionList.stories.tsx`

**Interfaces:**
- Consumes: `useSidebarDrag`, `DropTarget` (Task 5); `groups` from `useSessionGrouping` (Task 4).
- Produces: no new exported API. `SessionCard` and `RepoGroupHeader` gain optional drag props so their existing call sites (Storybook, `ArchivedSection`) keep working untouched.

- [ ] **Step 1: Write the failing tests**

Add to `src/renderer/panels/sidebar/SessionList.test.tsx`, reusing the file's existing `makeSession` (line 9), `setSessions` (line 65), and `makeProps` (line 51) helpers. `makeProps` defaults `repos` to `[]`, which is fine here: `resolveRepoId` returns an explicit `session.repoId` whether or not the repo still resolves, so `r1` and `r2` still produce two distinct group keys.

```ts
describe('drag to reorder', () => {
  it('makes active session cards draggable', () => {
    setSessions([
      makeSession({ id: 's1', branch: 'one', repoId: 'r1' }),
      makeSession({ id: 's2', branch: 'two', repoId: 'r1' }),
    ])
    render(<SessionList {...makeProps()} />)
    const card = document.querySelector('[data-session-id="s1"]')
    expect(card).toHaveAttribute('draggable', 'true')
  })

  it('does not make cards draggable while searching', async () => {
    setSessions([
      makeSession({ id: 's1', branch: 'one', repoId: 'r1' }),
      makeSession({ id: 's2', branch: 'two', repoId: 'r1' }),
    ])
    render(<SessionList {...makeProps()} />)
    await userEvent.type(screen.getByPlaceholderText('Search sessions...'), 'one')
    const card = document.querySelector('[data-session-id="s1"]')
    expect(card).toHaveAttribute('draggable', 'false')
  })

  it('does not make archived cards draggable', () => {
    setSessions([makeSession({ id: 's1', branch: 'gone', isArchived: true })])
    render(<SessionList {...makeProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /Archived/ }))
    const card = document.querySelector('[data-session-id="s1"]')
    expect(card).toHaveAttribute('draggable', 'false')
  })

  it('reorders within a group on drop', () => {
    setSessions([
      makeSession({ id: 's1', branch: 'one', repoId: 'r1' }),
      makeSession({ id: 's2', branch: 'two', repoId: 'r1' }),
    ])
    render(<SessionList {...makeProps()} />)
    const first = document.querySelector('[data-session-id="s1"]') as HTMLElement
    const second = document.querySelector('[data-session-id="s2"]') as HTMLElement
    fireEvent.dragStart(first)
    fireEvent.dragOver(second)
    fireEvent.drop(second)
    expect(useSessionStore.getState().sessions.map((s) => s.id)).toEqual(['s2', 's1'])
  })

  it('leaves the order unchanged when dropping onto another repo group', () => {
    setSessions([
      makeSession({ id: 's1', branch: 'one', repoId: 'r1' }),
      makeSession({ id: 's2', branch: 'two', repoId: 'r2' }),
    ])
    render(<SessionList {...makeProps()} />)
    const first = document.querySelector('[data-session-id="s1"]') as HTMLElement
    const other = document.querySelector('[data-session-id="s2"]') as HTMLElement
    fireEvent.dragStart(first)
    fireEvent.dragOver(other)
    fireEvent.drop(other)
    expect(useSessionStore.getState().sessions.map((s) => s.id)).toEqual(['s1', 's2'])
  })
})
```

`fireEvent.dragOver`/`drop` in jsdom supply a `clientY` of 0 and a zero-height `getBoundingClientRect`, so `isBefore` returns true — the expectations above assume a "before" drop.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/renderer/panels/sidebar/SessionList.test.tsx`
Expected: FAIL — cards have no `draggable` attribute.

- [ ] **Step 3: Add drag props to `SessionCard`**

In `src/renderer/panels/sidebar/SessionCard.tsx`, extend the props type:

```ts
  /** Drag-to-reorder. Omitted (or false) for archived cards and while searching. */
  draggable?: boolean
  onDragStart?: (e: React.DragEvent, sessionId: string) => void
  onDragOver?: (e: React.DragEvent, sessionId: string) => void
  onDragLeave?: () => void
  onDrop?: (e: React.DragEvent, sessionId: string) => void
  onDragEnd?: (e: React.DragEvent) => void
  /** 'before' | 'after' draws the drop indicator on that edge; null draws none. */
  dropEdge?: 'before' | 'after' | null
```

destructure them alongside the existing props, and put them on the card root. Replace the root `<div>`'s opening tag attributes — keep every existing attribute and add:

```tsx
      draggable={!!draggable}
      onDragStart={(e) => onDragStart?.(e, sessionId)}
      onDragOver={(e) => onDragOver?.(e, sessionId)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop?.(e, sessionId)}
      onDragEnd={onDragEnd}
```

and append the indicator classes to the existing `className` template, after the active/hover branch:

```tsx
      } ${dropEdge === 'before' ? 'border-t-2 border-t-accent' : ''} ${
        dropEdge === 'after' ? 'border-b-2 border-b-accent' : ''
      }`}
```

- [ ] **Step 4: Add drag props to `RepoGroupHeader`**

In `src/renderer/panels/sidebar/RepoGroupHeader.tsx`, extend the props type with the same six optional drag props (keyed by group key rather than session id) plus `dropEdge`:

```ts
  draggable?: boolean
  onDragStart?: (e: React.DragEvent, groupKey: string) => void
  onDragOver?: (e: React.DragEvent, groupKey: string) => void
  onDragLeave?: () => void
  onDrop?: (e: React.DragEvent, groupKey: string) => void
  onDragEnd?: (e: React.DragEvent) => void
  dropEdge?: 'before' | 'after' | null
```

and add to the `<button>`:

```tsx
      draggable={!!draggable}
      onDragStart={(e) => onDragStart?.(e, group.key)}
      onDragOver={(e) => onDragOver?.(e, group.key)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop?.(e, group.key)}
      onDragEnd={onDragEnd}
```

with the same two indicator classes appended to its `className`.

- [ ] **Step 5: Thread the props through `RepoGroupSection`**

In `src/renderer/panels/sidebar/RepoGroupSection.tsx`, add to the props type:

```ts
  dragEnabled: boolean
  sessionDrag: DragHandlers
  groupDrag: DragHandlers
  dropTarget: DropTarget | null
```

importing `DragHandlers` and `DropTarget` from `./useSidebarDrag`. Add a local helper above the returned JSX:

```tsx
  const edgeFor = (kind: DropKind, id: string): 'before' | 'after' | null =>
    dropTarget && dropTarget.kind === kind && dropTarget.id === id
      ? (dropTarget.before ? 'before' : 'after')
      : null
```

(importing `DropKind` too), pass `draggable={dragEnabled}`, the five `groupDrag` handlers, and `dropEdge={edgeFor('group', group.key)}` to `RepoGroupHeader`, and pass `draggable={dragEnabled}`, the five `sessionDrag` handlers, and `dropEdge={edgeFor('session', session.id)}` to each `SessionCard`. Pass the individual handler functions (`sessionDrag.onDragStart`, …), not the object — `SessionCard` is memoized and the individual functions are the stable ones.

- [ ] **Step 6: Wire up `SessionList`**

In `src/renderer/panels/sidebar/SessionList.tsx`, add the import:

```ts
import { useSidebarDrag } from './useSidebarDrag'
```

After the `useSessionGrouping` call, add:

```ts
  // Dragging is off while searching: the search view is a filtered projection, so a drop
  // between two visible cards has no unambiguous position in the underlying array.
  const renderedGroupKeys = useMemo(() => groups.map((g) => g.key), [groups])
  const { dropTarget, sessionDrag, groupDrag } = useSidebarDrag(!searching, renderedGroupKeys)
```

Pass `dragEnabled={!searching}`, `sessionDrag`, `groupDrag`, and `dropTarget` to each `RepoGroupSection`. Leave the search-mode `SessionCard` list and `ArchivedSection` untouched — both omit the drag props entirely, so their cards render with `draggable={false}`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm vitest run src/renderer/panels/sidebar/`
Expected: PASS.

- [ ] **Step 8: Add a Storybook story for the drop indicator**

In `src/renderer/panels/sidebar/SessionCard.stories.tsx`, add a story showing the indicator, following the shape of the existing `Idle` story (line 126):

```tsx
export const DropTargetBefore: Story = {
  args: { sessionId: 'session-1', draggable: true, dropEdge: 'before' },
}
```

- [ ] **Step 9: Commit**

```bash
git add src/renderer/panels/sidebar/
git commit -m "feat(sidebar): drag session cards and repo headers to reorder"
```

---

### Task 7: Validate, document, review

**Files:** whatever the checks flag.

- [ ] **Step 1: Run the full validation suite**

Run the `/validate` skill. It runs lint, typecheck, `check:all`, unit tests, coverage, and E2E in the right order and fixes failures. Do not run these individually first.

- [ ] **Step 2: Update the visual regression baseline**

Run: `pnpm storybook:test`

Review `.storybook-report/index.html`. The new `DropTargetBefore` story is expected to be new; any *other* story that changed is a regression — investigate rather than accepting it. Once the diff is understood and correct:

Run: `pnpm storybook:update-refs`

- [ ] **Step 3: Write the feature doc**

Run the `/feature-doc sidebar-drag-order` skill.

- [ ] **Step 4: Code review**

Run the `/code-review` skill, then the `rob-review` skill (per the user's global CLAUDE.md). Fix what they surface.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(sidebar): feature walkthrough for drag reordering"
```

---

## Self-Review Notes

Spec coverage check — every spec section maps to a task:

| Spec section | Task |
|---|---|
| Session order = persisted array order | 4 (removes the sort), 2+3 (rewrites the array) |
| `repoGroupOrder` config key, sparse, fallback ordering, stale-key pruning | 2 (`moveGroupKey`), 3 (persistence), 4 (rendering) |
| Archived sort by `archivedAt` desc, timestamp-less last | 1 |
| Archived never draggable | 6 (Step 6 leaves `ArchivedSection` without drag props; tested in Step 1) |
| Session cards draggable, same-group drops only | 2 (rejection), 6 (wiring) |
| Repo headers draggable, collapsed groups included | 6 (header is draggable regardless of `collapsed`) |
| Half-based drop indicator | 5 (`isBefore`), 6 (`dropEdge` classes) |
| Dragging disabled while searching | 6 (`useSidebarDrag(!searching, …)`) |
| No keyboard reorder | n/a — nothing added |
| `sidebarDragOrder.ts`, `useSidebarDrag.ts`, store actions, prop-only components | 2, 5, 3, 6 |
| Testing section | 1, 2, 3, 5, 6 tests; 7 runs the suite and the Storybook baseline |
| Verification section | 7 |
