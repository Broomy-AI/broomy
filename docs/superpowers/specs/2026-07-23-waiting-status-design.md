# Waiting / Approved PR Review States — Design

**Date:** 2026-07-23
**Branch:** feature/waiting-status

## Summary

Add two new PR-lifecycle status chips to a Broomy session:

- **`waiting`** — a PR is open, at least one reviewer has been requested, and no
  one has left comments or requested changes yet, and the approval threshold has
  **not** been met.
- **`approved`** — same conditions, but the approval threshold **has** been met
  (and there are still no comments or change-requests).

A new **per-repo** setting controls the approval threshold: whether "at least one"
requested reviewer approving is enough, or whether "all" requested reviewers must
approve.

As part of this work we also fix a pre-existing divergence: the status chip shown
in the session list and the one shown in the source-control bar are derived by two
different code paths and can disagree. We consolidate them behind a single
derivation function.

## Background: two status concepts (intentionally kept separate)

Broomy has two distinct, orthogonal status concepts, and both stay separate:

- **`SessionStatus`** (`working` / `idle` / `error` / `initializing`) — the
  real-time agent-activity LED, driven by terminal-output heuristics
  (`src/renderer/store/sessions.ts:26`). **Untouched by this work.**
- **`StatusChip`** (`in-progress` / `pushed` / `empty` / `open` / `merged` /
  `closed` / `feedback` / `failed`) — the PR/git-lifecycle badge
  (`src/renderer/features/git/branchStatus.ts:25`). The new `waiting` and
  `approved` values are added **here**.

The new states are refinements of the existing `open` state.

## State model

### New chip values

```ts
// src/renderer/features/git/branchStatus.ts
export type StatusChip = BranchStatus | 'feedback' | 'failed' | 'waiting' | 'approved'
```

### Definitions

Given a PR that is open:

- If no reviewer was ever requested → **`open`** (unchanged; not `waiting`).
- If a reviewer was requested, no comments and no change-requests, threshold not
  met → **`waiting`**.
- If a reviewer was requested, no comments and no change-requests, threshold met →
  **`approved`**.

### Precedence (when the branch status is `open`), highest wins

```
feedback   (someone commented or requested changes — the author's turn)
  > failed   (CI checks failed)
  > approved (threshold met, ready to merge)
  > waiting  (reviewers requested, still waiting)
  > open     (default: PR open, no reviewers requested)
```

Rationale:

- `feedback` always trumps `waiting`/`approved`: a comment or change-request means
  a reviewer *did* respond, so it is no longer merely "waiting," and it outranks
  "approved" because the author needs to act.
- `failed` trumps `approved` so a green "APPROVED" badge never hides a red CI run.

This extends the existing priority in `computeStatusChip`
(`branchStatus.ts:94`), which currently does `feedback > failed > base('open')`.

## Approval threshold (per-repo setting)

New per-repo field:

```ts
// src/preload/apis/types.ts — ManagedRepo
approvalPolicy?: 'one' | 'all'   // default: 'one'
```

- **`one`** — threshold met once ≥1 requested reviewer approves.
- **`all`** — threshold met only when every requested reviewer has approved:
  no reviewer still pending, ≥1 approval, and no change-requests.

Edited in Repo Settings (`src/renderer/panels/settings/RepoSettingsEditor.tsx`),
following the existing `allowMerge` toggle pattern. Default `'one'` applies when
the field is absent (existing repos need no migration).

## Data fetching

The raw review/approval data is already fetched today in
`src/main/handlers/ghComments.ts` (`fetchPrFeedbackStatus`, line 21) but is
collapsed to a single boolean and discarded.

Add/extend a main-process handler that returns the structured facts the renderer
needs to derive `waiting`/`approved`:

```ts
// gh:prApprovalStatus (new handler, or extend the feedback handler)
interface PrApprovalStatus {
  approvals: number         // reviewers whose latest review state is APPROVED
  changesRequested: boolean // any reviewer's latest state is CHANGES_REQUESTED
  hasComments: boolean      // COMMENTED reviews or PR/issue comments since last push
  pendingReviewers: number  // requested reviewers who have not submitted a review
}
```

Derivation uses "latest review state per reviewer" (GitHub returns a review per
submission; keep the most recent per author). `requested_reviewers` are those
asked who have not yet submitted (GitHub removes a reviewer from that list once
they submit a review).

- `changesRequested` or `hasComments` → chip is `feedback` (existing behavior).
- Otherwise, with `approvalPolicy = 'one'`: `approved` if `approvals >= 1`, else
  `waiting` (when a reviewer was requested), else `open`.
- Otherwise, with `approvalPolicy = 'all'`: `approved` if `approvals >= 1 &&
  pendingReviewers === 0`, else `waiting` (when a reviewer was requested or an
  approval exists but others are still pending), else `open`.

A reviewer is considered "requested" for the purpose of `waiting` if
`pendingReviewers > 0` or any review has been submitted.

### Fetch orchestration

Wire through `src/preload/index.ts` (new `window.gh.prApprovalStatus`) and the
Window type, with an `isE2ETest` mock in the main handler.

Fetched only on explicit user action, alongside the existing feedback/checks
fetches in
`src/renderer/panels/explorer/tabs/source-control/useSourceControlData.ts`
(`usePrEffects`, line 31) — on mount, directory change, `syncStatus` change,
manual refresh, and the `broomy:agent-finished` event. **No timer polling**
(honors the "never poll GitHub" rule in CLAUDE.md).

## Store wiring

- Add a runtime session field to hold the fetched approval facts (e.g.
  `approvalStatus?: PrApprovalStatus`) plus the derived chip input, in
  `src/renderer/store/sessions.ts`.
- Add an action in `src/renderer/store/sessionBranchActions.ts`
  (e.g. `updateApprovalStatus`) that stores the facts and calls
  `recomputeStatusChip` (line 9), mirroring `updateFeedbackStatus` /
  `updateChecksStatus`.
- `computeStatusChip` reads the approval facts + the repo's `approvalPolicy` to
  produce `waiting` / `approved`.
- These are runtime-only signals; no new persisted session field is required, so
  `configPersistence.ts` needs no change. (If we later persist the last-known
  chip, add it to the renderer whitelist at `configPersistence.ts:93-133`.)

## Chip unification (fixes list-vs-bar divergence)

Today two paths render the chip differently:

- **Session list** — `SessionCard` renders straight from `session.statusChip` via
  `branchStatusBadge[status]` (`SessionCard.tsx:25`).
- **Source-control bar** — `SCPrBanner` uses its own `computePrBadge()` heuristic
  (`SCPrBanner.tsx:69`) with a fallback to a *different* map
  (`prStateBadge[prStatus.state]`) and an `isPrAwareBranch` whitelist
  (`SCPrBanner.tsx:86-87`). These can disagree before git polling catches up.

Extract a single `deriveDisplayedChip(...)` (in
`src/renderer/features/git/`) that both `SessionCard` and `SCPrBanner` call, so
the displayed chip has one source of truth. Add `waiting`/`approved` to
`branchStatusBadge` (`src/renderer/features/git/explorerHelpers.ts:100`) and
retire the `isPrAwareBranch` special-casing.

## Visuals

Add entries to `branchStatusBadge`:

- **`waiting`** — `{ label: 'WAITING', classes: 'bg-muted/20 text-text-secondary' }`
  (muted/neutral — "waiting on others").
- **`approved`** — success green, made visually distinct from `PR OPEN` (give
  `PR OPEN` a more neutral treatment or `APPROVED` a stronger/review accent so the
  two greens are not confusable), e.g.
  `{ label: 'APPROVED', classes: 'bg-success-base/20 text-success-fg' }` with
  `open` adjusted accordingly.

## Files to touch

1. `src/renderer/features/git/branchStatus.ts` — add `waiting`/`approved` to
   `StatusChip`; extend `computeStatusChip` with approval inputs + `approvalPolicy`.
2. `src/renderer/features/git/explorerHelpers.ts` — `branchStatusBadge` entries.
3. `src/renderer/features/git/` — new shared `deriveDisplayedChip`.
4. `src/renderer/store/sessions.ts` + `sessionBranchActions.ts` — approval field +
   `updateApprovalStatus` action feeding `recomputeStatusChip`.
5. `src/main/handlers/ghComments.ts` — return structured approval facts; new
   `gh:prApprovalStatus` handler with `isE2ETest` mock.
6. `src/preload/index.ts` + Window type — `window.gh.prApprovalStatus`.
7. `src/renderer/panels/explorer/tabs/source-control/useSourceControlData.ts` —
   fetch approval facts, call `updateApprovalStatus`.
8. `src/renderer/panels/explorer/tabs/source-control/SCPrBanner.tsx` +
   `src/renderer/panels/sidebar/SessionCard.tsx` — use shared `deriveDisplayedChip`.
9. `src/preload/apis/types.ts` (`ManagedRepo.approvalPolicy`) +
   `src/renderer/panels/settings/RepoSettingsEditor.tsx` — per-repo setting.

## Testing

- **Unit** — `computeStatusChip` / derivation: both policies, full precedence
  chain, the "no reviewers → open" edge, threshold boundaries (1 of N approved,
  all approved, pending reviewers remaining). New gh handler with mocked `gh` JSON
  and the `isE2ETest` mock path.
- **Storybook** — stories for the `WAITING` and `APPROVED` chips (sidebar card and
  SCM bar), added to the visual-regression set.
- **Verification** — `/validate` (lint, typecheck, check:all, unit, coverage,
  E2E), then `/feature-doc waiting-status`, then `/code-review` on changed files.

## Out of scope

- No change to the agent-activity LED (`SessionStatus`).
- No GitHub polling on a timer.
- No global (app-wide) approval setting — the policy is per-repo only.
