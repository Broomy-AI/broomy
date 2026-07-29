# Template variables: registry, picker modal, and session-init surfaces

## Summary

Command templates in `commands.json` support four hardcoded substitution variables
(`{main}`, `{branch}`, `{directory}`, `{issueNumber}`). They are undiscoverable — the only
mention in the UI is a hint string under the Command field — and the set is far narrower
than the data already sitting on the session (PR number, PR title, PR URL, issue title,
issue URL, repo, stage). Nothing outside `commands.json` can use them at all: the agent
command and the per-repo init script are literal text.

This design:

- **Adds a variable registry** — one ordered list that is the single source of truth for the
  parser, the substituter, the context builder, the env exporter, and the UI. Expands the set
  from 4 variables to 14.
- **Extends variables to three more surfaces** — the agent command, agent env values, and the
  per-repo init script.
- **Adds a picker modal** — searchable, grouped, showing each variable's description and its
  current live value. Clicking inserts it. Shared by every surface.

## Current state

| Concern | Location | Today |
|---|---|---|
| Which names are reserved | `features/commands/templateParser.ts:1` | `RESERVED_CONTEXT_VARS` — a hardcoded `Set` of 4 strings |
| Substitution | `features/commands/templateSubstitute.ts` | Four hardcoded `.replace(/\{name\}/g, …)` calls |
| Context shape | `templateSubstitute.ts` — `SubContext` | Four required string fields |
| Context construction | `panels/explorer/tabs/source-control/SourceControl.tsx:148` | Hand-rolled `useMemo` |
| Context construction | `panels/explorer/tabs/review/ReviewPanel.tsx:386` | A second, independent hand-rolled `useMemo` |
| Discoverability | `panels/fileViewer/CommandsEditor.tsx:346` | A hint string: "Use {name} for args" |
| Agent command | `AgentData.command`, spawned by `panels/agent/Terminal.tsx` | Literal text |
| Repo init script | `~/.broomy/profiles/<id>/init-scripts/<repoId>.sh`, run via `window.shell.exec` | Literal text |

Reserved names do double duty: `parseTemplate` skips them when collecting user-prompted args,
so a reserved name is auto-filled from context instead of prompting the user.

## Two syntaxes, chosen by injection risk

| Target | Syntax | Why |
|---|---|---|
| `commands.json` templates | `{name}` | Existing syntax; the resolved string becomes an agent prompt |
| Agent env values | `{name}` | Values are passed literally to spawn, never parsed by a shell |
| Agent command | `$BROOMY_NAME` | It is a command line handed to a shell |
| Repo init script | `$BROOMY_NAME` | It is a shell script |

**Textual substitution into a shell is the thing to avoid.** `{prTitle}` and `{issueTitle}`
carry GitHub-controlled text. Splicing an issue titled ``fix `rm -rf ~` handling`` into a
command line yields command substitution. Passing it as an environment variable makes it inert
data, and the user's own quoting (`"$BROOMY_ISSUE_TITLE"`) decides how it is read.

Env values take the `{name}` form because `$BROOMY_BRANCH` would not work there — env values are
handed to `spawn` without shell expansion — and they are safe precisely because of that.

**Out of scope:** shell-form action templates in `commands.json` (`!git checkout {branch}`,
dispatched at `actionExecutor.ts:47`) have this same hazard today. This design does not widen it
— the new variables become available there along with everything else — but it does not fix it
either. Worth a separate issue.

## Design

### 1. Variable registry — `features/commands/templateVars.ts` (new)

An ordered array of definitions:

```ts
export type TemplateVarSurface = 'command' | 'agent' | 'init'

export interface TemplateVarDef {
  name: string            // e.g. 'prTitle'
  envName: string         // e.g. 'BROOMY_PR_TITLE' — derived, upper-snake with prefix
  group: TemplateVarGroup
  description: string     // one line, shown in the picker
  unavailableAt?: TemplateVarSurface[]  // surfaces where this can never have a value
  get: (input: TemplateVarInput) => string
}
```

`RESERVED_CONTEXT_VARS`, the substitution map, the env map, and the picker's rows all derive
from this array. Adding a variable is a one-entry change.

`templateParser.ts` re-exports `RESERVED_CONTEXT_VARS` from here so existing importers keep
working, and its hardcoded `Set` is deleted.

### 2. The variables

| Group | Variable | Env name | Source | New |
|---|---|---|---|---|
| Repo | `{directory}` | `BROOMY_DIRECTORY` | session working directory | |
| Repo | `{folderName}` | `BROOMY_FOLDER_NAME` | basename of `{directory}` | ✅ |
| Repo | `{repoRoot}` | `BROOMY_REPO_ROOT` | `ManagedRepo.rootDir` | ✅ |
| Repo | `{repoName}` | `BROOMY_REPO_NAME` | `ManagedRepo.name` | ✅ |
| Branch | `{branch}` | `BROOMY_BRANCH` | `syncStatus.current`, falling back to `Session.branch` | |
| Branch | `{main}` | `BROOMY_MAIN` | base branch (see note) | |
| Pull request | `{prNumber}` | `BROOMY_PR_NUMBER` | `Session.prNumber` | ✅ |
| Pull request | `{prTitle}` | `BROOMY_PR_TITLE` | `Session.prTitle` | ✅ |
| Pull request | `{prUrl}` | `BROOMY_PR_URL` | `Session.prUrl` | ✅ |
| Issue | `{issueNumber}` | `BROOMY_ISSUE_NUMBER` | `Session.issueNumber` | |
| Issue | `{issueTitle}` | `BROOMY_ISSUE_TITLE` | `Session.issueTitle` | ✅ |
| Issue | `{issueUrl}` | `BROOMY_ISSUE_URL` | `Session.issueUrl` | ✅ |
| Session | `{sessionName}` | `BROOMY_SESSION_NAME` | `Session.name` | ✅ |
| Session | `{stage}` | `BROOMY_STAGE` | `Session.stage` | ✅ |

Every value is a string. A variable with no value at runtime — no PR on the branch, no linked
issue — resolves to the empty string, matching how `{issueNumber}` behaves today. Env vars are
exported even when empty, so `${BROOMY_PR_NUMBER:-none}` works in a script.

**No `{prBaseBranch}`.** It would carry the same value `{main}` already carries: ReviewPanel
computes `main` as `session.prBaseBranch || 'main'`, SourceControl as `data.branchBaseName || 'main'`.
A second name for one value is a trap.

### 3. Shared builder

Two functions in `templateVars.ts`, both walking the registry:

```ts
buildTemplateVars(input: TemplateVarInput): SubContext          // { branch: 'x', … }
buildTemplateEnv(input: TemplateVarInput, surface): Record<string, string>  // { BROOMY_BRANCH: 'x', … }
```

```ts
export interface TemplateVarInput {
  session?: Session
  repo?: ManagedRepo
  syncStatus?: GitStatusResult | null
  directory: string
  branchBaseName?: string
  issue?: { number?: number; title?: string; url?: string }
}
```

Every field is optional except `directory`, because the init-script call sites run **before the
session exists** — they hold a repo, a worktree path, a branch name, and possibly an issue, but
`onComplete` has not yet fired (`NewBranchView.tsx:130`). `buildTemplateEnv` omits variables
listed in `unavailableAt` for that surface.

`SourceControl.tsx` and `ReviewPanel.tsx` replace their hand-rolled `useMemo` objects with
`buildTemplateVars`. New variables then reach both surfaces automatically.

`SubContext` widens from four fixed fields to `Record<string, string>`. Its two consumers —
`substituteTemplate`, and `actionExecutor.ts:84` which writes the context to
`.broomy/output/context.json` — are agnostic to the key set; the JSON file just gains keys.
Substitution replaces the four hardcoded `.replace` calls with a loop over the map. Context
variables are still substituted before user args, and a user arg whose name collides with a
registry name still never reaches substitution because `parseTemplate` excludes reserved names.

### 4. Surface: agent command and env

`Terminal.tsx` builds the PTY env for the agent terminal today and passes it to `pty:create`,
which already accepts `env` (`src/preload/apis/pty.ts:15`). Two changes there:

- Merge `buildTemplateEnv(input, 'agent')` into the env map, so `$BROOMY_*` is available to the
  agent command line and to the agent process itself.
- Run `substituteTemplate` over each configured `AgentData.env` **value** before merging, so
  `MY_VAR={branch}` resolves. Broomy's own `BROOMY_*` keys win on collision.

The agent command string itself is passed through unchanged — the shell expands `$BROOMY_*`.

At spawn time the session exists, so every variable can carry a value. On a freshly created
session there is no PR yet, so the PR variables are usually empty; that is a footer note in the
picker, not a hard `unavailableAt`, because a resumed session does have them.

### 5. Surface: repo init script

Five call sites run the script today, each an identical six-line block: `useBackgroundInit.ts:87`
and `:137`, `NewBranchView.tsx:125`, `ExistingBranchView.tsx:86`, `ReviewPrsView.tsx:58`.

They collapse into one helper — `runRepoInitScript(repo, worktreePath, varInput)` in
`features/sessions/` — that fetches the script, builds the env, execs, and swallows failures
exactly as the current call sites do. Removing the duplication is what makes the variables a
one-line change rather than a five-site change.

Plumbing for the env:

- `shell:exec` (`src/main/handlers/shell.ts:218`) gains an optional `env` parameter, merged over
  `process.env` into the `exec` options.
- The preload signature follows (`src/preload/apis/shell.ts:11` and `:71`).

Both are additive, so no existing `shell.exec` caller changes.

`unavailableAt: ['init']` covers `prNumber`, `prTitle`, `prUrl`, `sessionName`, and `stage` — the
script runs before the session object exists and before any PR does. Those are omitted from the
init env and dimmed in the picker with a reason. What does populate: branch, directory, folder
name, repo name, repo root, main, and the issue variables when the session came from an issue.

### 6. Picker modal — `shared/components/TemplateVarsModal.tsx` (new)

A dialog, taking a `surface` prop and a `TemplateVarInput`:

- Search box at the top, filtering on name, env name, and description.
- Rows grouped by section, in registry order, with group headings.
- Each row: the variable in the surface's syntax (`{branch}` or `$BROOMY_BRANCH`), its
  description, and its **current live value** on the right — dimmed `—` when empty.
- Variables listed in `unavailableAt` for this surface render dimmed and non-insertable, with a
  short reason ("not set when the init script runs").
- Clicking a row inserts at the cursor and closes. `Escape` and a backdrop click close without
  inserting.

It lives in `shared/components/` rather than under `panels/fileViewer/` because three different
panels use it. Live values come from `buildTemplateVars`, so the picker and the runtime cannot
disagree.

### 7. Insertion points

A `{} Vars` button opens the picker from five places:

| Surface | Location | Inserts |
|---|---|---|
| `command` | `Field` action slot beside `⤢ Expand` (`CommandsEditor.tsx:351`) | `{name}` |
| `command` | `CommandExpandedEditor` footer | `{name}` |
| `agent` | Agent Settings command field (`AgentSettingsAgentTab.tsx:138` and `:281` — the add and edit forms) | `$BROOMY_NAME` |
| `agent` | `EnvVarEditor` value inputs | `{name}` |
| `init` | Repo Settings init script textarea (`RepoSettingsEditor.tsx:165`) | `$BROOMY_NAME` |

Each holds a ref to its input/textarea. Insertion splices at `selectionStart`/`selectionEnd`,
calls the existing `onChange`, then restores focus with the caret after the inserted text.
Appending to the end is the fallback when there is no recorded selection.

Repo Settings has no session in scope, so its picker shows names and descriptions with all live
values dimmed. That is honest: at the moment you are editing the script, there is no value.

## Behavior change

A user's existing command that uses one of the eight new names as a prompted arg — say
`/summarize {prTitle}` — stops prompting for it and starts auto-filling from context, and that
row disappears from the editor's Args table.

This is the intended semantics, so it ships without a migration or compatibility shim.
Collisions are unlikely: these names describe session state, which is exactly what a user was
working around by prompting for them.

Nothing changes for existing agent commands or init scripts. Both gain env vars they can ignore.

## Testing

- **`templateVars.test.ts`** — every entry resolves; missing session data yields empty strings;
  `buildTemplateVars` returns a key per entry; `buildTemplateEnv` omits `unavailableAt` entries
  for the given surface; names and env names are unique and valid identifiers.
- **`templateSubstitute.test.ts`** — extended for the new variables, empty-value substitution,
  and existing arg-precedence rules under the widened `SubContext`.
- **`templateParser.test.ts`** — new names are reserved and excluded from parsed args.
- **`TemplateVarsModal.test.tsx`** — grouped rows render; search filters; per-surface syntax is
  correct; `unavailableAt` rows are dimmed and do not insert.
- **`CommandsEditor.test.tsx`** — insertion lands at the caret, not the end, in both the inline
  field and the expanded editor.
- **`RepoSettingsEditor.test.tsx`** / **`AgentSettingsAgentTab.test.tsx`** — the picker opens and
  inserts the `$BROOMY_` form.
- **`runRepoInitScript` test** — builds the right env, execs with it, and stays non-fatal on
  failure.
- **`shell.ts` handler test** — the `env` parameter reaches `exec`; omitting it is unchanged.
- **`TemplateVarsModal.stories.tsx`** — one story per surface, for visual regression.

E2E mocks: `shell:exec` and `pty:create` already return mock data under `isE2ETest`; the added
parameter needs no new mock.

## Verification

1. Run `/validate` (lint, typecheck, check:all, unit tests, coverage, E2E)
2. Run `/feature-doc template-vars` for the screenshot walkthrough
3. Run `/code-review` on the changed files
