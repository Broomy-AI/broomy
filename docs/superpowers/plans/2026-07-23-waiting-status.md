# Waiting / Approved PR Review States — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `waiting` and `approved` PR-review status chips to a session, driven by a per-repo approval-threshold setting, and unify the chip so the session list and source-control bar never disagree.

**Architecture:** `waiting`/`approved` are two new values in the existing `StatusChip` family (the PR-lifecycle badge — the agent-activity LED is untouched). A new main-process handler returns raw review counts; a pure renderer function derives a `ReviewState` (`none`/`waiting`/`approved`) from those counts plus the repo's `approvalPolicy`; the store stores it and `computeStatusChip` folds it into the chip with a fixed precedence. A single `deriveDisplayedChip` function replaces the two divergent badge-selection paths.

**Tech Stack:** Electron (main + preload + renderer), React, Zustand, TypeScript, Vitest, gh CLI.

## Global Constraints

- Use **pnpm** only (never npm/yarn).
- **Never poll GitHub on a timer** — fetch only on existing user-action triggers (mount, refresh button, `agent-finished`/unread transitions).
- Every new IPC handler must check `ctx.isE2ETest` and return deterministic mock data.
- **Never use `${}` / `$(...)` shell expansion in Bash tool calls.**
- Unit tests co-located as `*.test.ts`; 90% line coverage threshold.
- Do not run tests manually — use `/validate` (runs lint, typecheck, check:all, unit, coverage, E2E and fixes failures). Individual `pnpm exec vitest run <file>` calls in steps below are for tight TDD loops; the final gate is `/validate`.
- Precedence for an open PR (highest wins): `feedback > failed > approved > waiting > open`.
- `approvalPolicy` default is `'one'` when the field is absent.

---

### Task 1: `ReviewState` type + `computeReviewState`

**Files:**
- Create: `src/renderer/features/git/reviewState.ts`
- Test: `src/renderer/features/git/reviewState.test.ts`

**Interfaces:**
- Produces: `type ReviewState = 'none' | 'waiting' | 'approved'`; `interface PrApprovalStatus { approved: number; pending: number; otherReviews: number }`; `function computeReviewState(a: PrApprovalStatus, policy: 'one' | 'all'): ReviewState`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/features/git/reviewState.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeReviewState, type PrApprovalStatus } from './reviewState'

function counts(o: Partial<PrApprovalStatus> = {}): PrApprovalStatus {
  return { approved: 0, pending: 0, otherReviews: 0, ...o }
}

describe('computeReviewState', () => {
  it('returns none when no reviewers are involved', () => {
    expect(computeReviewState(counts(), 'one')).toBe('none')
    expect(computeReviewState(counts(), 'all')).toBe('none')
  })

  it('one-policy: waiting when requested but no approval yet', () => {
    expect(computeReviewState(counts({ pending: 2 }), 'one')).toBe('waiting')
  })

  it('one-policy: approved once at least one approves', () => {
    expect(computeReviewState(counts({ approved: 1, pending: 1 }), 'one')).toBe('approved')
  })

  it('all-policy: waiting while any reviewer is still pending', () => {
    expect(computeReviewState(counts({ approved: 1, pending: 1 }), 'all')).toBe('waiting')
  })

  it('all-policy: waiting when a reviewer left a non-approving review', () => {
    expect(computeReviewState(counts({ approved: 1, otherReviews: 1 }), 'all')).toBe('waiting')
  })

  it('all-policy: approved only when everyone approved and none pending', () => {
    expect(computeReviewState(counts({ approved: 2 }), 'all')).toBe('approved')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/renderer/features/git/reviewState.test.ts`
Expected: FAIL — cannot find module `./reviewState`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/features/git/reviewState.ts`:

```ts
/**
 * Derives a session's PR review state from GitHub review counts and the repo's
 * approval policy. Kept separate from branchStatus so the counts→state mapping is
 * unit-testable and free of git-state concerns.
 *
 * - 'one': the threshold is met once at least one requested reviewer approves.
 * - 'all': the threshold is met only when every requested reviewer has approved
 *   (no reviewer still pending, no non-approving submitted review).
 */
export type ReviewState = 'none' | 'waiting' | 'approved'

export interface PrApprovalStatus {
  /** Reviewers whose latest submitted review is APPROVED (and not re-requested). */
  approved: number
  /** Requested reviewers who have not yet submitted a review. */
  pending: number
  /** Reviewers whose latest submitted review is not APPROVED (changes/comments). */
  otherReviews: number
}

export function computeReviewState(a: PrApprovalStatus, policy: 'one' | 'all'): ReviewState {
  const total = a.approved + a.pending + a.otherReviews
  if (total === 0) return 'none'
  if (policy === 'all') {
    return a.approved >= 1 && a.pending === 0 && a.otherReviews === 0 ? 'approved' : 'waiting'
  }
  return a.approved >= 1 ? 'approved' : 'waiting'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/renderer/features/git/reviewState.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/git/reviewState.ts src/renderer/features/git/reviewState.test.ts
git commit -m "feat(git): add computeReviewState for waiting/approved review states"
```

---

### Task 2: Extend `StatusChip` + `computeStatusChip` precedence

**Files:**
- Modify: `src/renderer/features/git/branchStatus.ts:25` (type), `:94-104` (function)
- Test: `src/renderer/features/git/branchStatus.test.ts` (append)

**Interfaces:**
- Consumes: `ReviewState` from Task 1 (`./reviewState`).
- Produces: `StatusChip` now includes `'waiting' | 'approved'`; `computeStatusChip(branchStatus, hasFeedback, checksStatus, reviewState?: ReviewState)`.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/features/git/branchStatus.test.ts`:

```ts
import { computeStatusChip } from './branchStatus'

describe('computeStatusChip — waiting/approved', () => {
  it('returns waiting when open, no feedback/failure, reviewState waiting', () => {
    expect(computeStatusChip('open', false, 'passed', 'waiting')).toBe('waiting')
  })

  it('returns approved when open, no feedback/failure, reviewState approved', () => {
    expect(computeStatusChip('open', false, 'passed', 'approved')).toBe('approved')
  })

  it('feedback outranks approved', () => {
    expect(computeStatusChip('open', true, 'passed', 'approved')).toBe('feedback')
  })

  it('failed outranks approved', () => {
    expect(computeStatusChip('open', false, 'failed', 'approved')).toBe('failed')
  })

  it('approved outranks waiting is moot; approved shown over plain open', () => {
    expect(computeStatusChip('open', false, 'none', 'approved')).toBe('approved')
  })

  it('reviewState is ignored when branch is not open', () => {
    expect(computeStatusChip('pushed', false, 'none', 'approved')).toBe('pushed')
  })

  it('defaults reviewState to none (back-compat, no arg)', () => {
    expect(computeStatusChip('open', false, 'none')).toBe('open')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/renderer/features/git/branchStatus.test.ts`
Expected: FAIL — `computeStatusChip` ignores the 4th argument / type error on `'waiting'`.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/features/git/branchStatus.ts`, add the import at the top (after the file header comment):

```ts
import type { ReviewState } from './reviewState'
```

Change the `StatusChip` type (line 25) to:

```ts
export type StatusChip = BranchStatus | 'feedback' | 'failed' | 'waiting' | 'approved'
```

Update the doc comment above `computeStatusChip` and replace the function body (lines 94-104) with:

```ts
/**
 * Single function that computes the status chip value from branch status + PR metadata.
 * Used by both the sidebar and the source control panel to guarantee consistency.
 *
 * Priority (when the PR is open): feedback > failed > approved > waiting > open.
 * feedback/failed/approved/waiting only apply when the branch status is 'open'.
 */
export function computeStatusChip(
  branchStatus: BranchStatus,
  hasFeedback: boolean,
  checksStatus: 'passed' | 'failed' | 'pending' | 'none',
  reviewState: ReviewState = 'none',
): StatusChip {
  if (branchStatus === 'open') {
    if (hasFeedback) return 'feedback'
    if (checksStatus === 'failed') return 'failed'
    if (reviewState === 'approved') return 'approved'
    if (reviewState === 'waiting') return 'waiting'
  }
  return branchStatus
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/renderer/features/git/branchStatus.test.ts`
Expected: PASS (existing + 7 new).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/git/branchStatus.ts src/renderer/features/git/branchStatus.test.ts
git commit -m "feat(git): fold reviewState into computeStatusChip with waiting/approved"
```

---

### Task 3: Badge label + colors for `waiting`/`approved`

**Files:**
- Modify: `src/renderer/features/git/explorerHelpers.ts:100-108`
- Test: `src/renderer/features/git/explorerHelpers.test.ts` (append)

**Interfaces:**
- Produces: `branchStatusBadge.waiting` and `branchStatusBadge.approved` entries; `approved` visually distinct from `open`.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/features/git/explorerHelpers.test.ts`:

```ts
import { branchStatusBadge } from './explorerHelpers'

describe('branchStatusBadge — waiting/approved', () => {
  it('has a WAITING entry', () => {
    expect(branchStatusBadge.waiting.label).toBe('WAITING')
  })
  it('has an APPROVED entry', () => {
    expect(branchStatusBadge.approved.label).toBe('APPROVED')
  })
  it('APPROVED is visually distinct from PR OPEN', () => {
    expect(branchStatusBadge.approved.classes).not.toBe(branchStatusBadge.open.classes)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/renderer/features/git/explorerHelpers.test.ts`
Expected: FAIL — `branchStatusBadge.waiting` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/features/git/explorerHelpers.ts`, update the `branchStatusBadge` map (lines 100-108) so `open` reads as neutral-green and `approved` is the strong success accent, and add the two new entries:

```ts
export const branchStatusBadge: Record<string, { label: string; classes: string }> = {
  pushed: { label: 'PUSHED', classes: 'bg-info-base/20 text-info-fg' },
  empty: { label: 'EMPTY', classes: 'bg-muted/20 text-text-secondary' },
  open: { label: 'PR OPEN', classes: 'bg-info-base/20 text-info-fg' },
  waiting: { label: 'WAITING', classes: 'bg-muted/20 text-text-secondary' },
  approved: { label: 'APPROVED', classes: 'bg-success-base/20 text-success-fg' },
  feedback: { label: 'FEEDBACK', classes: 'bg-attention-base/20 text-attention-fg' },
  failed: { label: 'FAILED', classes: 'bg-danger-base/20 text-danger-fg' },
  merged: { label: 'MERGED', classes: 'bg-review-base/20 text-review-fg' },
  closed: { label: 'CLOSED', classes: 'bg-danger-base/20 text-danger-fg' },
}
```

Note: `open` changes from `success` to `info` so `APPROVED` (success green) reads as the "ready to merge" state and `PR OPEN` no longer competes with it. `prStateBadge.OPEN` (lines 116-120) stays as-is for the pre-chip fallback; leave it unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/renderer/features/git/explorerHelpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/git/explorerHelpers.ts src/renderer/features/git/explorerHelpers.test.ts
git commit -m "feat(git): add WAITING/APPROVED badges; distinguish APPROVED from PR OPEN"
```

---

### Task 4: `deriveDisplayedChip` — single source of truth for the displayed chip

**Files:**
- Create: `src/renderer/features/git/displayedChip.ts`
- Test: `src/renderer/features/git/displayedChip.test.ts`

**Interfaces:**
- Consumes: `branchStatusBadge`, `prStateBadge` (`./explorerHelpers`), `BranchStatus`, `StatusChip`, `PrState` (`./branchStatus`).
- Produces: `function deriveDisplayedChip(statusChip: StatusChip | undefined, branchStatus: BranchStatus | undefined, prState?: PrState): { label: string; classes: string } | null`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/features/git/displayedChip.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveDisplayedChip } from './displayedChip'
import { branchStatusBadge, prStateBadge } from './explorerHelpers'

describe('deriveDisplayedChip', () => {
  it('returns null for in-progress (no badge, no PR)', () => {
    expect(deriveDisplayedChip('in-progress', 'in-progress', null)).toBeNull()
  })

  it('uses the chip badge for a PR-aware chip', () => {
    expect(deriveDisplayedChip('waiting', 'open', 'OPEN')).toEqual(branchStatusBadge.waiting)
    expect(deriveDisplayedChip('approved', 'open', 'OPEN')).toEqual(branchStatusBadge.approved)
  })

  it('falls back to the live PR state when the chip has not caught up', () => {
    // branch still "pushed", but gh already reports an OPEN PR
    expect(deriveDisplayedChip('pushed', 'pushed', 'OPEN')).toEqual(prStateBadge.OPEN)
  })

  it('returns the chip badge when there is no PR state', () => {
    expect(deriveDisplayedChip('open', 'open', undefined)).toEqual(branchStatusBadge.open)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/renderer/features/git/displayedChip.test.ts`
Expected: FAIL — cannot find module `./displayedChip`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/features/git/displayedChip.ts`:

```ts
/**
 * Single source of truth for the badge shown for a session's PR/branch status.
 * Both the sidebar SessionCard and the source-control banner call this so they can
 * never disagree. Prefers the derived statusChip when it is PR-aware; otherwise
 * falls back to the live PR state (used before git polling recomputes the chip).
 */
import type { BranchStatus, StatusChip, PrState } from './branchStatus'
import { branchStatusBadge, prStateBadge } from './explorerHelpers'

const PR_AWARE_CHIPS: StatusChip[] = [
  'open', 'merged', 'closed', 'feedback', 'failed', 'waiting', 'approved',
]

export function deriveDisplayedChip(
  statusChip: StatusChip | undefined,
  branchStatus: BranchStatus | undefined,
  prState?: PrState,
): { label: string; classes: string } | null {
  const chipKey = statusChip ?? branchStatus
  const chipBadge = chipKey ? branchStatusBadge[chipKey] : undefined
  const isPrAware = chipKey !== undefined && PR_AWARE_CHIPS.includes(chipKey as StatusChip)
  if (isPrAware && chipBadge) return chipBadge
  if (prState && prStateBadge[prState]) return prStateBadge[prState]
  return chipBadge ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/renderer/features/git/displayedChip.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/git/displayedChip.ts src/renderer/features/git/displayedChip.test.ts
git commit -m "feat(git): add deriveDisplayedChip shared chip-badge selector"
```

---

### Task 5: `gh:prApprovalStatus` handler + preload API

**Files:**
- Modify: `src/main/handlers/ghComments.ts` (add `fetchPrApprovalStatus` + handler)
- Modify: `src/preload/apis/gh.ts:7-26` (type), `:28-47` (impl)
- Test: `src/main/handlers/ghComments.test.ts` (append)

**Interfaces:**
- Produces: IPC `gh:prApprovalStatus(repoDir, prNumber) -> { approved: number; pending: number; otherReviews: number }`; `window.gh.prApprovalStatus`.

- [ ] **Step 1: Write the failing test**

Append to `src/main/handlers/ghComments.test.ts` (match the existing describe/mock style already used in that file for other `gh:` handlers — reuse its `execFile`/`ipcMain` mocking harness; the assertion below targets the pure counting logic via the exported handler):

```ts
// Add to the existing ghComments handler test suite.
// Verifies the E2E mock path returns neutral counts (no chip change in screenshots).
it('gh:prApprovalStatus returns neutral counts in E2E mode', async () => {
  const handler = getHandler('gh:prApprovalStatus') // helper already used in this file
  const result = await handler({}, '/repo', 1)
  expect(result).toEqual({ approved: 0, pending: 0, otherReviews: 0 })
})
```

If `ghComments.test.ts` does not expose a `getHandler` helper, follow the exact registration/mock pattern already present in that file for `gh:prFeedbackStatus` and assert the same neutral-counts result. Do not invent a new harness.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/main/handlers/ghComments.test.ts`
Expected: FAIL — no handler registered for `gh:prApprovalStatus`.

- [ ] **Step 3: Write minimal implementation**

In `src/main/handlers/ghComments.ts`, add this function next to `fetchPrFeedbackStatus`:

```ts
export interface PrApprovalCounts {
  approved: number
  pending: number
  otherReviews: number
}

/**
 * Counts PR reviews for the waiting/approved chip. Mirrors fetchPrFeedbackStatus's
 * re-request handling: a reviewer who was re-requested (appears in
 * requested_reviewers) is counted as pending, not by their stale review state.
 */
async function fetchPrApprovalStatus(repoDir: string, prNumber: number): Promise<PrApprovalCounts> {
  const empty: PrApprovalCounts = { approved: 0, pending: 0, otherReviews: 0 }
  try {
    const dir = expandHomePath(repoDir)
    const slugResult = await execFileAsync('gh', [
      'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner',
    ], { cwd: dir, encoding: 'utf-8', timeout: 10000 })
    const slug = slugResult.stdout.trim()
    if (!slug) return empty

    const [reviewsResult, requestedResult] = await Promise.all([
      execFileAsync('gh', [
        'api', `repos/${slug}/pulls/${prNumber}/reviews`, '--jq',
        '[.[] | select(.user.type != "Bot") | {author: .user.login, state: .state}]',
      ], { cwd: dir, encoding: 'utf-8', timeout: 15000 }),
      execFileAsync('gh', [
        'api', `repos/${slug}/pulls/${prNumber}/requested_reviewers`, '--jq',
        '[.users[].login]',
      ], { cwd: dir, encoding: 'utf-8', timeout: 10000 }),
    ])

    const reviews: { author: string; state: string }[] = JSON.parse(reviewsResult.stdout.trim() || '[]')
    const requestedReviewers: string[] = JSON.parse(requestedResult.stdout.trim() || '[]')

    const latestByAuthor = new Map<string, string>()
    for (const review of reviews) {
      if (review.state === 'PENDING') continue
      latestByAuthor.set(review.author, review.state)
    }

    let approved = 0
    let otherReviews = 0
    for (const [author, state] of latestByAuthor) {
      if (requestedReviewers.includes(author)) continue // re-requested -> counted as pending
      if (state === 'APPROVED') approved++
      else otherReviews++
    }

    return { approved, pending: requestedReviewers.length, otherReviews }
  } catch {
    return empty
  }
}
```

Register the handler inside `register(...)`, next to `gh:prFeedbackStatus` (line 330):

```ts
  ipcMain.handle('gh:prApprovalStatus', async (_event, repoDir: string, prNumber: number) => {
    if (ctx.isE2ETest) return { approved: 0, pending: 0, otherReviews: 0 }
    return fetchPrApprovalStatus(repoDir, prNumber)
  })
```

In `src/preload/apis/gh.ts`, add to the `GhApi` type (after line 24):

```ts
  prApprovalStatus: (repoDir: string, prNumber: number) => Promise<{ approved: number; pending: number; otherReviews: number }>
```

and to the `ghApi` implementation (after line 45):

```ts
  prApprovalStatus: (repoDir, prNumber) => ipcRenderer.invoke('gh:prApprovalStatus', repoDir, prNumber),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/main/handlers/ghComments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/ghComments.ts src/preload/apis/gh.ts src/main/handlers/ghComments.test.ts
git commit -m "feat(gh): add gh:prApprovalStatus handler + preload API"
```

---

### Task 6: Store — `reviewState` field, defaults, and `updateReviewState`

**Files:**
- Modify: `src/renderer/store/sessions.ts:24` (re-export), `:104` (field), `:196` (action type)
- Modify: `src/renderer/store/sessionCoreActions.ts` (3 factory sites: lines ~183, ~284, ~382)
- Modify: `src/renderer/store/sessionBranchActions.ts:4-12` (import + recompute), add `updateReviewState`
- Test: `src/renderer/store/sessionBranchActions.test.ts` (append; create if absent, matching the store-test style in `src/renderer/store/*.test.ts`)

**Interfaces:**
- Consumes: `ReviewState`, `computeReviewState` (Task 1), extended `computeStatusChip` (Task 2).
- Produces: `Session.reviewState: ReviewState`; store action `updateReviewState(sessionId: string, reviewState: ReviewState): void`; `recomputeStatusChip` now passes `reviewState`.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/store/sessionBranchActions.test.ts` (use the same store-construction helper the file already uses; the sketch below shows intent):

```ts
import { computeReviewState } from '../features/git/reviewState'

describe('updateReviewState', () => {
  it('sets statusChip to approved when open PR and reviewState approved', () => {
    const store = makeStore([makeSession({ id: 's1', branchStatus: 'open', hasFeedback: false, checksStatus: 'none' })])
    store.getState().updateReviewState('s1', 'approved')
    expect(store.getState().sessions[0].reviewState).toBe('approved')
    expect(store.getState().sessions[0].statusChip).toBe('approved')
  })

  it('sets statusChip to waiting when open PR and reviewState waiting', () => {
    const store = makeStore([makeSession({ id: 's1', branchStatus: 'open', hasFeedback: false, checksStatus: 'none' })])
    store.getState().updateReviewState('s1', 'waiting')
    expect(store.getState().sessions[0].statusChip).toBe('waiting')
  })

  it('feedback still outranks approved', () => {
    const store = makeStore([makeSession({ id: 's1', branchStatus: 'open', hasFeedback: true, checksStatus: 'none' })])
    store.getState().updateReviewState('s1', 'approved')
    expect(store.getState().sessions[0].statusChip).toBe('feedback')
  })
})
```

If `sessionBranchActions.test.ts` / `makeStore` / `makeSession` helpers do not exist, create the test file following the pattern in the nearest existing store test (e.g. `src/renderer/store/sessions.test.ts`), constructing the branch actions via `createBranchActions(get, set)` over a minimal store.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/renderer/store/sessionBranchActions.test.ts`
Expected: FAIL — `updateReviewState` is not a function / `reviewState` missing.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/store/sessions.ts`:

- Extend the re-export (line 24) and import so `ReviewState` is available:

```ts
export type { BranchStatus, PrState, StatusChip }
export type { ReviewState } from '../features/git/reviewState'
```

- Add the field to the `Session` interface, right after `checksStatus` (line 104):

```ts
  // PR review state (runtime, derived from GitHub reviews + repo approvalPolicy)
  reviewState: ReviewState
```

Add the import near the other feature imports at the top of the file:

```ts
import type { ReviewState } from '../features/git/reviewState'
```

- Add the action to the `SessionStore` actions interface, next to `updateFeedbackStatus` (line 196):

```ts
  updateReviewState: (sessionId: string, reviewState: ReviewState) => void
```

In `src/renderer/store/sessionCoreActions.ts`, at each of the three session-factory objects that set `hasFeedback: false` (≈ lines 183, 284, 382), add alongside it:

```ts
        reviewState: 'none',
```

In `src/renderer/store/sessionBranchActions.ts`:

- Update the imports (lines 4-5):

```ts
import type { Session, BranchStatus, PrState } from './sessions'
import type { ReviewState } from '../features/git/reviewState'
import { computeStatusChip } from '../features/git/branchStatus'
```

- Update `recomputeStatusChip` (lines 9-12) to pass `reviewState`:

```ts
function recomputeStatusChip(s: Session): Session {
  const statusChip = computeStatusChip(s.branchStatus, s.hasFeedback, s.checksStatus, s.reviewState)
  return statusChip !== s.statusChip ? { ...s, statusChip } : s
}
```

- Add the `updateReviewState` action next to `updateChecksStatus` (after line 123):

```ts
    updateReviewState: (sessionId: string, reviewState: ReviewState) => {
      const { sessions } = get()
      const session = sessions.find((s) => s.id === sessionId)
      if (!session || session.reviewState === reviewState) return
      const updatedSessions = sessions.map((s) =>
        s.id === sessionId ? recomputeStatusChip({ ...s, reviewState }) : s
      )
      set({ sessions: updatedSessions })
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/renderer/store/sessionBranchActions.test.ts`
Expected: PASS. Then `pnpm exec tsc --noEmit` to confirm the new required `reviewState` field is set everywhere a `Session` is constructed (fix any missed factory site by adding `reviewState: 'none'`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/sessions.ts src/renderer/store/sessionCoreActions.ts src/renderer/store/sessionBranchActions.ts src/renderer/store/sessionBranchActions.test.ts
git commit -m "feat(store): add session reviewState + updateReviewState action"
```

---

### Task 7: Per-repo `approvalPolicy` setting

**Files:**
- Modify: `src/preload/apis/types.ts:37-48` (`ManagedRepo`)
- Modify: `src/renderer/panels/settings/RepoSettingsEditor.tsx`

**Interfaces:**
- Produces: `ManagedRepo.approvalPolicy?: 'one' | 'all'`; a select control in Repo Settings that saves it.

- [ ] **Step 1: Add the type field**

In `src/preload/apis/types.ts`, add to `ManagedRepo` (after line 47):

```ts
  approvalPolicy?: 'one' | 'all'  // 'one' = waiting clears once anyone approves; 'all' = all requested reviewers must approve. Default 'one'.
```

- [ ] **Step 2: Add local state + save wiring in RepoSettingsEditor**

In `src/renderer/panels/settings/RepoSettingsEditor.tsx`, add state near the other `useState` calls (after line 23):

```ts
  const [approvalPolicy, setApprovalPolicy] = useState<'one' | 'all'>(repo.approvalPolicy ?? 'one')
```

Include it in `onUpdate` inside `handleSave` (extend the object at lines 63-68):

```ts
      onUpdate({
        defaultAgentId: defaultAgentId || undefined,
        allowApproveAndMerge: allowMerge,
        isolated: isolated || undefined,
        skipApproval: skipApproval || undefined,
        approvalPolicy,
      })
```

- [ ] **Step 3: Add the control to the form**

In `RepoSettingsEditor.tsx`, add this block after the "Allow Merge PR" section (after line 131, before `<IsolationSettings ... />`):

```tsx
      <div className="space-y-2">
        <label className="text-xs text-text-secondary">Waiting status clears when</label>
        <select
          value={approvalPolicy}
          onChange={(e) => setApprovalPolicy(e.target.value as 'one' | 'all')}
          className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="one">At least one reviewer approves</option>
          <option value="all">All requested reviewers approve</option>
        </select>
      </div>
```

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no type errors). Manually confirm the select renders in the settings overlay during the later `/validate` E2E/storybook pass.

- [ ] **Step 5: Commit**

```bash
git add src/preload/apis/types.ts src/renderer/panels/settings/RepoSettingsEditor.tsx
git commit -m "feat(settings): add per-repo approvalPolicy control"
```

---

### Task 8: Fetch + derive `reviewState` in the session-level refreshers

Drives the sidebar chip for **all** sessions (works without opening the source-control panel).

**Files:**
- Modify: `src/renderer/shared/hooks/useAppCallbacks.ts:19` (repos type), `:30-32` (deps), `:53-59` (destructure), `:85-109` (`refreshPrStatus`)
- Modify: `src/renderer/App.tsx:136-188` (`usePrAutoRefresh`), `:205-207` (destructure), `:312` (call site)

**Interfaces:**
- Consumes: `computeReviewState` (Task 1), `window.gh.prApprovalStatus` (Task 5), `updateReviewState` (Task 6), `ManagedRepo.approvalPolicy` (Task 7).

- [ ] **Step 1: Extend `useAppCallbacks`**

Add the import at the top of `src/renderer/shared/hooks/useAppCallbacks.ts`:

```ts
import { computeReviewState } from '../../features/git/reviewState'
import type { ReviewState } from '../../features/git/reviewState'
```

Add `approvalPolicy` to the inline repos type (line 19):

```ts
  repos: { id: string; rootDir: string; defaultBranch: string; isolated?: boolean; skipApproval?: boolean; name?: string; defaultAgentId?: string; approvalPolicy?: 'one' | 'all' }[]
```

Add to `AppCallbacksDeps` (after line 31) and to the destructured params (after line 54):

```ts
  updateReviewState: (sessionId: string, reviewState: ReviewState) => void
```
```ts
  updateReviewState,
```

Replace the `refreshPrStatus` body (lines 85-109) so the OPEN branch also fetches approval and derives reviewState, and non-open/absent branches clear it:

```ts
  const refreshPrStatus = useCallback(async () => {
    await Promise.allSettled(sessions.map(async (session) => {
      const prResult = await window.gh.prStatus(session.directory)
      if (prResult) {
        updatePrState(session.id, prResult.state, prResult.number, prResult.url)
        if (prResult.state === 'OPEN') {
          const [checks, feedback, approval] = await Promise.all([
            window.gh.prChecksStatus(session.directory).catch(() => 'none' as const),
            window.gh.prFeedbackStatus(session.directory, prResult.number).catch(() => false),
            window.gh.prApprovalStatus(session.directory, prResult.number).catch(() => ({ approved: 0, pending: 0, otherReviews: 0 })),
          ])
          updateChecksStatus(session.id, checks)
          updateFeedbackStatus(session.id, feedback)
          const policy = repos.find((r) => r.id === session.repoId)?.approvalPolicy ?? 'one'
          updateReviewState(session.id, computeReviewState(approval, policy))
        } else {
          updateChecksStatus(session.id, 'none')
          updateFeedbackStatus(session.id, false)
          updateReviewState(session.id, 'none')
        }
      } else {
        updatePrState(session.id, null)
        updateChecksStatus(session.id, 'none')
        updateFeedbackStatus(session.id, false)
        updateReviewState(session.id, 'none')
      }
      await fetchReviewStatus(session, updateReviewStatus)
    }))
  }, [sessions, repos, updatePrState, updateFeedbackStatus, updateChecksStatus, updateReviewStatus, updateReviewState])
```

- [ ] **Step 2: Extend `usePrAutoRefresh` in App.tsx**

Add the import near the top of `src/renderer/App.tsx`:

```ts
import { computeReviewState } from './features/git/reviewState'
```

Extend the `usePrAutoRefresh` param type (lines 136-143) with `repos` and `updateReviewState`:

```ts
function usePrAutoRefresh({ isLoading, sessions, repos, refreshPrStatus, updatePrState, updateFeedbackStatus, updateChecksStatus, updateReviewState }: {
  isLoading: boolean
  sessions: Session[]
  repos: { id: string; approvalPolicy?: 'one' | 'all' }[]
  refreshPrStatus: () => Promise<void>
  updatePrState: (sessionId: string, prState: import('./features/git/branchStatus').PrState, prNumber?: number, prUrl?: string) => void
  updateFeedbackStatus: (sessionId: string, hasFeedback: boolean) => void
  updateChecksStatus: (sessionId: string, checksStatus: 'passed' | 'failed' | 'pending' | 'none') => void
  updateReviewState: (sessionId: string, reviewState: import('./features/git/reviewState').ReviewState) => void
}) {
```

In the unread-transition effect (lines 166-181), add approval fetch + derivation to the OPEN branch and clear it elsewhere:

```ts
              if (prResult.state === 'OPEN') {
                const [checks, feedback, approval] = await Promise.all([
                  window.gh.prChecksStatus(session.directory).catch(() => 'none' as const),
                  window.gh.prFeedbackStatus(session.directory, prResult.number).catch(() => false),
                  window.gh.prApprovalStatus(session.directory, prResult.number).catch(() => ({ approved: 0, pending: 0, otherReviews: 0 })),
                ])
                updateChecksStatus(session.id, checks)
                updateFeedbackStatus(session.id, feedback)
                const policy = repos.find((r) => r.id === session.repoId)?.approvalPolicy ?? 'one'
                updateReviewState(session.id, computeReviewState(approval, policy))
              } else {
                updateChecksStatus(session.id, 'none')
                updateFeedbackStatus(session.id, false)
                updateReviewState(session.id, 'none')
              }
```

and in the `else` (no PR) branch (lines 177-181) add:

```ts
              updateReviewState(session.id, 'none')
```

Update that effect's dependency array (line 187) to include `repos` and `updateReviewState`:

```ts
  }, [unreadKey, repos, updatePrState, updateFeedbackStatus, updateChecksStatus, updateReviewState])
```

Note: `session.repoId` is available on the `Session` objects iterated in `sessionsRef.current`.

- [ ] **Step 3: Pass the new args from AppContent**

In `src/renderer/App.tsx`, add `updateReviewState` to the store destructure (lines 205-207, next to `updateFeedbackStatus`):

```ts
    updateFeedbackStatus, updateChecksStatus, updateReviewState, archiveSession,
```

Add `updateReviewState` to the `useAppCallbacks({ ... })` call (line 265):

```ts
    updateFeedbackStatus, updateChecksStatus, updateReviewStatus, updateReviewState,
```

Update the `usePrAutoRefresh(...)` call (line 312):

```ts
  usePrAutoRefresh({ isLoading, sessions, repos, refreshPrStatus, updatePrState, updateFeedbackStatus, updateChecksStatus, updateReviewState })
```

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc --noEmit`
Expected: PASS. Then `pnpm exec vitest run src/renderer/shared/hooks` (if `useAppCallbacks` has a test, it must still pass).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shared/hooks/useAppCallbacks.ts src/renderer/App.tsx
git commit -m "feat(app): fetch + derive reviewState in session-level PR refreshers"
```

---

### Task 9: Fetch + derive `reviewState` in the source-control panel

Keeps the chip live for the active session while the panel is open.

**Files:**
- Modify: `src/renderer/panels/explorer/tabs/source-control/useSourceControlData.ts` (props, `PrEffectsConfig`, `usePrEffects`)
- Modify: `src/renderer/panels/explorer/tabs/source-control/SourceControl.tsx:34,58,91`
- Modify: `src/renderer/panels/explorer/types.ts:25`
- Modify: `src/renderer/panels/explorer/ExplorerPanel.tsx:34,147`
- Modify: `src/renderer/hooks/usePanelsMap.tsx:99-100,111,129-135,155-156`
- Modify: `src/renderer/App.tsx:307` (pass `updateReviewState` into `usePanelsMap`)

**Interfaces:**
- Consumes: `computeReviewState`, `window.gh.prApprovalStatus`, `updateReviewState`, `ManagedRepo.approvalPolicy`.
- Produces: `onUpdateReviewState?: (reviewState: ReviewState) => void` threaded from `usePanelsMap` down to `usePrEffects`.

- [ ] **Step 1: Thread the callback + policy through `useSourceControlData`**

In `src/renderer/panels/explorer/tabs/source-control/useSourceControlData.ts`:

- Add the import:

```ts
import { computeReviewState } from '../../../../features/git/reviewState'
import type { ReviewState } from '../../../../features/git/reviewState'
```

- Add `onUpdateReviewState` to `SourceControlDataProps` (after line 16) and `PrEffectsConfig` (after line 27), plus `approvalPolicy` to `PrEffectsConfig`:

```ts
  onUpdateReviewState?: (reviewState: ReviewState) => void
```
```ts
  onUpdateReviewState?: (reviewState: ReviewState) => void
  approvalPolicy?: 'one' | 'all'
```

- In `usePrEffects`, destructure the new config values (line 32):

```ts
  const { directory, syncStatus, branchStatus, approvalPolicy, onUpdatePrState, onUpdateFeedbackStatus, onUpdateChecksStatus, onUpdateReviewState } = config
```

- In the OPEN branch of `fetchPrInfo` (lines 60-72), fetch approval and derive:

```ts
        if (prResult?.state === 'OPEN') {
          const [checks, feedback, approval] = await Promise.all([
            window.gh.prChecksStatus(directory).catch(() => 'none' as const),
            window.gh.prFeedbackStatus(directory, prResult.number).catch(() => false),
            window.gh.prApprovalStatus(directory, prResult.number).catch(() => ({ approved: 0, pending: 0, otherReviews: 0 })),
          ])
          setChecksStatus(checks)
          onUpdateChecksStatus?.(checks)
          onUpdateFeedbackStatus?.(feedback)
          onUpdateReviewState?.(computeReviewState(approval, approvalPolicy ?? 'one'))
        } else {
          setChecksStatus('none')
          onUpdateChecksStatus?.('none')
          onUpdateFeedbackStatus?.(false)
          onUpdateReviewState?.('none')
        }
```

- In the `catch` block (lines 73-79), add:

```ts
        onUpdateReviewState?.('none')
```

- Compute `currentRepo` **before** calling `usePrEffects` and pass `approvalPolicy` + `onUpdateReviewState`. Move the `currentRepo` lookup (currently lines 178-180) above line 176 and update the `usePrEffects(...)` call:

```ts
  const repos = useRepoStore((s) => s.repos)
  const currentRepo = repoId ? repos.find((r) => r.id === repoId) : undefined

  // PR effects
  const pr = usePrEffects({
    directory, syncStatus, branchStatus,
    approvalPolicy: currentRepo?.approvalPolicy,
    onUpdatePrState, onUpdateFeedbackStatus, onUpdateChecksStatus, onUpdateReviewState,
  })
```

- Add `onUpdateReviewState` to the `useSourceControlData` destructured params (lines 134-144) and pass it through. (It arrives via `SourceControlDataProps`.)

- [ ] **Step 2: Thread through `SourceControl.tsx`**

In `src/renderer/panels/explorer/tabs/source-control/SourceControl.tsx`, add the prop to the component's props type (after line 34), destructure it (after line 58), and pass it into `useSourceControlData(...)` (line 91):

```ts
  onUpdateReviewState?: (reviewState: import('../../../../features/git/reviewState').ReviewState) => void
```
```ts
  onUpdateReviewState,
```
```ts
    onUpdateFeedbackStatus, onUpdateChecksStatus, onUpdateReviewState, repoId, scView,
```

- [ ] **Step 3: Thread through `explorer/types.ts` and `ExplorerPanel.tsx`**

In `src/renderer/panels/explorer/types.ts`, add after line 25:

```ts
  onUpdateReviewState?: (reviewState: import('../../features/git/reviewState').ReviewState) => void
```

In `src/renderer/panels/explorer/ExplorerPanel.tsx`, destructure it (near line 34) and forward it to `<SourceControl>` (near line 147):

```ts
  onUpdateReviewState,
```
```tsx
              onUpdateReviewState={onUpdateReviewState}
```

- [ ] **Step 4: Wire the store action in `usePanelsMap.tsx`**

In `src/renderer/hooks/usePanelsMap.tsx`:

- Add to `PanelsMapConfig` (after line 100) — reuse the `ReviewState` type import (add `import type { ReviewState } from '../features/git/reviewState'` at the top if not present):

```ts
  updateReviewState: (sessionId: string, reviewState: ReviewState) => void
```

- Destructure it in `useExplorerPanel` (line 111):

```ts
    updatePrState, updateFeedbackStatus, updateChecksStatus, updateReviewState, repos,
```

- Add a memoized handler next to `handleUpdateChecksStatus` (after line 135):

```ts
  const handleUpdateReviewState = useCallback((reviewState: ReviewState) => {
    if (activeSessionId) updateReviewState(activeSessionId, reviewState)
  }, [activeSessionId, updateReviewState])
```

- Pass it to `<Explorer>` (after line 156):

```tsx
        onUpdateReviewState={handleUpdateReviewState}
```

- [ ] **Step 5: Pass `updateReviewState` into `usePanelsMap` from AppContent**

In `src/renderer/App.tsx`, extend the `usePanelsMap({ ... })` call (line 307):

```ts
    updatePrState, updateFeedbackStatus, updateChecksStatus, updateReviewState,
```

(`updateReviewState` is already destructured from the store in Task 8, Step 3.)

- [ ] **Step 6: Verify**

Run: `pnpm exec tsc --noEmit`
Expected: PASS — the `onUpdateReviewState` prop resolves end-to-end. Then `pnpm exec vitest run src/renderer/panels/explorer` (existing panel tests stay green).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/panels/explorer src/renderer/hooks/usePanelsMap.tsx src/renderer/App.tsx
git commit -m "feat(source-control): derive reviewState live in the SCM panel"
```

---

### Task 10: Consume `deriveDisplayedChip` in SessionCard + SCPrBanner

Replaces the two divergent badge-selection paths with the shared function (Task 4).

**Files:**
- Modify: `src/renderer/panels/sidebar/SessionCard.tsx:14,25-33,51-70`
- Modify: `src/renderer/panels/explorer/tabs/source-control/SCPrBanner.tsx:7,69-91,103`

**Interfaces:**
- Consumes: `deriveDisplayedChip` (Task 4).

- [ ] **Step 1: Update SessionCard**

In `src/renderer/panels/sidebar/SessionCard.tsx`:

- Replace the import (line 14):

```ts
import { deriveDisplayedChip } from '../../features/git/displayedChip'
```

- Replace `StatusChipBadge` (lines 25-33) so it uses the shared selector (behavior identical: `in-progress` → `null`):

```tsx
function StatusChipBadge({ status }: { status: StatusChip }) {
  const badge = deriveDisplayedChip(status, undefined, undefined)
  if (!badge) return null
  return (
    <span className={`text-3xs px-1.5 py-0.5 rounded font-medium leading-none ${badge.classes}`}>
      {badge.label}
    </span>
  )
}
```

- [ ] **Step 2: Update SCPrBanner**

In `src/renderer/panels/explorer/tabs/source-control/SCPrBanner.tsx`:

- Update the import (line 7):

```ts
import { prStateBadge } from '../../../../features/git/explorerHelpers'
import { deriveDisplayedChip } from '../../../../features/git/displayedChip'
```

- Replace `computePrBadge` (lines 69-91) to keep the stale-terminal gate but delegate badge selection to the shared function:

```ts
function computePrBadge(
  prStatus: GitHubPrStatus,
  branchStatus: BranchStatus | undefined,
  statusChip: StatusChip | undefined,
): { badge: { label: string; classes: string }; isStale: boolean } | null {
  const hasPrMetadata = prStatus?.number && prStatus.url
  if (!hasPrMetadata) return null

  const isStaleTerminalPr =
    (prStatus.state === 'MERGED' || prStatus.state === 'CLOSED') &&
    (branchStatus === 'in-progress' || branchStatus === 'pushed')

  const badge = deriveDisplayedChip(statusChip, branchStatus, prStatus.state) ?? prStateBadge[prStatus.state]
  return { badge, isStale: isStaleTerminalPr }
}
```

(`prStateBadge` is retained only as the final safety net; `deriveDisplayedChip` already handles the `OPEN/MERGED/CLOSED` fallback.)

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit` then `pnpm exec vitest run src/renderer/panels/sidebar src/renderer/panels/explorer/tabs/source-control`
Expected: PASS. If `SCPrBanner`/`SessionCard` have existing unit tests, they should still pass (identical output for existing statuses).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/panels/sidebar/SessionCard.tsx src/renderer/panels/explorer/tabs/source-control/SCPrBanner.tsx
git commit -m "refactor(git): render session + SCM chip via shared deriveDisplayedChip"
```

---

### Task 11: Storybook stories for WAITING / APPROVED chips

**Files:**
- Modify or create: the story file co-located with `SessionCard` (`src/renderer/panels/sidebar/SessionCard.stories.tsx`) — follow the existing story pattern in that directory; if none exists there, add stories to the nearest existing sidebar story file.

**Interfaces:**
- Consumes: `Session` shape with `statusChip: 'waiting' | 'approved'`.

- [ ] **Step 1: Add stories**

Add two stories rendering a `SessionCard` (or the sidebar list) with a session whose `statusChip` is `'waiting'` and `'approved'` respectively, plus `branchStatus: 'open'`, `reviewState` set to match. Mirror the args/decorator shape of the existing stories in that file. Example story args:

```tsx
export const WaitingChip: Story = {
  args: { /* ...existing base session args..., */ statusChip: 'waiting', branchStatus: 'open', reviewState: 'waiting' },
}

export const ApprovedChip: Story = {
  args: { /* ...existing base session args..., */ statusChip: 'approved', branchStatus: 'open', reviewState: 'approved' },
}
```

- [ ] **Step 2: Screenshot + review the new stories**

Run: `pnpm storybook:build && pnpm storybook:test`
Expected: the new stories render the WAITING (muted) and APPROVED (green) chips. Review the diff report; accept the new references:

Run: `pnpm storybook:update-refs`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/panels/sidebar .storybook-refs
git commit -m "test(storybook): stories for WAITING/APPROVED chips"
```

---

### Task 12: Full verification

- [ ] **Step 1: Validate**

Invoke the `/validate` skill. It runs lint, typecheck, check:all, unit tests, coverage (90% line threshold — add tests for any new file below threshold), and E2E, fixing failures. Confirm E2E snapshots are unaffected (the `gh:prApprovalStatus` E2E mock returns neutral counts → no chip change in existing screenshots).

- [ ] **Step 2: Feature doc**

Invoke `/feature-doc waiting-status` to create the screenshot walkthrough for the new states.

- [ ] **Step 3: Code review**

Invoke `/code-review` on the changed files.

- [ ] **Step 4: PR**

Open the PR using `.github/PULL_REQUEST_TEMPLATE.md`. The `## Testing` section must contain a checked E2E item (e.g. `- [x] Ran all E2E tests locally (pnpm test:e2e)`), or CI's "PR E2E attestation" fails.

---

## Self-Review

**Spec coverage:**
- New `waiting`/`approved` states → Tasks 2, 3 (types, precedence, badges). ✓
- "no reviewer requested → open" edge → Task 1 (`computeReviewState` returns `none`) + Task 2 (`none` yields base `open`). ✓
- Per-repo `approvalPolicy` (one vs all) → Tasks 1 (derivation), 7 (type + UI), consumed in 8 & 9. ✓
- Data fetching returns structured facts, not a boolean → Task 5. ✓
- Fetch only on user action (mount/refresh/agent-finished) → Tasks 8 & 9 reuse existing triggers; no new timers. ✓
- Precedence `feedback > failed > approved > waiting > open` → Task 2 test + impl. ✓
- Chip unification (one source of truth for list + bar) → Tasks 4 (function) + 10 (both consumers). ✓
- Visuals: WAITING muted, APPROVED distinct from PR OPEN → Task 3. ✓
- Agent-activity LED untouched → no task modifies `SessionStatus` / `StatusIndicator`. ✓
- Testing (unit, storybook, validate/feature-doc/code-review) → Tasks 1-6, 10, 11, 12. ✓

**Placeholder scan:** No TBD/TODO; every code step shows real code; test tasks show real assertions. Wiring tasks (7-10) verify via `tsc --noEmit` + existing suites because their logic is exercised by the pure-function tests in Tasks 1-2 and the handler test in Task 5. ✓

**Type consistency:** `ReviewState` and `PrApprovalStatus` defined once in `reviewState.ts` (Task 1) and imported everywhere (`branchStatus.ts`, store, hooks, panel props). `computeReviewState(a, policy)`, `computeStatusChip(branchStatus, hasFeedback, checksStatus, reviewState)`, `deriveDisplayedChip(statusChip, branchStatus, prState)`, `updateReviewState(sessionId, reviewState)`, and `window.gh.prApprovalStatus(repoDir, prNumber)` are used with identical signatures across all tasks. The approval-counts shape `{ approved, pending, otherReviews }` is consistent between the handler (Task 5), the `.catch` fallbacks (Tasks 8, 9), and `PrApprovalStatus` (Task 1). ✓
