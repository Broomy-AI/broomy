# Inline file/diff comments → submit to agent (v1)

**Status:** Approved for planning
**Date:** 2026-07-23

## Summary

Add discoverable, line-level commenting on any file or diff in Broomy. Comments
accumulate in a collapsible, resizable panel docked at the bottom of the
explorer. A **Submit** button sends all pending comments to the agent as a
single numbered feedback block, then clears the list.

This is the one-directional (outbound) half of a larger review-conversation
feature. Detecting the agent's replies and threading a back-and-forth is
explicitly **out of scope** for v1.

## Motivation

The goal is a GitHub-PR-style review conversation with the coding agent —
comment on specific lines, batch the feedback, send it — but without publishing
a PR and without leaving Broomy. A partial capture mechanism already exists
(`useMonacoComments`) but it is gated to review sessions, undiscoverable, and
never actually sends anything to the agent. v1 makes commenting real,
discoverable, and actionable.

## Scope

### In scope
- Line-level commenting on any file/diff, in **all** sessions (not just review
  sessions).
- Discoverable GitHub-style add-comment affordance.
- A collapsible + resizable comments panel docked at the bottom of the explorer,
  visible across all explorer tabs.
- Submit all pending comments to the agent in the numbered format below, then
  clear the list.
- Per-comment edit and resolve/delete before submit.

### Deferred (future versions)
- Detecting the agent's numbered replies and mapping them back to comments.
- Threaded reply-back and resolve-after-reply.
- Keeping submitted comments in the list (only meaningful once replies exist).
- Creating comments by quoting terminal output.
- Multi-line / range selection targeting (v1 is single-line).

## Design

### 1. Data model & store

New Zustand store `src/renderer/store/comments.ts` — the single source of truth
shared by the editor (which creates comments) and the docked panel (which lists
and submits them). Today the comment file-IO lives inside `useMonacoComments`,
which is why the dock cannot see it; that IO moves into the store.

```ts
interface Comment {
  id: string;
  file: string;        // repo-relative path
  line: number;        // 1-based line number
  quotedText: string;  // the line's text, captured at creation
  body: string;        // the user's comment
  createdAt: string;
}
```

- Persisted **per session** to `.broomy/comments.json` in the session directory,
  reusing the existing `window.fs` (`exists`/`readFile`/`mkdir`/`writeFile`)
  pattern. Saves are debounced.
- Actions: `loadComments(sessionDir)`, `addComment`, `updateComment`,
  `resolveComment` (delete one), `clearComments` (after submit).
- Selectors: list comments for the active session, and for a given file (for
  editor decorations).

`useMonacoComments` is refactored to read/write through this store rather than
touching the file directly. The `pushed` flag on the old `PendingComment` type
is dropped (no submitted-state tracking in v1).

### 2. Capture UX (GitHub-style, discoverable)

In `MonacoViewer.tsx` and `MonacoDiffViewer.tsx` (the modified editor of the
diff):

- Hovering a line shows a **blue "+" button in the glyph margin**.
- Clicking it opens an **inline comment box** directly under that line — a
  Monaco **view zone** (pushes content down) plus an overlay widget hosting a
  textarea and **Add / Cancel** buttons.
- On **Add**, capture the line's current text as `quotedText` and call
  `addComment`.
- Lines that already have a comment show a **persistent marker** in the glyph
  margin; hovering shows the comment body; clicking re-opens the box to edit or
  resolve.
- **Ungate:** remove the `sessionType === 'review'` gate (currently at
  `usePanelsMap.tsx:248` and in the viewers) so commenting works on every
  session and file. The comments file path is derived from the session
  directory for all sessions.

### 3. Docked comments panel

New component (e.g. `src/renderer/panels/explorer/CommentsDock.tsx`) rendered in
`ExplorerPanel.tsx` **outside** the tab-content switch, pinned to the bottom so
it spans all tabs (Files / Source Control / Search / Recent / Review).

- **Collapsible:** a header with a chevron and the pending-comment count.
  Collapses to just the thin header so it never dominates the explorer.
- **Resizable:** a drag handle on its top edge, reusing the app's existing
  `Divider` / resize pattern. Its height persists like other layout sizes.
- **Body:** one-line summaries — `file:line — "quoted" — comment body`
  (truncated). Clicking a row navigates to that file + line via the existing
  `onSelectFile(path, openInDiffMode, scrollToLine, ...)`. Each row has **edit**
  and **resolve/delete** controls.
- **Footer:** a **"Submit N comments to agent"** button. Disabled with a
  tooltip when the agent isn't running (no `agentPtyId`) or when there are no
  comments.
- **Empty state:** collapsed / minimal when there are no comments.

### 4. Submit

`submitComments()`:
1. Format pending comments for the active session into the numbered block below.
2. Send it via `sendAgentPrompt(session.agentPtyId, text)`
   (`shared/utils/focusHelpers.ts`) — which writes the text, waits, writes `\r`,
   and focuses the terminal.
3. Call `clearComments()`.

Format:

```
Some feedback. Let me know what you think.
1.) path/to/file.ts:42: "the quoted line"
your comment text

2.) path/to/other.ts:10: "another line"
another comment

```

(The "Write your replies as numbered bullets" trailer from the original sketch
is intentionally **omitted** in v1 — we don't parse replies yet, so we don't
instruct a format we won't consume. It returns when reply-threading ships.)

## Data flow

```
editor "+" click → inline box → addComment
      → comments store (source of truth, debounced save to .broomy/comments.json)
      → editor decorations re-render (markers)
      → CommentsDock re-renders (summaries)

Submit button → submitComments():
      read store → format → sendAgentPrompt(agentPtyId) → clearComments
```

## Error handling & edge cases

- **Agent not running** (no `agentPtyId`): Submit disabled with an explanatory
  tooltip.
- **File-write failure** persisting `.broomy/comments.json`: surfaced through the
  existing errors store / error banner.
- **Per-session isolation:** switching sessions loads that session's comments;
  the dock reflects the active session.
- **Line drift** (file changed after a comment was made): v1 stores the line
  number plus the text snapshot and does **not** attempt to re-anchor. Accepted
  limitation for v1.

## Testing

- **Unit:** comments store (add / update / resolve / clear; persistence load &
  save with mocked `window.fs`); the submit formatter (given comments → exact
  expected string, including numbering and quoting).
- **Storybook + visual regression:** `CommentsDock` (empty / few comments /
  collapsed) and the inline comment box.
- **E2E:** comment → appears in dock → submit flow, using the standard
  `E2E_TEST=true` mock data and following existing E2E patterns. Every PR
  requires E2E per repo convention.
- Run `/validate` (lint, typecheck, check:all, unit, coverage ≥90%, E2E),
  `/feature-doc diff-comments`, and `/code-review` on changed files.

## Files touched (anticipated)

- **New:** `src/renderer/store/comments.ts` (+ test),
  `src/renderer/panels/explorer/CommentsDock.tsx` (+ story + test).
- **Modified:** `src/renderer/panels/fileViewer/hooks/useMonacoComments.ts`
  (route through store, add inline box + hover "+"),
  `viewers/MonacoViewer.tsx`, `viewers/MonacoDiffViewer.tsx` (hover affordance,
  view-zone comment box, markers, ungate),
  `src/renderer/panels/explorer/ExplorerPanel.tsx` (render dock at bottom,
  resize/collapse), `usePanelsMap.tsx` (remove review-only gate), and layout
  size persistence for the dock height.
