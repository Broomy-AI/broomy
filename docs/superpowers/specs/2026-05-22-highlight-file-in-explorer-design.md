# Highlight currently open file in explorer source-control views

## Problem

The Files tab in the Explorer already highlights the currently open file (`selectedFilePath`) with an accent background + ring. The three Source Control tab views — Working, Branch, Commits — render file rows but never receive `selectedFilePath`, so the open file is not highlighted there. When the user has a diff open and switches between source-control views, they cannot tell which file they are currently looking at.

## Goal

Extend the existing "selected file" highlight to the three source-control views so the open file is visibly marked wherever it appears.

## Scope

In scope:

- `SCWorkingView` — both Staged and Unstaged sections (`src/renderer/panels/explorer/tabs/source-control/SCWorkingView.tsx`)
- `SCBranchView` — branch-vs-base file list (`src/renderer/panels/explorer/tabs/source-control/SCBranchView.tsx`)
- `SCCommitsView` — per-commit expanded file rows (`src/renderer/panels/explorer/tabs/source-control/SCCommitsView.tsx`)
- The `SourceControl` container and `Explorer` panel need to plumb `selectedFilePath` through to those views

Out of scope:

- `FileTree` — already works
- `ReviewPanel` — uses markdown with embedded file links, not a flat list; no highlight target
- Store, IPC, or `selectFile` action — already correctly tracks `selectedFilePath` per session
- Diff-source-aware matching (see Design decisions)

## Design

### Visual treatment

Match the existing `FileTree` row treatment so the explorer feels consistent across tabs. From `FileTree.tsx:186-188`:

```
isSelected ? 'bg-accent/20 ring-1 ring-accent/50' : 'hover:bg-bg-tertiary'
```

When `isSelected` is true the row gets the accent background + ring and the hover style is suppressed.

### Matching rule

Each SC view receives `selectedFilePath?: string | null` and `directory: string`. For each file row, the row is selected when:

```ts
selectedFilePath != null && `${directory}/${file.path}` === selectedFilePath
```

`file.path` is relative to the repo directory in all three views; `selectedFilePath` is an absolute path set by `selectFile` in the session store. This is a path-only comparison.

### Multiple-occurrence behavior

A file may appear in more than one row at the same time:

- In `SCWorkingView`, the same path can appear in both Staged and Unstaged when it has staged and unstaged changes.
- In `SCCommitsView`, the same path can appear inside several expanded commits.

When `selectedFilePath` matches, **every** matching row highlights. This is the simplest behavior and accurately tells the user "this is the file you have open." It is not a bug.

### Design decisions

**Path-only match, no diff-source matching.** The session's `selectedFilePath` is just a string; it does not record the diff base ref or which view the file was opened from. We deliberately do not add that. Highlighting every row that matches the path is honest about the data we have and is consistent with how `FileTree` works.

**No new state, no auto-scroll, no auto-expand.** The user already approved this as a path-match-only feature. The Working view file list is not collapsible; the Branch view is a flat list; the Commits view's expansion state stays driven by user clicks. We do not auto-expand a commit just because it contains the open file.

### Plumbing

Top-down prop drilling, no store changes:

1. `Explorer` already receives `selectedFilePath` (see `ExplorerPanel.tsx:22`). Pass it into `<SourceControl>` (currently not passed — needs adding).
2. `SourceControl` accepts a new `selectedFilePath?: string | null` prop and passes it into `SCWorkingView`, `SCBranchView`, and `SCCommitsView`.
3. Each view accepts `selectedFilePath?: string | null` and computes `isSelected` per row.

In `SCWorkingView`, the `FileListItem` memoized component needs `isSelected` added to its props so memoization re-renders correctly when selection changes. The `FileList` parent computes `isSelected` and forwards it.

### File-by-file changes

- `ExplorerPanel.tsx` — pass `selectedFilePath={selectedFilePath}` into `<SourceControl>` (the prop is already in scope at line 22).
- `SourceControl.tsx` — add `selectedFilePath?: string | null` to `SourceControlProps`, destructure it, forward to all three view components.
- `SCWorkingView.tsx` — add `selectedFilePath` to `SCWorkingViewProps`, thread to `FileList`, then to `FileListItem`. Add `isSelected` to `FileListItem` props and apply the selected-style class on the row `div`.
- `SCBranchView.tsx` — add `selectedFilePath` to `SCBranchViewProps`, apply selected-style class on the row `div` inside the `.map`.
- `SCCommitsView.tsx` — add `selectedFilePath` to `SCCommitsViewProps`, thread to `CommitRow`, apply selected-style class on the file row `div` inside `CommitRow`.

## Testing

Unit tests (Vitest, co-located `*.test.tsx`):

- `SCWorkingView.test.tsx` — render with `selectedFilePath` matching a staged file → assert the row has `bg-accent/20`; matching an unstaged file → same; matching nothing → no row has it.
- `SCBranchView.test.tsx` — same shape: matching path highlights the row, non-matching path leaves rows un-highlighted.
- `SCCommitsView.test.tsx` — render with an expanded commit whose files include the selected path → the file row highlights; non-expanded commits unaffected.

Stories (Storybook visual regression):

- Add a "with selected file" variant to each of `SCWorkingView.stories.tsx`, `SCBranchView.stories.tsx`, `SCCommitsView.stories.tsx`. Update `.storybook-refs/` once the visual diff is confirmed correct via `pnpm storybook:update-refs`.

## Verification

1. Run `/validate` (covers lint, typecheck, check:all, unit tests, coverage, E2E).
2. Run `/feature-doc highlight-file-in-explorer` to create the screenshot walkthrough.
3. Run `/code-review` on changed files.
