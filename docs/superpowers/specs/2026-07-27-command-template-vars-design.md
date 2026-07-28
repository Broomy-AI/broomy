# Command template variables: registry + picker modal

## Summary

Command templates in `commands.json` support four hardcoded substitution variables
(`{main}`, `{branch}`, `{directory}`, `{issueNumber}`). They are undiscoverable — the
only mention in the UI is a hint string under the Command field — and the set is far
narrower than the data already sitting on the session (PR number, PR title, PR URL,
issue title, issue URL, repo, stage).

This design does two things:

- **Adds a variable registry** — one ordered list of variable definitions that is the
  single source of truth for the parser, the substituter, the context builder, and the
  UI. Expands the set from 4 variables to 14.
- **Adds a picker modal to the command editor** — searchable, grouped, showing each
  variable's description and its current live value. Clicking a variable inserts it at
  the cursor.

## Current state

| Concern | Location | Today |
|---|---|---|
| Which names are reserved | `features/commands/templateParser.ts:1` | `RESERVED_CONTEXT_VARS` — a hardcoded `Set` of 4 strings |
| Substitution | `features/commands/templateSubstitute.ts` | Four hardcoded `.replace(/\{name\}/g, …)` calls |
| Context shape | `templateSubstitute.ts` — `SubContext` | Four required string fields |
| Context construction | `panels/explorer/tabs/source-control/SourceControl.tsx:148` | Hand-rolled `useMemo` |
| Context construction | `panels/explorer/tabs/review/ReviewPanel.tsx:386` | A second, independent hand-rolled `useMemo` |
| Discoverability | `panels/fileViewer/CommandsEditor.tsx:346` | A hint string: "Use {name} for args" |

Reserved names do double duty: `parseTemplate` skips them when collecting user-prompted
args, so a reserved name is auto-filled from context instead of prompting the user.

## Design

### 1. Variable registry — `features/commands/templateVars.ts` (new)

An ordered array of definitions:

```ts
export interface TemplateVarDef {
  name: string          // e.g. 'prTitle'
  group: TemplateVarGroup
  description: string   // one line, shown in the picker
  get: (input: TemplateVarInput) => string
}
```

`RESERVED_CONTEXT_VARS`, the substitution map, and the picker's rows all derive from this
array. Adding a variable is a one-entry change with no other edits.

`templateParser.ts` re-exports `RESERVED_CONTEXT_VARS` from here so existing importers keep
working, and the hardcoded `Set` is deleted.

### 2. The variables

| Group | Variable | Source | New |
|---|---|---|---|
| Repo | `{directory}` | session working directory | |
| Repo | `{folderName}` | basename of `{directory}` | ✅ |
| Repo | `{repoRoot}` | `ManagedRepo.rootDir` | ✅ |
| Repo | `{repoName}` | `ManagedRepo.name` | ✅ |
| Branch | `{branch}` | `syncStatus.current` | |
| Branch | `{main}` | base branch (see note) | |
| Pull request | `{prNumber}` | `Session.prNumber` | ✅ |
| Pull request | `{prTitle}` | `Session.prTitle` | ✅ |
| Pull request | `{prUrl}` | `Session.prUrl` | ✅ |
| Issue | `{issueNumber}` | `Session.issueNumber` | |
| Issue | `{issueTitle}` | `Session.issueTitle` | ✅ |
| Issue | `{issueUrl}` | `Session.issueUrl` | ✅ |
| Session | `{sessionName}` | `Session.name` | ✅ |
| Session | `{stage}` | `Session.stage` | ✅ |

Every value is a string. A variable with no value at runtime — no PR on the branch, no
linked issue — substitutes to the empty string, matching how `{issueNumber}` behaves today.

**No `{prBaseBranch}`.** It would carry the same value `{main}` already carries: ReviewPanel
computes `main` as `session.prBaseBranch || 'main'`, and SourceControl computes it as
`data.branchBaseName || 'main'`. A second name for one value is a trap, not a feature.

### 3. Shared context builder

`buildTemplateVars(input: TemplateVarInput): SubContext` lives in `templateVars.ts` and walks
the registry, calling each definition's `get`.

```ts
export interface TemplateVarInput {
  session?: Session
  repo?: ManagedRepo
  syncStatus?: GitStatusResult | null
  directory: string
  branchBaseName?: string
}
```

`SourceControl.tsx` and `ReviewPanel.tsx` each replace their hand-rolled `useMemo` object
with a call to this function. New variables then reach both surfaces automatically.

`SubContext` widens from four fixed fields to `Record<string, string>`. Its two existing
consumers (`substituteTemplate`, and `actionExecutor.ts:84` which writes the context to
`.broomy/output/context.json`) are agnostic to the key set — the JSON file just gains
the new keys.

Substitution replaces the four hardcoded `.replace` calls with a loop over the context map.
Ordering matters: context variables are substituted before user args, and a user arg whose
name collides with a registry name never reaches substitution because `parseTemplate`
excludes reserved names. That precedence is unchanged.

### 4. Picker modal — `panels/fileViewer/TemplateVarsModal.tsx` (new)

A dialog over the command editor:

- Search box at the top, filtering on variable name and description.
- Rows grouped by section, in registry order, with group headings.
- Each row: `{name}` in mono, its description, and its **current live value** on the right —
  dimmed `—` when the active session has no value for it.
- Clicking a row inserts `{name}` at the cursor in the command field and closes the modal.
- `Escape` and a backdrop click close without inserting.

Live values come from `buildTemplateVars` against the active session, so the picker and the
runtime can never disagree about what a variable resolves to.

The command editor is opened per-session (`Session.commandsEditorDirectory`), so the active
session and its repo are read from `useSessionStore` / `useRepoStore`. No git calls: `{branch}`
falls back to `Session.branch` when no `syncStatus` is at hand.

### 5. Insertion points

A `{} Vars` button opens the picker from two places:

- **Inline command field** — in the `Field` component's existing `action` slot, next to the
  current `⤢ Expand` button (`CommandsEditor.tsx:351`).
- **Expanded editor** — in `CommandExpandedEditor`'s footer, replacing part of the hint text.

Both hold a ref to their input/textarea. Insertion splices `{name}` at
`selectionStart`/`selectionEnd`, calls the existing `onChange`, then restores focus with the
caret after the inserted text. Appending to the end is the fallback when there is no
recorded selection.

## Behavior change

A user's existing command that uses one of the eight new names as a prompted arg — say
`/summarize {prTitle}` — stops prompting for it and starts auto-filling from context, and
that row disappears from the editor's Args table.

This is the intended semantics and what a user would want, so it ships without a migration
or a compatibility shim. Collisions are unlikely: these names describe session state, which
is exactly what the user was working around by prompting for them.

## Testing

- **`templateVars.test.ts`** — every registry entry resolves; missing session data yields
  empty strings; `buildTemplateVars` returns a key for every registry entry; registry names
  are unique and valid identifiers.
- **`templateSubstitute.test.ts`** — extended to cover the new variables, empty-value
  substitution, and the existing arg-precedence rules under the widened `SubContext`.
- **`templateParser.test.ts`** — the new names are treated as reserved and excluded from
  parsed args.
- **`TemplateVarsModal.test.tsx`** — renders grouped rows; search filters; clicking a row
  emits the right insertion.
- **`CommandsEditor.test.tsx`** — clicking a variable inserts at the caret in the inline
  field and in the expanded editor, not just at the end.
- **`TemplateVarsModal.stories.tsx`** — a story for visual regression.

## Verification

1. Run `/validate` (lint, typecheck, check:all, unit tests, coverage, E2E)
2. Run `/feature-doc command-template-vars` for the screenshot walkthrough
3. Run `/code-review` on the changed files
