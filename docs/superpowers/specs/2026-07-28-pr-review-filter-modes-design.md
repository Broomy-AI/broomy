# PR Review Filter Modes

The "PRs to Review" view in the new-session flow lists only PRs where a review has
been requested from the user or from any team the user belongs to. This spec adds
two more modes — personally-requested-only, and all open PRs — selectable from the
view and remembered per repo.

## Filter modes

Three modes, each a different `gh` invocation. `team` reproduces today's behavior
and stays the default.

| Mode | Label | `gh` arguments |
|---|---|---|
| `team` | Team | `pr list --search review-requested:@me` |
| `mine` | Mine | `pr list --search user-review-requested:@me` |
| `all` | All | `pr list` |

`review-requested:@me` matches both direct requests and requests routed through a
team the user belongs to. `user-review-requested:@me` is GitHub's qualifier for
direct requests only. Plain `pr list` defaults to open PRs, which is what `all`
means here — open PRs, not every PR ever filed.

## Main process

`gh:prsToReview` takes a second parameter, `mode: PrReviewFilterMode`, defaulting
to `'team'`. Only the `--search` argument varies by mode; the `--json` field list,
`--limit`, timeout, and the response-mapping code are unchanged.

The E2E mock returns the same two fixture PRs for every mode, plus one additional
PR in `all` mode, so an E2E test can assert that switching modes actually changed
the query rather than re-rendering the same list.

## Preload

`prsToReview(repoDir, mode?)`. `PrReviewFilterMode = 'team' | 'mine' | 'all'` is
exported from `src/preload/apis/types.ts` alongside the other shared types.

## Renderer

`ReviewPrsView` holds a `mode` state initialized from `repo.prReviewFilter ?? 'team'`.

- **Segmented tabs** render as a pill row beneath the header title: Team · Mine · All.
- **Switching modes** persists via `useRepoStore().updateRepo(repo.id, { prReviewFilter: mode })`
  and refetches — `mode` joins the fetch effect's dependencies.
- **Loading and errors** behave as they do today; the spinner shows on every switch.
- **Empty state** is mode-specific: "No PRs pending your review." (team) /
  "No PRs personally assigned to you." (mine) / "No open PRs." (all).
- **Header subtitle** tracks the active mode instead of the fixed "Requested for review".
- **Keyboard focus** resets to the first row when the list changes.

## Persistence

`ManagedRepo` gains `prReviewFilter?: PrReviewFilterMode`. The field is optional, so
existing config files load unchanged and an absent value means `team`. It saves
through the existing `updateRepo` → debounced-config-save path — no new IPC handler
and no settings-panel control.

## Testing

- `ghComments.test.ts`: assert the exact `gh` argument vector for each of the three
  modes, and that omitting the parameter yields the `team` arguments.
- `ReviewPrsView.test.tsx`: tabs render; clicking a tab refetches with that mode;
  the mode persists through `updateRepo`; initial mode comes from `repo.prReviewFilter`;
  each empty-state string appears for its mode.
- `gh.test.ts`: the preload API forwards the mode.
- Stories covering each mode's header and tab state.
- Then `/validate`, `/feature-doc`, `/code-review`.

## Out of scope

- **Per-mode caching.** Every switch refetches. Switching is an explicit user
  action, so this stays within the project's no-polling rule for the GitHub API.
- **A settings-panel control for the default mode.** The per-repo memory of the
  last-used mode covers the need without another settings surface.
