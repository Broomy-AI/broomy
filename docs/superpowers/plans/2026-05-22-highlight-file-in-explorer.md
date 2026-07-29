# Highlight Open File in Explorer Source-Control Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Highlight the currently open file (`selectedFilePath`) wherever it appears in the three Source Control views — Working, Branch, and Commits — using the same accent treatment the Files tab already applies.

**Architecture:** Pure prop-drilling, no store changes. `Explorer` already has `selectedFilePath`; pass it into `<SourceControl>`, which forwards it to each of `SCWorkingView`, `SCBranchView`, `SCCommitsView`. Each view computes per-row `isSelected = \`${directory}/${file.path}\` === selectedFilePath` and applies the same Tailwind classes `FileTree` uses: `bg-accent/20 ring-1 ring-accent/50` in place of `hover:bg-bg-tertiary`.

**Tech Stack:** React + TypeScript, Tailwind CSS, Vitest + Testing Library for unit tests, Storybook for visual regression.

**Spec:** `docs/superpowers/specs/2026-05-22-highlight-file-in-explorer-design.md`

---

### Task 1: Highlight selected file in SCBranchView

**Files:**
- Modify: `src/renderer/panels/explorer/tabs/source-control/SCBranchView.tsx`
- Modify: `src/renderer/panels/explorer/tabs/source-control/SCBranchView.test.tsx`

The Branch view is the simplest — a flat list. Do this one first to lock in the pattern.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/panels/explorer/tabs/source-control/SCBranchView.test.tsx`, inside the existing `describe('SCBranchView', ...)` block (before the closing `})`):

```tsx
  describe('selected file highlight', () => {
    it('highlights the row whose path matches selectedFilePath', () => {
      const branchChanges = [
        { path: 'src/foo.ts', status: 'M' },
        { path: 'src/bar.ts', status: 'M' },
      ]
      render(
        <SCBranchView
          {...defaultProps}
          branchChanges={branchChanges}
          selectedFilePath="/repos/project/src/bar.ts"
        />
      )
      const fooRow = screen.getByText('src/foo.ts').closest('div[class*="cursor-pointer"]') as HTMLElement
      const barRow = screen.getByText('src/bar.ts').closest('div[class*="cursor-pointer"]') as HTMLElement
      expect(barRow.className).toContain('bg-accent/20')
      expect(barRow.className).toContain('ring-accent/50')
      expect(fooRow.className).not.toContain('bg-accent/20')
    })

    it('does not highlight any row when selectedFilePath is null', () => {
      const branchChanges = [{ path: 'src/foo.ts', status: 'M' }]
      render(
        <SCBranchView
          {...defaultProps}
          branchChanges={branchChanges}
          selectedFilePath={null}
        />
      )
      const fooRow = screen.getByText('src/foo.ts').closest('div[class*="cursor-pointer"]') as HTMLElement
      expect(fooRow.className).not.toContain('bg-accent/20')
    })
  })
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm vitest run src/renderer/panels/explorer/tabs/source-control/SCBranchView.test.tsx
```

Expected: the two new tests in the `selected file highlight` describe fail. The first fails on `expect(barRow.className).toContain('bg-accent/20')` because no row has the class. Existing tests still pass.

- [ ] **Step 3: Add `selectedFilePath` prop and apply the class**

Edit `src/renderer/panels/explorer/tabs/source-control/SCBranchView.tsx`:

Replace the `SCBranchViewProps` interface with:

```tsx
interface SCBranchViewProps {
  directory: string
  branchChanges: { path: string; status: string }[]
  isBranchLoading: boolean
  branchBaseName: string
  branchMergeBase: string
  onFileSelect?: (target: NavigationTarget) => void
  selectedFilePath?: string | null
}
```

Replace the destructured params block at the start of `SCBranchView` with:

```tsx
export function SCBranchView({
  directory,
  branchChanges,
  isBranchLoading,
  branchBaseName,
  branchMergeBase,
  onFileSelect,
  selectedFilePath,
}: SCBranchViewProps) {
```

Replace the row-rendering `<div ...>` (inside `branchChanges.map`) so the `className` becomes conditional. The full replacement for the mapped row is:

```tsx
      {branchChanges.map((file) => {
        const isSelected = selectedFilePath != null && `${directory}/${file.path}` === selectedFilePath
        return (
          <div
            key={`branch-${file.path}`}
            className={`flex items-center gap-2 px-3 py-1 cursor-pointer ${isSelected ? 'bg-accent/20 ring-1 ring-accent/50' : 'hover:bg-bg-tertiary'}`}
            title={`${file.path} — ${statusLabel(file.status)}`}
            onClick={() => {
              if (onFileSelect) {
                onFileSelect({ filePath: `${directory}/${file.path}`, openInDiffMode: true, diffBaseRef: branchMergeBase || `origin/${branchBaseName}`, diffLabel: `Branch vs ${branchBaseName}` })
              }
            }}
          >
            <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
              {file.path}
            </span>
            <StatusBadge status={file.status} />
          </div>
        )
      })}
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
pnpm vitest run src/renderer/panels/explorer/tabs/source-control/SCBranchView.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/explorer/tabs/source-control/SCBranchView.tsx src/renderer/panels/explorer/tabs/source-control/SCBranchView.test.tsx
git commit -m "feat(explorer): highlight open file in branch view"
```

---

### Task 2: Highlight selected file in SCCommitsView

**Files:**
- Modify: `src/renderer/panels/explorer/tabs/source-control/SCCommitsView.tsx`
- Modify: `src/renderer/panels/explorer/tabs/source-control/SCCommitsView.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/panels/explorer/tabs/source-control/SCCommitsView.test.tsx`, inside the existing `describe('SCCommitsView', ...)` block (before the closing `})`):

```tsx
  describe('selected file highlight', () => {
    it('highlights the file row whose path matches selectedFilePath inside an expanded commit', () => {
      const commit = makeCommit({ hash: 'abc', shortHash: 'abc1234' })
      render(
        <SCCommitsView
          {...defaultProps}
          branchCommits={[commit]}
          expandedCommits={new Set(['abc'])}
          commitFilesByHash={{
            abc: [
              { path: 'src/foo.ts', status: 'M' },
              { path: 'src/bar.ts', status: 'M' },
            ],
          }}
          selectedFilePath="/repos/project/src/bar.ts"
        />
      )
      const fooRow = screen.getByText('src/foo.ts').closest('div[class*="cursor-pointer"]') as HTMLElement
      const barRow = screen.getByText('src/bar.ts').closest('div[class*="cursor-pointer"]') as HTMLElement
      expect(barRow.className).toContain('bg-accent/20')
      expect(barRow.className).toContain('ring-accent/50')
      expect(fooRow.className).not.toContain('bg-accent/20')
    })

    it('does not highlight any row when selectedFilePath is null', () => {
      const commit = makeCommit({ hash: 'abc', shortHash: 'abc1234' })
      render(
        <SCCommitsView
          {...defaultProps}
          branchCommits={[commit]}
          expandedCommits={new Set(['abc'])}
          commitFilesByHash={{ abc: [{ path: 'src/foo.ts', status: 'M' }] }}
          selectedFilePath={null}
        />
      )
      const fooRow = screen.getByText('src/foo.ts').closest('div[class*="cursor-pointer"]') as HTMLElement
      expect(fooRow.className).not.toContain('bg-accent/20')
    })
  })
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm vitest run src/renderer/panels/explorer/tabs/source-control/SCCommitsView.test.tsx
```

Expected: the two new tests fail; existing tests pass.

- [ ] **Step 3: Add `selectedFilePath` prop and apply the class**

Edit `src/renderer/panels/explorer/tabs/source-control/SCCommitsView.tsx`:

Replace the `SCCommitsViewProps` interface so it ends with `selectedFilePath?: string | null`:

```tsx
interface SCCommitsViewProps {
  directory: string
  branchCommits: GitCommitInfo[]
  isCommitsLoading: boolean
  branchBaseName: string
  expandedCommits: Set<string>
  commitFilesByHash: Record<string, { path: string; status: string }[] | undefined>
  loadingCommitFiles: Set<string>
  onToggleCommit: (commitHash: string) => void
  onFileSelect?: (target: NavigationTarget) => void
  selectedFilePath?: string | null
}
```

Replace the `CommitRow` props (the inline object type at lines ~31-40) so it adds `selectedFilePath`:

```tsx
function CommitRow({
  commit,
  directory,
  isExpanded,
  files,
  isLoadingFiles,
  muted,
  onToggleCommit,
  onFileSelect,
  selectedFilePath,
}: {
  key?: string | number | bigint | null
  commit: GitCommitInfo
  directory: string
  isExpanded: boolean
  files: { path: string; status: string }[] | undefined
  isLoadingFiles: boolean
  muted: boolean
  onToggleCommit: (hash: string) => void
  onFileSelect?: (target: NavigationTarget) => void
  selectedFilePath?: string | null
}) {
```

Inside `CommitRow`, replace the inner `files.map((file) => ...)` block with a version that computes `isSelected` and applies the class:

```tsx
            files.map((file) => {
              const isSelected = selectedFilePath != null && `${directory}/${file.path}` === selectedFilePath
              return (
                <div
                  key={`${commit.hash}-${file.path}`}
                  className={`flex items-center gap-2 px-3 py-1 pl-8 cursor-pointer ${isSelected ? 'bg-accent/20 ring-1 ring-accent/50' : 'hover:bg-bg-tertiary'}`}
                  title={`${file.path} — ${statusLabel(file.status)}`}
                  onClick={() => {
                    if (onFileSelect) {
                      onFileSelect({
                        filePath: `${directory}/${file.path}`,
                        openInDiffMode: true,
                        diffBaseRef: `${commit.hash}~1`,
                        diffCurrentRef: commit.hash,
                        diffLabel: `${commit.shortHash}: ${commit.message}`,
                      })
                    }
                  }}
                >
                  <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                    {file.path}
                  </span>
                  <StatusBadge status={file.status} />
                </div>
              )
            })
```

In `SCCommitsView`, destructure the new prop and forward it. Replace the destructured params block at the start of `SCCommitsView`:

```tsx
export function SCCommitsView({
  directory,
  branchCommits,
  isCommitsLoading,
  branchBaseName,
  expandedCommits,
  commitFilesByHash,
  loadingCommitFiles,
  onToggleCommit,
  onFileSelect,
  selectedFilePath,
}: SCCommitsViewProps) {
```

Update the `renderCommit` helper inside `SCCommitsView` to forward `selectedFilePath`:

```tsx
  const renderCommit = (commit: GitCommitInfo, muted: boolean) => (
    <CommitRow
      key={commit.hash}
      commit={commit}
      directory={directory}
      isExpanded={expandedCommits.has(commit.hash)}
      files={commitFilesByHash[commit.hash]}
      isLoadingFiles={loadingCommitFiles.has(commit.hash)}
      muted={muted}
      onToggleCommit={onToggleCommit}
      onFileSelect={onFileSelect}
      selectedFilePath={selectedFilePath}
    />
  )
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
pnpm vitest run src/renderer/panels/explorer/tabs/source-control/SCCommitsView.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/explorer/tabs/source-control/SCCommitsView.tsx src/renderer/panels/explorer/tabs/source-control/SCCommitsView.test.tsx
git commit -m "feat(explorer): highlight open file in commits view"
```

---

### Task 3: Highlight selected file in SCWorkingView

**Files:**
- Modify: `src/renderer/panels/explorer/tabs/source-control/SCWorkingView.tsx`
- Modify: `src/renderer/panels/explorer/tabs/source-control/SCWorkingView.test.tsx`

`FileListItem` is `memo`-wrapped. We add `isSelected` as a prop (computed by the parent `FileList`) so React.memo will re-render the right rows when the selection changes.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/panels/explorer/tabs/source-control/SCWorkingView.test.tsx`, inside the existing `describe('SCWorkingView', ...)` block (before the closing `})`):

```tsx
  describe('selected file highlight', () => {
    it('highlights the staged row whose path matches selectedFilePath', () => {
      const stagedFiles = [
        { path: 'src/foo.ts', status: 'M', staged: true } as const,
        { path: 'src/bar.ts', status: 'M', staged: true } as const,
      ]
      render(
        <SCWorkingView
          {...defaultProps}
          gitStatus={stagedFiles as never}
          stagedFiles={stagedFiles as never}
          selectedFilePath="/repos/project/src/bar.ts"
        />
      )
      const fooRow = screen.getByText('src/foo.ts').closest('div[class*="cursor-pointer"]') as HTMLElement
      const barRow = screen.getByText('src/bar.ts').closest('div[class*="cursor-pointer"]') as HTMLElement
      expect(barRow.className).toContain('bg-accent/20')
      expect(barRow.className).toContain('ring-accent/50')
      expect(fooRow.className).not.toContain('bg-accent/20')
    })

    it('highlights the unstaged row whose path matches selectedFilePath', () => {
      const unstagedFiles = [
        { path: 'src/baz.ts', status: 'M', staged: false } as const,
      ]
      render(
        <SCWorkingView
          {...defaultProps}
          gitStatus={unstagedFiles as never}
          unstagedFiles={unstagedFiles as never}
          selectedFilePath="/repos/project/src/baz.ts"
        />
      )
      const bazRow = screen.getByText('src/baz.ts').closest('div[class*="cursor-pointer"]') as HTMLElement
      expect(bazRow.className).toContain('bg-accent/20')
    })

    it('does not highlight any row when selectedFilePath is null', () => {
      const stagedFiles = [{ path: 'src/foo.ts', status: 'M', staged: true } as const]
      render(
        <SCWorkingView
          {...defaultProps}
          gitStatus={stagedFiles as never}
          stagedFiles={stagedFiles as never}
          selectedFilePath={null}
        />
      )
      const fooRow = screen.getByText('src/foo.ts').closest('div[class*="cursor-pointer"]') as HTMLElement
      expect(fooRow.className).not.toContain('bg-accent/20')
    })
  })
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm vitest run src/renderer/panels/explorer/tabs/source-control/SCWorkingView.test.tsx
```

Expected: the three new tests fail; existing tests pass.

- [ ] **Step 3: Add `selectedFilePath` prop and thread it through FileList → FileListItem**

Edit `src/renderer/panels/explorer/tabs/source-control/SCWorkingView.tsx`:

In the `SCWorkingViewProps` interface (lines 17-45), add `selectedFilePath?: string | null` next to `onFileSelect`:

```tsx
  onFileSelect?: (target: NavigationTarget) => void
  selectedFilePath?: string | null
```

Replace the `FileListItem` component signature and body (lines ~125-156). The change adds `isSelected` to its props and applies the conditional class:

```tsx
const FileListItem = memo(function FileListItem({ file, directory, type, isSelected, onFileSelect, onAction }: {
  file: GitFileStatus
  directory: string
  type: 'staged' | 'unstaged'
  isSelected: boolean
  onFileSelect?: (target: NavigationTarget) => void
  onAction: (filePath: string) => void
}) {
  const handleClick = useCallback(() => {
    onFileSelect?.({ filePath: `${directory}/${file.path}`, openInDiffMode: true })
  }, [file.path, directory, onFileSelect])

  const handleAction = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onAction(file.path)
  }, [file.path, onAction])

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1 cursor-pointer group ${isSelected ? 'bg-accent/20 ring-1 ring-accent/50' : 'hover:bg-bg-tertiary'}`}
      title={`${file.path} — ${statusLabel(file.status)}${type === 'staged' ? ' (staged)' : ''}`}
      onClick={handleClick}
    >
      <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>{file.path}</span>
      <StatusBadge status={file.status} />
      <button
        onClick={handleAction}
        className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary text-xs px-1"
        title={type === 'staged' ? 'Unstage' : 'Stage'}
      >{type === 'staged' ? '-' : '+'}</button>
    </div>
  )
})
```

Replace the `FileList` signature and the two `.map` blocks (lines ~158-215). Note the new `selectedFilePath` prop and the per-row computation:

```tsx
function FileList({ directory, stagedFiles, unstagedFiles, onStage, onStageAll, onUnstage, onFileSelect, selectedFilePath }: {
  directory: string
  stagedFiles: GitFileStatus[]
  unstagedFiles: GitFileStatus[]
  onStage: (filePath: string) => void
  onStageAll: () => void
  onUnstage: (filePath: string) => void
  onFileSelect?: (target: NavigationTarget) => void
  selectedFilePath?: string | null
}) {
  const isRowSelected = (path: string) =>
    selectedFilePath != null && `${directory}/${path}` === selectedFilePath

  return (
    <div className="flex-1 overflow-y-auto text-sm">
      <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
        Staged Changes ({stagedFiles.length})
      </div>
      {stagedFiles.length === 0 ? (
        <div className="px-3 py-2 text-xs text-text-secondary">No staged changes</div>
      ) : (
        stagedFiles.map((file) => (
          <FileListItem
            key={`staged-${file.path}`}
            file={file}
            directory={directory}
            type="staged"
            isSelected={isRowSelected(file.path)}
            onFileSelect={onFileSelect}
            onAction={onUnstage}
          />
        ))
      )}

      <div
        className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary mt-1 cursor-default"
        onContextMenu={async (e) => {
          e.preventDefault()
          if (unstagedFiles.length === 0) return
          const action = await window.menu.popup([{ id: 'stage-all', label: 'Stage All Changes' }])
          if (action === 'stage-all') onStageAll()
        }}
      >
        Changes ({unstagedFiles.length})
      </div>
      {unstagedFiles.length === 0 ? (
        <div className="px-3 py-2 text-xs text-text-secondary">No changes</div>
      ) : (
        unstagedFiles.map((file) => (
          <FileListItem
            key={`unstaged-${file.path}`}
            file={file}
            directory={directory}
            type="unstaged"
            isSelected={isRowSelected(file.path)}
            onFileSelect={onFileSelect}
            onAction={onStage}
          />
        ))
      )}
    </div>
  )
}
```

In the main `SCWorkingView` component, destructure `selectedFilePath` and pass it to `<FileList>`. Update the destructured params and the `<FileList ...>` JSX:

Add `selectedFilePath,` to the destructured params at the top of `SCWorkingView` (after `onFileSelect,`):

```tsx
  onFileSelect,
  selectedFilePath,
```

Update the `<FileList ...>` JSX inside the `hasChanges &&` block (~line 278) to pass `selectedFilePath`:

```tsx
      {hasChanges && (
        <FileList
          directory={directory}
          stagedFiles={stagedFiles}
          unstagedFiles={unstagedFiles}
          onStage={onStage}
          onStageAll={onStageAll}
          onUnstage={onUnstage}
          onFileSelect={onFileSelect}
          selectedFilePath={selectedFilePath}
        />
      )}
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
pnpm vitest run src/renderer/panels/explorer/tabs/source-control/SCWorkingView.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/explorer/tabs/source-control/SCWorkingView.tsx src/renderer/panels/explorer/tabs/source-control/SCWorkingView.test.tsx
git commit -m "feat(explorer): highlight open file in working view"
```

---

### Task 4: Plumb selectedFilePath through SourceControl and ExplorerPanel

**Files:**
- Modify: `src/renderer/panels/explorer/tabs/source-control/SourceControl.tsx`
- Modify: `src/renderer/panels/explorer/ExplorerPanel.tsx`
- Modify: `src/renderer/panels/explorer/tabs/source-control/SourceControl.test.tsx` (if it has a relevant case to extend; otherwise skip the test edit)

The views already work in isolation (Tasks 1–3). Now wire the live data so the active session's selected file actually highlights when the user is in the Source Control tab.

- [ ] **Step 1: Add `selectedFilePath` to `SourceControlProps` and thread it to the three sub-views**

Edit `src/renderer/panels/explorer/tabs/source-control/SourceControl.tsx`:

Add to the `SourceControlProps` interface (after `onFileSelect`):

```tsx
  onFileSelect?: (target: NavigationTarget) => void
  selectedFilePath?: string | null
```

Add `selectedFilePath,` to the destructured params at the top of `SourceControl` (after `onFileSelect,`):

```tsx
  onFileSelect,
  selectedFilePath,
```

Update each of the three sub-view JSX blocks to pass `selectedFilePath`:

In the `scView === 'commits'` block, change:

```tsx
        <SCCommitsView
          directory={directory}
          branchCommits={data.branchCommits}
          isCommitsLoading={data.isCommitsLoading}
          branchBaseName={data.branchBaseName}
          expandedCommits={data.expandedCommits}
          commitFilesByHash={data.commitFilesByHash}
          loadingCommitFiles={data.loadingCommitFiles}
          onToggleCommit={actions.handleToggleCommit}
          onFileSelect={onFileSelect}
          selectedFilePath={selectedFilePath}
        />
```

In the `scView === 'branch'` block, change:

```tsx
        <SCBranchView
          directory={directory}
          branchChanges={data.branchChanges}
          isBranchLoading={data.isBranchLoading}
          branchBaseName={data.branchBaseName}
          branchMergeBase={data.branchMergeBase}
          onFileSelect={onFileSelect}
          selectedFilePath={selectedFilePath}
        />
```

In the working-changes (default) block, change:

```tsx
      <SCWorkingView
        directory={directory}
        gitStatus={gitStatus}
        syncStatus={syncStatus}
        branchStatus={branchStatus}
        stagedFiles={data.stagedFiles}
        unstagedFiles={data.unstagedFiles}
        isMerging={syncStatus?.isMerging ?? false}
        hasConflicts={syncStatus?.hasConflicts ?? false}
        isCommitting={data.isCommitting}
        onCommitMerge={actions.handleCommitMerge}
        onStage={actions.handleStage}
        onStageAll={actions.handleStageAll}
        onUnstage={actions.handleUnstage}
        onFileSelect={onFileSelect}
        selectedFilePath={selectedFilePath}
        onSwitchTab={onSwitchTab}
        onGitStatusRefresh={onGitStatusRefresh}
        actions={commandsConfig?.actions ?? null}
        commandsLoading={commandsLoading}
        conditionState={conditionState}
        templateVars={templateVars}
        currentStage={stage}
        onSetSessionStage={(next) => activeSessionId && setSessionStage(activeSessionId, next)}
        onSetup={() => setShowSetupDialog(true)}
        agentPtyId={agentPtyId}
        agentId={agentId}
        onOpenCommandsEditor={commandsExists ? onOpenCommandsEditor : undefined}
      />
```

- [ ] **Step 2: Pass `selectedFilePath` from ExplorerPanel into SourceControl**

Edit `src/renderer/panels/explorer/ExplorerPanel.tsx`. In the `<SourceControl ...>` JSX block (around lines 134-158), add `selectedFilePath={selectedFilePath}` (placed near the other file-related props):

```tsx
          <SourceControl
            directory={directory}
            gitStatus={gitStatus}
            syncStatus={syncStatus}
            onFileSelect={onFileSelect}
            selectedFilePath={selectedFilePath}
            onGitStatusRefresh={onGitStatusRefresh}
            branchStatus={branchStatus}
            statusChip={statusChip}
            repoId={repoId}
            agentPtyId={agentPtyId}
            agentId={session?.agentId}
            onUpdatePrState={onUpdatePrState}
            onUpdateFeedbackStatus={onUpdateFeedbackStatus}
            onUpdateChecksStatus={onUpdateChecksStatus}
            issueNumber={issueNumber}
            issueTitle={issueTitle}
            issueUrl={issueUrl}
            onSwitchTab={(tab) => onFilterChange(tab as Parameters<typeof onFilterChange>[0])}
            onOpenCommandsEditor={handleOpenCommandsEditor}
            isReview={session?.sessionType === 'review'}
            reviewStatus={session?.reviewStatus}
            onRefreshReviewStatus={handleRefreshReviewStatus}
          />
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: zero TypeScript errors. If errors surface in `SourceControl.test.tsx` because the test prop set is now missing `selectedFilePath`, that's fine — the prop is optional. No edits required there.

- [ ] **Step 4: Run unit tests for the touched files**

```bash
pnpm vitest run src/renderer/panels/explorer/tabs/source-control/SourceControl.test.tsx src/renderer/panels/explorer/ExplorerPanel.test.tsx
```

Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/explorer/tabs/source-control/SourceControl.tsx src/renderer/panels/explorer/ExplorerPanel.tsx
git commit -m "feat(explorer): plumb selectedFilePath into source-control views"
```

---

### Task 5: Add Storybook variants for the selected state

**Files:**
- Modify: `src/renderer/panels/explorer/tabs/source-control/SCBranchView.stories.tsx`
- Modify: `src/renderer/panels/explorer/tabs/source-control/SCCommitsView.stories.tsx`
- Modify: `src/renderer/panels/explorer/tabs/source-control/SCWorkingView.stories.tsx`

Visual regression coverage for the new accent treatment. Each story file already exists; we add a `WithSelectedFile` (or similarly-named) export.

- [ ] **Step 1: Read the existing stories to mirror their style**

```bash
ls src/renderer/panels/explorer/tabs/source-control/SCBranchView.stories.tsx src/renderer/panels/explorer/tabs/source-control/SCCommitsView.stories.tsx src/renderer/panels/explorer/tabs/source-control/SCWorkingView.stories.tsx
```

Use the Read tool on each to copy an existing story export's shape (e.g., `WithChanges`). The new story should be a copy with `selectedFilePath` set to one of the file paths in the args.

- [ ] **Step 2: Add a `WithSelectedFile` story to each file**

In `SCBranchView.stories.tsx`, add at the bottom:

```tsx
export const WithSelectedFile: Story = {
  args: {
    ...WithChanges.args,
    selectedFilePath: `${WithChanges.args!.directory}/${(WithChanges.args!.branchChanges as { path: string; status: string }[])[0].path}`,
  },
}
```

(Adjust if the existing reference story has a different name — match what is actually in the file.)

Do the analogous addition in `SCCommitsView.stories.tsx`. The selected file should be inside an expanded commit's file list — pick a path from `commitFilesByHash`.

Do the analogous addition in `SCWorkingView.stories.tsx`. The selected file should be one of the entries in `stagedFiles` or `unstagedFiles`.

- [ ] **Step 3: Run Storybook visual regression and refresh refs**

```bash
pnpm storybook:test
```

Expected: three new story screenshots are produced and (since there is no reference yet) flagged as new in the report. Open `.storybook-report/index.html` to confirm the highlighted row looks correct in each story. If correct, accept:

```bash
pnpm storybook:update-refs
```

- [ ] **Step 4: Re-run Storybook test to confirm clean diff**

```bash
pnpm storybook:test
```

Expected: zero diffs.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/explorer/tabs/source-control/SCBranchView.stories.tsx src/renderer/panels/explorer/tabs/source-control/SCCommitsView.stories.tsx src/renderer/panels/explorer/tabs/source-control/SCWorkingView.stories.tsx .storybook-refs/
git commit -m "test(explorer): visual regression for selected-file highlight in source-control views"
```

---

### Task 6: Validate, feature-doc, code-review

**Files:**
- Creates: `docs/features/highlight-file-in-explorer/...` (via `/feature-doc`)

- [ ] **Step 1: Run the full validation**

Invoke the project skill:

```
/validate
```

Expected: lint, typecheck, `check:all`, unit tests, coverage, and E2E all pass. If anything fails, fix it before continuing. (Do not run individual checks by hand — `/validate` runs them in the right order and handles fix loops.)

- [ ] **Step 2: Create the screenshot walkthrough**

```
/feature-doc highlight-file-in-explorer
```

Expected: a feature walkthrough is created under `docs/features/highlight-file-in-explorer/` showing the highlight in each source-control view.

- [ ] **Step 3: Run code review on the diff**

```
/code-review
```

Expected: no high-severity findings. Address any reported issues, re-run `/validate`, then continue.

- [ ] **Step 4: Commit anything `/feature-doc` produced**

```bash
git add docs/features/highlight-file-in-explorer
git commit -m "docs: screenshot walkthrough for highlight-file-in-explorer"
```

(If `/feature-doc` produced no files because none were needed, skip this step.)
