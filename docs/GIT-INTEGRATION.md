# Git & GitHub Integration Guide

Broomy's git integration is split across two process boundaries: the main process performs
all git operations via `simple-git` and the GitHub CLI (`gh`), while the renderer process
consumes results through IPC and derives UI state from the raw data.

## Git Operations via IPC

The renderer never touches git directly. Every git operation goes through the preload
bridge (`window.git.*` and `window.gh.*`), which maps to `ipcMain.handle()` calls in
`src/main/index.ts`. Each handler:

1. Checks `isE2ETest` and returns mock data if true
2. Creates a `simpleGit(repoPath)` instance
3. Performs the operation
4. Returns a result object or throws

Example flow for fetching branch status:

```
Renderer                    Preload                     Main
  |                           |                           |
  |-- window.git.status() -->|-- ipcRenderer.invoke() -->|
  |                           |                           |-- simpleGit(path)
  |                           |                           |-- git.status(['-uall'])
  |                           |                           |-- parse files
  |<-- normalized result ----|<-- { files, ahead, ... } -|
```

## simple-git Usage in Main Process

The main process uses the `simple-git` library. Each handler creates a fresh instance
scoped to the repository path:

```ts
ipcMain.handle('git:status', async (_event, repoPath: string) => {
  if (isE2ETest) { /* return mock */ }

  const git = simpleGit(repoPath)
  const status = await git.status(['-uall'])

  const files = []
  for (const file of status.files) {
    const indexStatus = file.index || ' '
    const workingDirStatus = file.working_dir || ' '
    // Split into staged/unstaged entries
    if (hasIndexChange) {
      files.push({ path: file.path, status: statusFromChar(indexStatus), staged: true, ... })
    }
    if (hasWorkingDirChange) {
      files.push({ path: file.path, status: statusFromChar(workingDirStatus), staged: false, ... })
    }
  }

  return { files, ahead: status.ahead, behind: status.behind, tracking: status.tracking, current: status.current }
})
```

### Available Git Handlers

| Handler | Description |
|---------|-------------|
| `git:getBranch` | Current branch name |
| `git:isGitRepo` | Check if directory is a git repo |
| `git:status` | Full status with staged/unstaged files, ahead/behind counts |
| `git:stage` | Stage a single file |
| `git:stageAll` | Stage all changes |
| `git:unstage` | Unstage a file |
| `git:checkoutFile` | Discard changes to a file |
| `git:commit` | Commit staged changes |
| `git:push` | Push to remote |
| `git:pull` | Pull from remote |
| `git:diff` | Get diff for a file or all files |
| `git:show` | Show file content at a specific ref |
| `git:clone` | Clone a repository |
| `git:worktreeAdd` | Create a git worktree |
| `git:worktreeList` | List worktrees |
| `git:pushNewBranch` | Push with `--set-upstream origin` |
| `git:defaultBranch` | Detect the default branch (main/master) |
| `git:remoteUrl` | Get origin remote URL |
| `git:headCommit` | Get HEAD commit hash |
| `git:listBranches` | List local and remote branches |
| `git:fetchBranch` | Fetch a specific branch |
| `git:fetchPrHead` | Fetch PR head ref |
| `git:isMergedInto` | Check if current branch is merged into a ref |
| `git:hasBranchCommits` | Check if branch has commits ahead of a ref |
| `git:pullOriginMain` | Pull and merge default branch |
| `git:isBehindMain` | Check how many commits behind default branch |
| `git:branchChanges` | Files changed on branch vs base |
| `git:branchCommits` | Commits on branch since diverging from base |
| `git:commitFiles` | Files changed in a specific commit |
| `git:getConfig` | Read a git config value |
| `git:setConfig` | Set a git config value |

## Git Status: Fetch, Parse, Display

### Fetching

`App.tsx` polls `window.git.status()` every 2 seconds for the active session:

```ts
useEffect(() => {
  if (activeSession) {
    fetchGitStatus()
    const interval = setInterval(fetchGitStatus, 2000)
    return () => clearInterval(interval)
  }
}, [activeSession?.id, fetchGitStatus])
```

This is polling **local git data**, which is safe and fast. The 2-second interval keeps
the UI responsive to changes made by the agent in the terminal.

### Parsing

The main process splits each file into staged and unstaged entries using character codes
from `git status --porcelain`. The parser lives in `src/main/gitStatusParser.ts`:

```ts
export function statusFromChar(c: string): string {
  switch (c) {
    case 'M': return 'modified'
    case 'A': return 'added'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case '?': return 'untracked'
    default: return 'modified'
  }
}

export function parseGitStatusFile(file): GitFileEntry[] {
  // A file with both index and working dir changes produces TWO entries:
  // one staged, one unstaged
}
```

### Normalizing

The renderer normalizes the status response for compatibility with both old (flat array)
and new (object with metadata) formats via `src/renderer/utils/gitStatusNormalizer.ts`:

```ts
export function normalizeGitStatus(status: unknown): GitStatusResult {
  if (status && typeof status === 'object' && 'files' in status) {
    // New format: { files, ahead, behind, tracking, current }
    return { files: s.files, ahead: s.ahead ?? 0, ... }
  }
  if (Array.isArray(status)) {
    // Old format: flat array
    return { files: status, ahead: 0, behind: 0, tracking: null, current: null }
  }
  return { files: [], ahead: 0, behind: 0, tracking: null, current: null }
}
```

### Displaying

`src/renderer/utils/explorerHelpers.ts` provides display helpers:

```ts
export function statusLabel(status: string): string    // 'modified' -> 'Modified'
export function getStatusColor(status?: string): string // 'modified' -> 'text-yellow-400'
export function statusBadgeLetter(status: string): string // 'modified' -> 'M'
export function splitStagedFiles<T>(files: T[]): { staged: T[]; unstaged: T[] }
```

The Explorer component uses these to render file badges and organize files into staged
and unstaged groups in the source control view.

## Branch Tracking and Ahead/Behind Counts

The `git:status` handler returns `ahead`, `behind`, `tracking`, and `current` from
simple-git. These values drive:

- **Sync button state**: Shows ahead/behind counts, enables push/pull
- **Branch status computation**: Used to determine if work is in-progress, pushed, etc.

The branch status is computed by `src/renderer/utils/branchStatus.ts`:

```ts
export function computeBranchStatus(input: BranchStatusInput): BranchStatus {
  if (isOnMainBranch) return 'in-progress'
  if (uncommittedFiles > 0 || ahead > 0) return 'in-progress'
  if (isMergedToMain && hasHadCommits && hasTrackingBranch) return 'merged'
  if (isMergedToMain && !hasHadCommits && hasTrackingBranch) return 'empty'
  if (lastKnownPrState === 'MERGED') return 'merged'
  if (lastKnownPrState === 'CLOSED') return 'closed'
  if (lastKnownPrState === 'OPEN') return 'open'
  if (hasTrackingBranch) return 'pushed'
  return 'in-progress'
}
```

The possible states are: `in-progress`, `pushed`, `empty`, `open`, `merged`, `closed`.
This status is displayed as a badge in the source control panel.

## PR State Persistence

PR state is stored in the session config as `lastKnownPrState`, `lastKnownPrNumber`, and
`lastKnownPrUrl`. This allows the app to show PR status (open, merged, closed) without
re-fetching from GitHub on every load.

PR state is refreshed only when:
- The user clicks the refresh button in the source control view
- The user opens the source control panel

```ts
// In App.tsx
const refreshPrStatus = useCallback(async () => {
  for (const session of sessions) {
    const prResult = await window.gh.prStatus(session.directory)
    if (prResult) {
      updatePrState(session.id, prResult.state, prResult.number, prResult.url)
    } else {
      updatePrState(session.id, null)
    }
  }
}, [sessions, updatePrState])
```

## The "No Polling" Rule

**Never poll the GitHub API on a timer.** This is a core design principle. GitHub API
calls (`gh` CLI wrappers) are only triggered by explicit user action:

- Clicking a refresh button
- Opening the source control view
- Creating a PR
- Pushing changes

Local git operations (status, branch detection, merge checks) are safe to poll because
they are fast filesystem reads. The 2-second git status poll is fine. But `gh:prStatus`,
`gh:issues`, `gh:prComments`, etc. must never be called on an interval.

## Deriving State from Local Git Data

Where possible, state is derived from local git data rather than API calls:

- **Branch merged?** Use `git:isMergedInto` (compares revlists locally) rather than
  checking the GitHub PR state
- **Has commits?** Use `git:hasBranchCommits` (counts commits ahead of merge-base)
- **Ahead/behind?** Use `git status` tracking info
- **Default branch?** Use `git symbolic-ref refs/remotes/origin/HEAD` first, fall back
  to trying `main` then `master`

This keeps the app responsive even without network access.

## File Watcher Integration

The Explorer panel uses file watchers to auto-refresh the file tree when files change on
disk. File watching is managed through IPC:

```ts
// Start watching
await window.fs.watch(id, directoryPath)

// Listen for changes
const unsubscribe = window.fs.onChange(id, ({ eventType, filename }) => {
  // Refresh the file tree
})

// Stop watching
await window.fs.unwatch(id)
```

In the main process, `fs:watch` uses Node's `fs.watch()` and sends change events to the
renderer via `webContents.send()`:

```ts
ipcMain.handle('fs:watch', async (_event, id, dirPath) => {
  const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
    ownerWindow.webContents.send(`fs:change:${id}`, { eventType, filename })
  })
  fileWatchers.set(id, watcher)
})
```

File watchers are namespaced by ID and tracked per-window. They are cleaned up when the
window closes.

## The Review Panel and Diff Viewing

`src/renderer/components/ReviewPanel.tsx` manages AI-powered code reviews. It:

1. Reads branch changes via `git:branchChanges`
2. Generates a review prompt and sends it to the agent terminal
3. Watches for the resulting `review.json` file
4. Displays findings organized by severity (info, warning, concern)
5. Tracks which requested changes have been addressed across review iterations

Review findings link to specific file locations. Clicking a finding opens the file in the
diff viewer (`FileViewer` component) with the relevant line highlighted:

```ts
onSelectFile={(filePath, openInDiffMode, scrollToLine, diffBaseRef) => {
  navigateToFile(filePath, openInDiffMode, scrollToLine, undefined, diffBaseRef)
}}
```

The diff viewer shows the file content at the merge-base ref compared to the current
working tree, using the `git:show` handler to fetch historical file content.

## GitHub CLI (gh) Wrappers

GitHub operations use the `gh` CLI tool. The main process wraps `gh` commands via
`execSync`:

| Handler | Description |
|---------|-------------|
| `gh:isInstalled` | Check if `gh` CLI is available |
| `gh:issues` | List open issues for the repo |
| `gh:repoSlug` | Get `owner/repo` slug |
| `gh:prStatus` | Get PR status for current branch |
| `gh:hasWriteAccess` | Check if user has write permissions |
| `gh:mergeBranchToMain` | Merge current branch into default branch |
| `gh:getPrCreateUrl` | Build a GitHub PR creation URL |
| `gh:prComments` | Fetch review comments on a PR |
| `gh:replyToComment` | Reply to a PR review comment |
| `gh:prsToReview` | List PRs assigned for review |
| `gh:submitDraftReview` | Submit a draft review with comments |

The `gh:getPrCreateUrl` handler builds a properly encoded GitHub URL for PR creation:

```ts
// From src/main/gitStatusParser.ts
export function buildPrCreateUrl(repoSlug, defaultBranch, currentBranch): string {
  return `https://github.com/${repoSlug}/compare/${
    encodeURIComponent(defaultBranch)
  }...${
    encodeURIComponent(currentBranch)
  }?expand=1`
}
```

All `gh:*` handlers return mock data when `E2E_TEST` is set, so tests never hit the
real GitHub API.
