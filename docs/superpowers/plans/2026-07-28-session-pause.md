# Session Pause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a session be paused — it stays in the main session list but runs no agent, no terminals, and nothing those started — with every session paused when Broomy starts.

**Architecture:** `isPaused` is a runtime-only field on `Session`, never persisted; hydration sets it `true` on every restored session, which is what makes all sessions paused after a restart. `usePanelsMap` renders a paused placeholder instead of `<SessionTerminal>` for a paused session, and the resulting unmount runs the existing terminal cleanup that calls `pty:kill` → `treeKill`, which already reaps descendants and detached daemons. Isolated sessions additionally get their dev container stopped, since tree-killing a `docker exec` client leaves the container running.

**Tech Stack:** Electron + React 18 + TypeScript, Zustand stores, Tailwind, Vitest (unit, co-located `*.test.ts`), Storybook (visual regression), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-07-28-session-pause-design.md`

## Global Constraints

- Use `pnpm`, never npm or yarn. Run `pnpm install` before running any test.
- `isPaused` is **runtime-only**: it must never appear in the persisted config shape in `src/renderer/store/configPersistence.ts` nor in `src/preload/apis/types.ts`.
- `SessionStatus` is **not** extended. A paused session keeps `status: 'idle'`, which already renders the grey LED via `StatusIndicator`/`statusLed.ts`.
- Do not add a second way to kill a terminal. Pause works by not rendering the terminal; the existing unmount cleanup in `src/renderer/panels/agent/hooks/useTerminalSetup.ts` does the killing.
- The critical invariant in `src/renderer/panels/agent/README.md` — terminal trees are never unmounted on *session switch* — stays true. Pause is an explicit user action, not a switch.
- Every new IPC handler must check `ctx.isE2ETest` and return mock data, matching the other handlers in `src/main/handlers/devcontainer.ts`.
- Container teardown uses `docker stop`, never `docker rm -f`.
- Teardown is best-effort: it must never throw into the UI and never block the paused placeholder from appearing.
- Run single test files with `pnpm vitest run <path>`. The full checklist (`/validate`, `/feature-doc`, `/code-review`) runs in Task 8.

---

### Task 1: `isPaused` state and store actions

**Files:**
- Modify: `src/renderer/store/sessions.ts` (Session interface ~line 116; store interface ~line 209)
- Modify: `src/renderer/store/sessionBranchActions.ts` (after `unarchiveSession`, ~line 150)
- Modify: `src/renderer/store/sessionCoreActions.ts` (hydration ~line 292; two creation sites at ~line 187 and ~line 388)
- Test: `src/renderer/store/sessionBranchActions.test.ts`
- Test: `src/renderer/store/sessionCoreActions.test.ts`
- Test: `src/renderer/store/configPersistence.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Session.isPaused: boolean`; store actions `pauseSession(sessionId: string): void` and `resumeSession(sessionId: string): void`.

- [ ] **Step 1: Write the failing store-action tests**

Add to `src/renderer/store/sessionBranchActions.test.ts`, following the existing `archiveSession` tests in that file for store setup:

```ts
describe('pauseSession / resumeSession', () => {
  it('pauses a session without changing the active session', () => {
    const store = useSessionStore.getState()
    // Uses whatever helper the existing archive tests use to seed sessions.
    seedSessions([makeSession({ id: 'a' }), makeSession({ id: 'b' })])
    useSessionStore.setState({ activeSessionId: 'a' })

    store.pauseSession('a')

    expect(useSessionStore.getState().sessions.find(s => s.id === 'a')!.isPaused).toBe(true)
    expect(useSessionStore.getState().activeSessionId).toBe('a')
  })

  it('resumes a paused session', () => {
    seedSessions([makeSession({ id: 'a', isPaused: true })])

    useSessionStore.getState().resumeSession('a')

    expect(useSessionStore.getState().sessions.find(s => s.id === 'a')!.isPaused).toBe(false)
  })

  it('leaves other sessions untouched', () => {
    seedSessions([makeSession({ id: 'a' }), makeSession({ id: 'b' })])

    useSessionStore.getState().pauseSession('a')

    expect(useSessionStore.getState().sessions.find(s => s.id === 'b')!.isPaused).toBe(false)
  })
})
```

Note the deliberate contrast with `archiveSession`: pausing the active session does **not** move `activeSessionId`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/renderer/store/sessionBranchActions.test.ts`
Expected: FAIL — `pauseSession is not a function`.

- [ ] **Step 3: Add the field to the Session type**

In `src/renderer/store/sessions.ts`, next to `isArchived` in the `Session` interface:

```ts
  /**
   * Runtime-only. A paused session stays in the main list but runs no agent,
   * no terminals, and nothing they started. Never persisted — hydration marks
   * every restored session paused, which is what makes all sessions paused
   * after a restart.
   */
  isPaused: boolean
```

And in the store interface, beside `archiveSession` / `unarchiveSession`:

```ts
  pauseSession: (sessionId: string) => void
  resumeSession: (sessionId: string) => void
```

- [ ] **Step 4: Implement the actions**

In `src/renderer/store/sessionBranchActions.ts`, after `unarchiveSession`:

```ts
    pauseSession: (sessionId: string) => {
      const { sessions } = get()
      // Unlike archiving, pausing keeps the session selected: you stay where
      // you are and see the paused panel. No debouncedSave() — isPaused is
      // runtime-only.
      set({ sessions: sessions.map((s) => (s.id === sessionId ? { ...s, isPaused: true } : s)) })
    },

    resumeSession: (sessionId: string) => {
      const { sessions } = get()
      set({ sessions: sessions.map((s) => (s.id === sessionId ? { ...s, isPaused: false } : s)) })
    },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/renderer/store/sessionBranchActions.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing hydration tests**

Add to `src/renderer/store/sessionCoreActions.test.ts`, alongside the existing load tests:

```ts
it('marks every restored session paused', async () => {
  // Follow the file's existing pattern for stubbing window.config.load.
  mockConfigLoad({ sessions: [{ id: 'a', name: 'A', directory: '/tmp/a', branch: 'a' }] })

  await useSessionStore.getState().loadSessions()

  expect(useSessionStore.getState().sessions[0].isPaused).toBe(true)
})

it('creates new sessions unpaused', () => {
  // Whatever the file already calls to create a session — match the existing
  // addSession/createSession test in this file.
  const id = createSessionForTest({ name: 'fresh' })

  expect(useSessionStore.getState().sessions.find(s => s.id === id)!.isPaused).toBe(false)
})
```

- [ ] **Step 7: Run to verify they fail**

Run: `pnpm vitest run src/renderer/store/sessionCoreActions.test.ts`
Expected: FAIL — `isPaused` is `undefined`.

- [ ] **Step 8: Set the hydration and creation defaults**

In `src/renderer/store/sessionCoreActions.ts`, in the object built during load, directly after `isArchived: sessionData.isArchived ?? false,`:

```ts
            // Every restored session starts paused — no agent or terminal runs
            // until the user resumes it. Runtime-only, so nothing is read from
            // sessionData here.
            isPaused: true,
```

At **both** session-creation sites (the ones with `isArchived: false`, ~line 187 and ~line 388), add beside it:

```ts
        isPaused: false,
```

A session created during a run was created to be used, so it spawns its agent immediately.

- [ ] **Step 9: Run to verify they pass**

Run: `pnpm vitest run src/renderer/store/sessionCoreActions.test.ts`
Expected: PASS.

- [ ] **Step 10: Write the persistence test**

Add to `src/renderer/store/configPersistence.test.ts`:

```ts
it('never persists isPaused', () => {
  const saved = buildSavedConfig([makeSession({ id: 'a', isPaused: true })])

  expect(saved.sessions[0]).not.toHaveProperty('isPaused')
})
```

Match the file's existing helper for invoking the save and capturing what was written to `window.config.save`.

- [ ] **Step 11: Run to verify it passes**

Run: `pnpm vitest run src/renderer/store/configPersistence.test.ts`
Expected: PASS immediately — `configPersistence.ts` hand-picks fields, so `isPaused` is excluded by construction. This test locks that in against a future "just spread the session" refactor. If it fails, something is spreading the session; fix the source, not the test.

- [ ] **Step 12: Fix type errors across the codebase**

Run: `pnpm typecheck`
Adding a required field breaks every test fixture and story that builds a `Session` literal. Add `isPaused: false` to each until clean. If the repo has a shared session-fixture factory, set the default there once instead of at every call site.

- [ ] **Step 13: Commit**

```bash
git add src/renderer/store
git commit -m "feat(sessions): add runtime-only isPaused state with pause/resume actions"
```

---

### Task 2: Paused placeholder component

**Files:**
- Create: `src/renderer/panels/agent/PausedSession.tsx`
- Create: `src/renderer/panels/agent/PausedSession.stories.tsx`
- Test: `src/renderer/panels/agent/PausedSession.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 (the component is presentational).
- Produces: `export default function PausedSession({ onResume }: { onResume: () => void })`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/panels/agent/PausedSession.test.tsx`. Model the setup on `src/renderer/panels/agent/WelcomeScreen.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PausedSession from './PausedSession'

describe('PausedSession', () => {
  it('explains that the session is paused', () => {
    render(<PausedSession onResume={() => {}} />)
    expect(screen.getByText('Session paused')).toBeInTheDocument()
  })

  it('calls onResume when the button is clicked', async () => {
    const onResume = vi.fn()
    render(<PausedSession onResume={onResume} />)

    await userEvent.click(screen.getByRole('button', { name: 'Resume Session' }))

    expect(onResume).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/renderer/panels/agent/PausedSession.test.tsx`
Expected: FAIL — cannot resolve `./PausedSession`.

- [ ] **Step 3: Implement the component**

Create `src/renderer/panels/agent/PausedSession.tsx`. The layout mirrors `WelcomeScreen.tsx` — read that file first and match its container classes and button styling rather than inventing new ones:

```tsx
/**
 * Shown in place of the agent panel when a session is paused.
 *
 * A paused session runs no agent, no terminals, and nothing they started.
 * Because this replaces the whole agent panel, one message covers the agent
 * and every terminal tab.
 */
export default function PausedSession({ onResume }: { onResume: () => void }) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-bg-primary">
      <div className="text-center max-w-md px-6">
        <div className="text-base font-medium text-text-primary mb-2">Session paused</div>
        <div className="text-sm text-text-secondary mb-5">
          No agent or terminal is running for this session. Resuming starts a fresh agent.
        </div>
        <button
          onClick={onResume}
          className="px-6 py-2.5 rounded-lg bg-accent text-on-accent font-medium hover:opacity-90 transition-opacity"
        >
          Resume Session
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/renderer/panels/agent/PausedSession.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the story**

Create `src/renderer/panels/agent/PausedSession.stories.tsx`, copying the meta shape from `WelcomeScreen.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import PausedSession from './PausedSession'

const meta: Meta<typeof PausedSession> = {
  title: 'Agent/PausedSession',
  component: PausedSession,
}
export default meta

export const Default: StoryObj<typeof PausedSession> = {
  args: { onResume: () => {} },
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/panels/agent/PausedSession.tsx src/renderer/panels/agent/PausedSession.stories.tsx src/renderer/panels/agent/PausedSession.test.tsx
git commit -m "feat(agent): add paused-session placeholder with resume CTA"
```

---

### Task 3: Render the placeholder instead of the terminal

This is the task that actually kills the PTYs: not rendering `<SessionTerminal>` unmounts it, and its cleanup calls `window.pty.kill`, which tree-kills the shell and everything under it.

**Files:**
- Modify: `src/renderer/hooks/usePanelsMap.tsx` (`terminalSessionKey` ~line 286; the `terminalPanel` map ~line 295)
- Test: `src/renderer/hooks/usePanelsMap.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `Session.isPaused` and `resumeSession` from Task 1; `PausedSession` from Task 2.
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the failing test**

In `src/renderer/hooks/usePanelsMap.test.tsx`, rendering the agent panel element the hook returns. If the file does not exist, model its harness on an existing hook test that renders panel output:

```tsx
it('renders the paused placeholder and no terminal for a paused session', () => {
  renderAgentPanel([makeSession({ id: 'a', isPaused: true })], { activeSessionId: 'a' })

  expect(screen.getByText('Session paused')).toBeInTheDocument()
  expect(screen.queryByTestId('session-terminal')).not.toBeInTheDocument()
})

it('renders the terminal for a running session', () => {
  renderAgentPanel([makeSession({ id: 'a', isPaused: false })], { activeSessionId: 'a' })

  expect(screen.queryByText('Session paused')).not.toBeInTheDocument()
  expect(screen.getByTestId('session-terminal')).toBeInTheDocument()
})
```

Mock `SessionTerminal` with `vi.mock` so the test never touches xterm or `window.pty`; have the mock render `<div data-testid="session-terminal" />`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/renderer/hooks/usePanelsMap.test.tsx`
Expected: FAIL — the paused session renders a terminal.

- [ ] **Step 3: Add the paused branch**

In `src/renderer/hooks/usePanelsMap.tsx`, inside `sessions.filter(s => !s.isArchived).map(...)`, add this branch **before** the `session.status === 'initializing'` branch, so a paused session never shows a spinner for work that isn't happening:

```tsx
        if (session.isPaused) {
          const isVisible = session.id === config.activeSessionId
          return (
            <div key={session.id} className={`absolute inset-0 ${isVisible ? '' : 'invisible pointer-events-none'}`}>
              <PausedSession onResume={() => resumeSession(session.id)} />
            </div>
          )
        }
```

Import `PausedSession` at the top. Obtain `resumeSession` the same way the file already reaches session-store actions — if it takes actions through `config`, thread it through there rather than importing the store directly; otherwise `useSessionStore.getState().resumeSession` at call time is fine.

- [ ] **Step 4: Include `isPaused` in the terminal memo key**

`terminalSessionKey` deliberately excludes runtime fields so agent chatter doesn't re-render the stack — but `isPaused` *must* re-render it, or pausing would leave the terminal mounted and the PTY alive. Add it:

```ts
      .map(s => `${s.id}|${s.directory}|${s.isRestored}|${s.agentId}|${s.repoId}|${s.status === 'initializing'}|${s.initError ?? ''}|${s.isPaused}`)
```

- [ ] **Step 5: Run to verify the tests pass**

Run: `pnpm vitest run src/renderer/hooks/usePanelsMap.test.tsx`
Expected: PASS.

- [ ] **Step 6: Add the teardown test**

This is the "no orphan processes" guarantee at the renderer boundary — pausing must reach `pty.kill` for every terminal in the session. Add to the same file:

```tsx
it('kills the session PTYs when it becomes paused', async () => {
  const { rerender } = renderAgentPanel([makeSession({ id: 'a', isPaused: false })], { activeSessionId: 'a' })

  rerender([makeSession({ id: 'a', isPaused: true })], { activeSessionId: 'a' })

  await waitFor(() => expect(window.pty.kill).toHaveBeenCalled())
})
```

For this test, do **not** mock `SessionTerminal`; use the real component with `window.pty` stubbed (`create` resolving, `onData`/`onExit` returning no-op disposers, `kill` a spy). If wiring the real terminal into this harness proves impractical, assert the equivalent in `src/renderer/panels/agent/Terminal.test.tsx` instead — unmounting `Terminal` calls `window.pty.kill` with the id it created — and note the substitution in the commit message.

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm vitest run src/renderer/hooks/usePanelsMap.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/hooks/usePanelsMap.tsx src/renderer/hooks/usePanelsMap.test.tsx
git commit -m "feat(agent): render paused placeholder and tear down PTYs when a session pauses"
```

---

### Task 4: Sidebar pause control and dimming

**Files:**
- Modify: `src/renderer/panels/sidebar/SessionCard.tsx` (hover button group ~line 166; card container ~line 155)
- Modify: `src/renderer/panels/sidebar/SessionList.tsx` (pass the handler down)
- Modify: `src/renderer/App.tsx` and `src/renderer/layout/Layout.tsx` if the handler is threaded from there — follow exactly how `onArchive` reaches `SessionCard`
- Modify: `src/renderer/panels/sidebar/SessionCard.stories.tsx`
- Test: `src/renderer/panels/sidebar/SessionCard.test.tsx`

**Interfaces:**
- Consumes: `Session.isPaused`, `pauseSession`, `resumeSession` from Task 1.
- Produces: `SessionCard` prop `onPause?: (e: React.MouseEvent, sessionId: string) => void`.

- [ ] **Step 1: Write the failing tests**

Add to `src/renderer/panels/sidebar/SessionCard.test.tsx`, following the existing archive-button test:

```tsx
it('shows a pause button for a running session', async () => {
  const onPause = vi.fn()
  renderCard({ session: makeSession({ id: 'a', isPaused: false }), onPause })

  await userEvent.click(screen.getByTitle('Pause session'))

  expect(onPause).toHaveBeenCalledWith(expect.anything(), 'a')
})

it('shows a resume button for a paused session', () => {
  renderCard({ session: makeSession({ id: 'a', isPaused: true }), onPause: vi.fn() })

  expect(screen.getByTitle('Resume session')).toBeInTheDocument()
})

it('dims a paused card', () => {
  const { container } = renderCard({ session: makeSession({ id: 'a', isPaused: true }), onPause: vi.fn() })

  expect(container.querySelector('[data-session-card]')!.className).toContain('opacity-60')
})

it('does not dim a running card', () => {
  const { container } = renderCard({ session: makeSession({ id: 'a', isPaused: false }), onPause: vi.fn() })

  expect(container.querySelector('[data-session-card]')!.className).not.toContain('opacity-60')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/renderer/panels/sidebar/SessionCard.test.tsx`
Expected: FAIL — no element with title "Pause session".

- [ ] **Step 3: Add the button**

In `src/renderer/panels/sidebar/SessionCard.tsx`, add the prop to the component's props type beside `onArchive`:

```tsx
  onPause?: (e: React.MouseEvent, sessionId: string) => void
```

Then, inside the hover button group and **before** the archive button:

```tsx
          {onPause && (
            <button
              onClick={(e) => onPause(e, sessionId)}
              className="text-text-secondary hover:text-text-primary p-1"
              title={session.isPaused ? 'Resume session' : 'Pause session'}
            >
              {session.isPaused ? (
                /* Play triangle */
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 4l14 8-14 8V4z" />
                </svg>
              ) : (
                /* Pause bars */
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 4v16" />
                  <path d="M15 4v16" />
                </svg>
              )}
            </button>
          )}
```

- [ ] **Step 4: Dim paused cards**

In the same file, in the card container's `className` template (the one with `isActive ? 'bg-accent/15' : ...`), append:

```tsx
      } ${session.isPaused ? 'opacity-60' : ''}`}
```

Dimming the container keeps the unread and error colours intact — they are dimmed uniformly with the rest of the card rather than suppressed, so an unread paused session is still legible.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm vitest run src/renderer/panels/sidebar/SessionCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire the handler through**

In `src/renderer/panels/sidebar/SessionList.tsx`, add an `onPause` prop and pass it to each `SessionCard`, mirroring `onArchive` exactly. At whichever level `onArchive`'s implementation lives (trace it from `SessionList` upward — likely `App.tsx`), add:

```tsx
  const handlePauseSession = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    const session = useSessionStore.getState().sessions.find(s => s.id === sessionId)
    if (session?.isPaused) resumeSession(sessionId)
    else pauseSession(sessionId)
  }, [pauseSession, resumeSession])
```

`e.stopPropagation()` matters: without it the click also selects the card.

- [ ] **Step 7: Add a paused story**

In `src/renderer/panels/sidebar/SessionCard.stories.tsx`, add a story with a paused session so the dimming is covered by visual regression:

```tsx
export const Paused: StoryObj<typeof SessionCard> = {
  args: { ...Default.args },
  // Match how the other stories seed the session store for a card.
}
```

Follow the seeding pattern the neighbouring stories use; set `isPaused: true` on the seeded session.

- [ ] **Step 8: Verify by hand**

Run `pnpm dev`. Confirm: hovering a card shows the pause bars; clicking pauses without changing which session is selected; the card dims and its dot goes grey; the agent panel shows "Session paused"; clicking the card does **not** resume it; the button becomes a play triangle that does.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/panels/sidebar src/renderer/App.tsx src/renderer/layout/Layout.tsx
git commit -m "feat(sidebar): add pause/resume control and dim paused session cards"
```

---

### Task 5: Pause from the terminal context menu

**Files:**
- Modify: `src/renderer/panels/agent/Terminal.tsx` (`handleContextMenu` ~line 156-184)
- Test: `src/renderer/panels/agent/Terminal.test.tsx`

**Interfaces:**
- Consumes: `pauseSession` from Task 1. `Terminal` already receives `storeSessionId`, the session-store id (see `TabbedTerminal.tsx:227`) — use that, not the `sessionId` prop, which is the terminal-instance id.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/panels/agent/Terminal.test.tsx`, following the existing "restart-agent" context-menu test:

```tsx
it('pauses the session from the context menu', async () => {
  const pauseSession = vi.spyOn(useSessionStore.getState(), 'pauseSession')
  window.menu.popup = vi.fn().mockResolvedValue('pause-session')
  renderTerminal({ isAgentTerminal: true, storeSessionId: 'sess-1' })

  fireEvent.contextMenu(screen.getByTestId('terminal-container'))

  await waitFor(() => expect(pauseSession).toHaveBeenCalledWith('sess-1'))
})
```

Use whatever container selector the existing context-menu test in this file uses.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/renderer/panels/agent/Terminal.test.tsx`
Expected: FAIL — `pauseSession` not called.

- [ ] **Step 3: Add the menu item and its handler**

In `handleContextMenu`, extend the agent-only items:

```tsx
      ...(isAgentTerminal ? [
        { id: 'sep', label: '', type: 'separator' as const },
        { id: 'restart-agent', label: 'Restart Agent' },
        { id: 'pause-session', label: 'Pause Session' },
      ] : []),
```

And in the result handling, after the `restart-agent` branch:

```tsx
      } else if (result === 'pause-session' && storeSessionId) {
        useSessionStore.getState().pauseSession(storeSessionId)
      }
```

Import `useSessionStore` from `../../store/sessions` if it isn't already imported. Add `storeSessionId` to the `useCallback` dependency array.

Reading the store via `getState()` inside the handler rather than subscribing keeps `Terminal` from re-rendering on unrelated session-store changes — the file is deliberately careful about that.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/renderer/panels/agent/Terminal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/agent/Terminal.tsx src/renderer/panels/agent/Terminal.test.tsx
git commit -m "feat(agent): add Pause Session to the terminal context menu"
```

---

### Task 6: Stop the dev container when an isolated session pauses

Tree-killing an isolated session's PTY kills only the local `docker exec` client — the processes inside the container, and the container itself, keep running. This task closes that hole.

**Files:**
- Modify: `src/main/devcontainer.ts` (add `stopContainer` beside `resetContainer` ~line 251)
- Modify: `src/main/handlers/devcontainer.ts` (new IPC handler)
- Modify: `src/preload/apis/devcontainer.ts` (`DevcontainerApi` type and impl)
- Modify: `src/renderer/store/sessionBranchActions.ts` (`pauseSession` from Task 1)
- Test: `src/main/handlers/devcontainer.test.ts`
- Test: `src/preload/apis/devcontainer.test.ts`
- Test: `src/renderer/store/sessionBranchActions.test.ts`

**Interfaces:**
- Consumes: `pauseSession` from Task 1.
- Produces: main `stopContainer(ctx: HandlerContext, repoDir: string): Promise<void>`; IPC channel `devcontainer:stopContainer`; preload `window.devcontainer.stopContainer(repoDir: string): Promise<void>`.

- [ ] **Step 1: Write the failing main-process test**

Add to `src/main/handlers/devcontainer.test.ts`, mirroring the existing `resetContainer` test at ~line 150:

```ts
it('stops the container without removing it', async () => {
  const ctx = makeCtx()
  ctx.dockerContainers.set('/work/a', { containerId: 'abc123', repoDir: '/work/a', image: 'devcontainer' })

  await stopContainer(ctx, '/work/a')

  expect(execFileMock).toHaveBeenCalledWith('docker', ['stop', 'abc123'], expect.anything())
  expect(execFileMock).not.toHaveBeenCalledWith('docker', expect.arrayContaining(['rm']), expect.anything())
})

it('keeps the container tracked so resume can restart it', async () => {
  const ctx = makeCtx()
  ctx.dockerContainers.set('/work/a', { containerId: 'abc123', repoDir: '/work/a', image: 'devcontainer' })

  await stopContainer(ctx, '/work/a')

  expect(ctx.dockerContainers.has('/work/a')).toBe(true)
})

it('no-ops when no container is tracked for the directory', async () => {
  await expect(stopContainer(makeCtx(), '/work/none')).resolves.toBeUndefined()
  expect(execFileMock).not.toHaveBeenCalled()
})

it('swallows docker errors', async () => {
  const ctx = makeCtx()
  ctx.dockerContainers.set('/work/a', { containerId: 'abc123', repoDir: '/work/a', image: 'devcontainer' })
  execFileMock.mockRejectedValueOnce(new Error('docker daemon not running'))

  await expect(stopContainer(ctx, '/work/a')).resolves.toBeUndefined()
})
```

The "no-ops when no container is tracked" case is what makes this safe to call for *every* pause: non-isolated sessions have no tracked container, so the renderer needs no repo lookup.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/main/handlers/devcontainer.test.ts`
Expected: FAIL — `stopContainer` is not exported.

- [ ] **Step 3: Implement `stopContainer`**

In `src/main/devcontainer.ts`, beside `resetContainer`:

```ts
/**
 * Stop a container, leaving it in place so it can be restarted quickly.
 *
 * Used when pausing a session: `docker stop` ends every process inside the
 * container, while keeping the container and its installed dependencies so
 * resume doesn't pay a full devcontainer rebuild. Contrast `resetContainer`,
 * which force-removes.
 *
 * Best-effort — never throws. No-ops when no container is tracked for the
 * directory, which is the case for every non-isolated session.
 */
export async function stopContainer(
  ctx: HandlerContext,
  repoDir: string,
): Promise<void> {
  const state = ctx.dockerContainers.get(repoDir)
  if (!state) return
  try {
    await execFileAsync('docker', ['stop', state.containerId])
  } catch {
    // Already stopped or gone — ignore
  }
}
```

Note it does **not** delete from `ctx.dockerContainers`: the container still exists, and keeping it tracked lets resume reuse it.

- [ ] **Step 4: Add the IPC handler**

In `src/main/handlers/devcontainer.ts`, import `stopContainer` and add, after the `resetContainer` handler:

```ts
  ipcMain.handle('devcontainer:stopContainer', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return
    }
    await stopContainer(ctx, repoDir)
  })
```

- [ ] **Step 5: Run to verify the main tests pass**

Run: `pnpm vitest run src/main/handlers/devcontainer.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing preload test**

Add to `src/preload/apis/devcontainer.test.ts`, matching the `resetContainer` test at ~line 44:

```ts
it('stopContainer invokes devcontainer:stopContainer with repoDir', async () => {
  await devcontainerApi.stopContainer('/workspace')
  expect(mockInvoke).toHaveBeenCalledWith('devcontainer:stopContainer', '/workspace')
})
```

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm vitest run src/preload/apis/devcontainer.test.ts`
Expected: FAIL — `stopContainer` is not a function.

- [ ] **Step 8: Add the preload method**

In `src/preload/apis/devcontainer.ts`, add to the `DevcontainerApi` type:

```ts
  stopContainer: (repoDir: string) => Promise<void>
```

and to the implementation object:

```ts
  stopContainer: (repoDir) => ipcRenderer.invoke('devcontainer:stopContainer', repoDir),
```

The `Window` type picks this up automatically — `src/preload/index.ts` declares `devcontainer: DevcontainerApi`, so no separate type edit is needed.

- [ ] **Step 9: Run to verify it passes**

Run: `pnpm vitest run src/preload/apis/devcontainer.test.ts`
Expected: PASS.

- [ ] **Step 10: Write the failing store test**

Add to `src/renderer/store/sessionBranchActions.test.ts`:

```ts
describe('pauseSession container teardown', () => {
  it('stops the container for the paused session directory', () => {
    const stopContainer = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('window', { ...window, devcontainer: { stopContainer } })
    seedSessions([makeSession({ id: 'a', directory: '/work/a' })])

    useSessionStore.getState().pauseSession('a')

    expect(stopContainer).toHaveBeenCalledWith('/work/a')
  })

  it('leaves a container alone while another running session shares the directory', () => {
    const stopContainer = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('window', { ...window, devcontainer: { stopContainer } })
    seedSessions([
      makeSession({ id: 'a', directory: '/work/shared' }),
      makeSession({ id: 'b', directory: '/work/shared', isPaused: false }),
    ])

    useSessionStore.getState().pauseSession('a')

    expect(stopContainer).not.toHaveBeenCalled()
  })

  it('does not reject when stopping fails', () => {
    const stopContainer = vi.fn().mockRejectedValue(new Error('docker down'))
    vi.stubGlobal('window', { ...window, devcontainer: { stopContainer } })
    seedSessions([makeSession({ id: 'a', directory: '/work/a' })])

    expect(() => useSessionStore.getState().pauseSession('a')).not.toThrow()
    expect(useSessionStore.getState().sessions[0].isPaused).toBe(true)
  })
})
```

Match however the rest of this test file stubs `window` APIs; if it already has a helper, use that instead of `stubGlobal`.

- [ ] **Step 11: Run to verify they fail**

Run: `pnpm vitest run src/renderer/store/sessionBranchActions.test.ts`
Expected: FAIL — `stopContainer` not called.

- [ ] **Step 12: Call it from `pauseSession`**

Update `pauseSession` in `src/renderer/store/sessionBranchActions.ts`:

```ts
    pauseSession: (sessionId: string) => {
      const { sessions } = get()
      const paused = sessions.find((s) => s.id === sessionId)
      // Unlike archiving, pausing keeps the session selected. No
      // debouncedSave() — isPaused is runtime-only.
      set({ sessions: sessions.map((s) => (s.id === sessionId ? { ...s, isPaused: true } : s)) })

      // Killing the PTY only kills the local `docker exec` client, so an
      // isolated session's container would keep running with everything in
      // it. Stop it too — unless another still-running session shares the
      // directory. No-ops for non-isolated sessions, which have no tracked
      // container. Fire-and-forget: the paused UI must not wait on docker.
      if (!paused) return
      const stillInUse = sessions.some(
        (s) => s.id !== sessionId && !s.isPaused && !s.isArchived && s.directory === paused.directory,
      )
      if (stillInUse) return
      void window.devcontainer.stopContainer(paused.directory).catch(() => {
        // Best-effort teardown; a failure here must not break pausing.
      })
    },
```

- [ ] **Step 13: Run to verify they pass**

Run: `pnpm vitest run src/renderer/store/sessionBranchActions.test.ts`
Expected: PASS.

- [ ] **Step 14: Verify no orphans by hand**

With an isolated repo configured, start a session, run a long-lived process in a terminal tab (`sleep 6000 &` inside the container, plus `pnpm dev` in a non-isolated session's tab). Pause both sessions, then check:

```bash
ps -axo pid=,ppid=,pgid=,command= | grep -E 'sleep 6000|pnpm dev' | grep -v grep   # expect no output
docker ps                                                                          # expect the session's container gone from the running list
docker ps -a                                                                       # expect it still present, status Exited
```

Then resume and confirm the agent comes back and, for the isolated session, that the container restarts rather than rebuilding from scratch.

- [ ] **Step 15: Commit**

```bash
git add src/main/devcontainer.ts src/main/handlers/devcontainer.ts src/preload/apis/devcontainer.ts src/renderer/store/sessionBranchActions.ts src/main/handlers/devcontainer.test.ts src/preload/apis/devcontainer.test.ts src/renderer/store/sessionBranchActions.test.ts
git commit -m "feat(sessions): stop the dev container when an isolated session pauses"
```

---

### Task 7: Stop commands silently succeeding against a paused session

`runAction` treats "no agent PTY" as success (`src/renderer/features/commands/actionExecutor.ts:107-110`): the `else if (ctx.agentPtyId)` has no `else`, so a command fired at a paused session returns `{ success: true }` having done nothing. `CommentsDock` already handles this correctly by disabling its button when `agentPtyId` is undefined (`CommentsDock.tsx:190`), so only the executor needs fixing.

**Files:**
- Modify: `src/renderer/features/commands/actionExecutor.ts:107-110`
- Test: `src/renderer/features/commands/actionExecutor.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/features/commands/actionExecutor.test.ts`:

```ts
it('fails with a clear message when the session has no agent terminal', async () => {
  const result = await runAction(promptAction, { ...baseCtx, agentPtyId: undefined })

  expect(result).toEqual({
    success: false,
    error: 'Session is paused — resume it to run this command.',
  })
})
```

Use the file's existing `runAction` fixtures for `promptAction` and `baseCtx`; the only change is `agentPtyId: undefined`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/renderer/features/commands/actionExecutor.test.ts`
Expected: FAIL — receives `{ success: true }`.

- [ ] **Step 3: Add the else branch**

```ts
    } else if (ctx.agentPtyId) {
      await sendAgentPrompt(ctx.agentPtyId, resolved)
    } else {
      // No agent PTY means the session is paused (or its terminal hasn't
      // spawned yet). Reporting success here would silently drop the command.
      return { success: false, error: 'Session is paused — resume it to run this command.' }
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/renderer/features/commands/actionExecutor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/commands/actionExecutor.ts src/renderer/features/commands/actionExecutor.test.ts
git commit -m "fix(commands): report failure instead of silent success when no agent terminal exists"
```

---

### Task 8: Full verification

**Files:**
- Modify: `src/renderer/panels/agent/README.md` (document the pause behaviour beside the never-unmount invariant)
- Modify: whatever `/validate`, `/feature-doc`, and `/code-review` turn up

- [ ] **Step 1: Document the invariant**

In `src/renderer/panels/agent/README.md`, under the existing "Critical invariant" section, add:

```markdown
The one deliberate exception is **pause**. A paused session renders
`PausedSession` instead of its terminal, and the resulting unmount is exactly
how its PTYs get killed — the agent terminal, user shell tabs, services, and
docker. This is a user action, never a session switch: switching sessions
still only toggles CSS visibility.
```

- [ ] **Step 2: Run the full checklist**

Run: `/validate`
This covers lint, typecheck, `check:all`, unit tests, coverage (90% line threshold), and E2E. Fix everything it reports. Expect coverage work on the files this plan touched.

- [ ] **Step 3: Update visual regression references**

Run: `pnpm storybook:test`
Review the diff report at `.storybook-report/index.html`. The new `PausedSession` story and the paused `SessionCard` story will have no reference yet; confirm every other diff is empty. If only the new stories changed, run `pnpm storybook:update-refs`.

- [ ] **Step 4: Feature documentation**

Run: `/feature-doc session-pause`

- [ ] **Step 5: Code review**

Run: `/code-review`
Fix anything it raises.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(sessions): verification and docs for session pause"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Runtime-only `isPaused`; restored paused, new unpaused; `SessionStatus` unchanged | 1 |
| `pauseSession` / `resumeSession`, active session unchanged | 1 |
| Teardown via not rendering the terminal | 3 |
| Paused placeholder with Resume CTA | 2, 3 |
| Sidebar hover control; dimming; select does not wake | 4 |
| Terminal context-menu pause | 5 |
| `treeKill` covers agent-spawned processes | 3 (renderer-boundary test), 6 (manual `ps` check) |
| `docker stop` for isolated sessions, shared-container guard | 6 |
| Risk: paths writing to a null `agentPtyId` | 7 |
| Testing section | 1-7, gated by 8 |

**Type consistency:** `isPaused` (boolean, required) is used identically across tasks; `pauseSession`/`resumeSession` take one `sessionId: string` everywhere; `stopContainer(ctx, repoDir)` in main matches `window.devcontainer.stopContainer(repoDir)` in the renderer.

**Known soft spots, flagged rather than hidden:** Task 1 Steps 1/6/10 and Task 4 Step 7 name test helpers (`seedSessions`, `makeSession`, `renderCard`, `mockConfigLoad`, `buildSavedConfig`) that may not exist under those names — each step says to follow the neighbouring test's existing pattern. Task 3 Step 6 offers an explicit fallback if the real `SessionTerminal` can't be driven from the `usePanelsMap` harness.
