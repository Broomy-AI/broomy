# Session Pause — Design

A paused session is one that stays in the main session list but has no agent
process and no terminals running. It exists so you can keep a session around
while waiting for a review, without it holding a PTY. Every session is paused
when Broomy starts, so launching the app costs no processes until you pick a
session to work in.

Pause is distinct from archive: archived sessions leave the main list and are
tucked into a collapsible section; paused sessions stay exactly where they
were, only quieter.

## State model

Add `isPaused: boolean` to `Session` (`src/renderer/store/sessions.ts`) as a
**runtime-only** field. It is not added to the hand-picked persisted shape in
`configPersistence.ts`, so it is never written to disk — the same treatment as
`status`, `isUnread`, and `agentPtyId`.

- **Restored sessions start paused.** Hydration in `sessionCoreActions.ts`
  (~line 292, where `isArchived` is defaulted) sets `isPaused: true` on every
  session loaded from config. This is what makes "all sessions are paused
  after a restart" true without persisting anything.
- **New sessions start unpaused.** A session created during a run is created
  to be used, so it spawns its agent immediately.
- **Status stays `idle` while paused.** `SessionStatus` is unchanged. The grey
  LED already exists — `StatusIndicator.tsx` maps a non-unread `idle` session
  to the quiet grey dot via `statusLed.ts` — so a paused session shows the
  inactive dot with no new status state. A session only becomes green/working
  once its agent is running and produces output.

Two new actions in `sessionBranchActions.ts`, beside `archiveSession` /
`unarchiveSession`:

```ts
pauseSession(sessionId)   // isPaused: true
resumeSession(sessionId)  // isPaused: false
```

Neither changes `activeSessionId`: pausing the active session leaves it
selected and showing the paused panel. Neither needs to call `debouncedSave()`,
since the flag is runtime-only.

## Teardown and respawn

No new terminal-lifecycle machinery. `usePanelsMap.tsx` already decides which
sessions get a mounted `TabbedTerminal` (it filters `!s.isArchived`), and
unmounting a terminal runs the cleanup in `useTerminalSetup.ts` that kills the
PTY and disposes the xterm instance. Pause reuses that path:

> For a session with `isPaused: true`, render the paused placeholder in the
> per-session stack instead of `<TabbedTerminal>`.

Consequences, all of them intended:

- Every PTY belonging to the session dies — the agent terminal, user shell
  tabs, services, and docker tabs — because they are all children of the
  unmounted `TabbedTerminal`.
- Terminal scrollback is discarded. Resume starts a fresh agent, exactly as
  unarchiving does today.
- `agentPtyId` is cleared, so nothing is left pointing at a dead process.

This deliberately avoids introducing a second way to kill a terminal. The
existing critical invariant — terminal trees are never unmounted on *session
switch* — is untouched; pause is an explicit user action, not a switch.

## Paused placeholder

New component `src/renderer/panels/agent/PausedSession.tsx`, rendered in the
same absolutely-positioned per-session stack as the existing "Setting up
session…" and "Setup failed" placeholders in `usePanelsMap.tsx`, and reusing
the centered-card layout of `WelcomeScreen.tsx`:

- Headline: **Session paused**
- One line of body text explaining that no agent or terminal is running, and
  that resuming starts a fresh agent.
- A **Resume Session** CTA styled like WelcomeScreen's accent button.

Because the placeholder replaces the whole agent panel, it covers the agent
and the terminal tabs with a single message rather than repeating itself per
tab.

## Controls

**Pause**

- Hover icon on `SessionCard`, next to the existing archive and delete buttons,
  with the title toggling between "Pause session" and "Resume session".
- "Pause Session" in the terminal right-click menu, beside the existing
  "Restart Agent" item in `Terminal.tsx`.

**Resume**

- The **Resume Session** CTA in the paused placeholder.
- The same sidebar hover button.

Selecting a paused session in the sidebar does **not** wake it. This is the
point of the feature: after a restart you can click through sessions, read
their diffs and files, and only spend a PTY on the one you actually work in.

**Paused cards are slightly dimmed** in the sidebar — reduced opacity on the
card contents — so a paused session reads as inactive at a glance without
losing its position in the list. Dimming must not swallow the unread or error
signal.

## Scope boundaries

- Explorer, git polling, file watchers, and PR state are unaffected. Pause is
  about processes, not about the session's data.
- `isPaused` and `isArchived` are independent flags. Unarchiving does not
  change pause state, so a session restored from config and then unarchived is
  still paused until you resume it. Archived sessions have no terminals either
  way.
- No auto-pause on idle timers, and no pause-all command. Both are easy to add
  later on top of this state; neither is needed to solve the problem.

## Risks

Anything that writes to the agent PTY will find `agentPtyId` null on a paused
session. `sendAgentPrompt` callers and the commands feature
(`features/commands/`) must be audited during implementation so these paths
either resume the session first or are visibly unavailable, rather than
silently doing nothing.

## Testing

- Store tests: `pauseSession` / `resumeSession` behaviour, and that hydration
  defaults restored sessions to paused while newly created ones are not.
- Persistence test: `isPaused` never reaches the saved config.
- `usePanelsMap` test: a paused session renders `PausedSession` and mounts no
  `TabbedTerminal`; resuming mounts one.
- `SessionCard` test: the pause/resume toggle button and the dimmed styling.
- Storybook stories for `PausedSession`, plus a paused variant of
  `SessionCard`.

Then the project checklist: `/validate`, `/feature-doc session-pause`,
`/code-review`.
