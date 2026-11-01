# New Session

Multi-step dialog for creating new agent sessions. The dialog is a view-based state machine that guides the user through selecting a repository, choosing a branch or issue, and picking an agent to run.

## How It Connects

The dialog is opened from the sidebar's new-session button in `SessionList.tsx`. It calls preload APIs (`window.git`, `window.gh`, `window.fs`) to list repos, branches, and issues. On completion, it calls the `onComplete` callback with a directory, agent ID, and optional metadata (issue, PR, repo), which the session store uses to create a new session.

## Files

| File | Description |
|------|-------------|
| `index.tsx` | Root dialog component with view-based routing and Escape key navigation. |
| `types.ts` | View union type, `NewSessionDialogProps`, and `BranchInfo` type definitions. |
| `HomeView.tsx` | Landing view listing managed repos with options to clone, add, or select a repo. With 6+ repos a filter box in the header narrows the list: `/` focuses it, Enter returns to the single-key shortcuts with the filter kept, Escape clears it first. The filter resets when a sub-view returns home. |
| `RepoFilterInput.tsx` | The home view's filter box (with its `/` hint and clear button) and the screen-reader status text. |
| `useRepoFilter.ts` | Filter state for the home view: query, visible repos, and the height lock that stops the dialog shrinking while you type. |
| `CloneView.tsx` | Git clone form: URL input, directory picker, and clone progress. |
| `AddExistingRepoView.tsx` | Directory picker for adding an existing local repo to managed repos. |
| `NewBranchView.tsx` | Create a new branch from the default branch, optionally linked to a GitHub issue. |
| `ExistingBranchView.tsx` | Select an existing branch or worktree to start a session on. |
| `IssuesView.tsx` | GitHub issues list for the selected repo, with search and selection. |
| `ReviewPrsView.tsx` | Open pull requests list for starting a review session. |
| `RepoSettingsView.tsx` | Per-repo settings: rename, change directory, remove from managed repos. |
| `AgentPickerView.tsx` | Final step: select which AI agent to launch for the new session. |
| `HomeView.test.tsx` | Unit tests for home view. |
| `CloneView.test.tsx` | Unit tests for clone view. |
| `AddExistingRepoView.test.tsx` | Unit tests for add existing repo view. |
| `NewBranchView.test.tsx` | Unit tests for new branch view. |
| `ExistingBranchView.test.tsx` | Unit tests for existing branch view. |
| `IssuesView.test.tsx` | Unit tests for issues view. |
| `ReviewPrsView.test.tsx` | Unit tests for review PRs view. |
| `RepoSettingsView.test.tsx` | Unit tests for repo settings view. |
| `AgentPickerView.test.tsx` | Unit tests for agent picker view. |
| `NewSessionFlow.test.tsx` | Integration tests for the full new session flow. |
