# Command Skills Redesign — Design Spec

**Date:** 2026-05-18
**Branch:** `feature/command-skills`
**Status:** Design approved; ready for implementation planning.

## Background

Broomy renders a list of action buttons in the source-control panel today. The buttons are defined by `<repo>/.broomy/commands.json` and fall back to a hard-coded default set (`defaultCommands.json`) when the file is absent. Each action is either a shell command or an agent prompt, with per-agent prompt variants for `claude` / `aider` / `cursor` / `codex` / `gemini`. Visibility is gated by a flat set of git/PR state booleans (`showWhen`).

This design reworks the system around three observations:

1. **Slash commands and skills are now the primary way users invoke reusable workflows** in the agents Broomy targets (Claude Code, Codex, Gemini). The action buttons should be a one-line shortcut to those, not a place to author multi-paragraph prompts.
2. **Commands belong to the user, not the repo.** A developer's command preferences travel with them across repos and depend on which plugins they have installed; storing the canonical list in each repo creates churn and forces a one-size-fits-all default.
3. **A simple state machine** ("stage") layered on top of git-state conditions lets command packs express multi-step skill workflows (brainstorm → plan → build → verify) without re-inventing condition syntax.

## Goals

- Move primary command storage to `~/.broomy/commands.json` with an optional additive `<repo>/.broomy/commands.json`.
- Remove the built-in default fallback. Users must pick a pack (or start blank) before buttons appear.
- Default to slash-command, one-line templates in the editor; allow legacy multi-line "text block" prompts.
- Support arguments via `{name}` placeholders in the template, including optional flag-groups (`--flag {name}`).
- Add a session-level `stage` field that gates command visibility and is mutated by commands themselves.
- Drop per-agent prompt variants. One template per command.
- Surface the slash-command form on each button as a subtitle; show a `description` on hover.
- Ship three starter packs: **Basics**, **Superpowers**, **gstack**.

## Non-goals

- Pack discovery from a remote registry — packs are bundled in the app binary in v1.
- Per-agent dispatch differences beyond the existing PTY-vs-Agent-SDK split. Removing per-agent prompt variants is deliberate.
- Cross-tab drag in the editor (move-between-user-and-project) — covered by a right-click action instead.
- Stage transitions that persist on shell exit codes beyond 0/non-0, or that reflect agent task completion. Agent commands set stage on send.

## High-level architecture

```
~/.broomy/commands.json          ──┐
                                   ├── merge (concat) ──> effective actions ──> visibility filter ──> buttons
<repo>/.broomy/commands.json     ──┘                                                     ▲                ▲
                                                                                         │                │
                                                          ConditionState (git/PR/etc.) ──┘                │
                                                          session.stage                  ────────────────-┘
```

- Loaders run in the renderer (existing pattern). Both files are watched; either changing re-renders the button list.
- The effective list is the user file's `actions` followed by the project file's `actions`, in order. ID collisions are kept (no override).
- Each action passes the visibility filter if surface matches AND `evaluateShowWhen(showWhen)` is true AND `(action.stages == null || action.stages.includes(session.stage))`.

## File layout & storage

### `~/.broomy/commands.json` (user, primary)

Lives in the same directory used today for app config (`CONFIG_DIR` in `src/main/handlers/types.ts`). Created on first run by the setup picker; the file watcher in `useCommandsConfig` already supports any path.

### `<repo>/.broomy/commands.json` (project, optional)

Same path as today. Existing files load without migration — they become "project" entries. The legacy "create default commands.json in repo" path is removed; the in-editor "Add project commands" CTA writes an empty actions array (or copies the user file as a starting point — TBD in implementation, see open questions below).

### Schema

```ts
interface CommandsConfig {
  version: 2                       // bumped from 1
  actions: ActionDefinition[]
}

interface ActionDefinition {
  id: string
  label: string                    // friendly name shown on button
  description?: string             // tooltip on hover, shown as help in arg dialog
  template: string                 // one-line slash command OR multi-line legacy prompt

  // Triggering
  showWhen?: string[]              // condition tokens (existing system, AND semantics)
  stages?: string[]                // current session.stage must be in this list (omit = any)
  setStage?: string | null         // stage to write after running (null = "new")

  // Args metadata, auto-maintained by editor based on {placeholders} in template
  args?: ArgSpec[]

  // Visual
  style?: 'primary' | 'secondary' | 'accent' | 'danger'

  // Surface routing (unchanged from today)
  surface?: string | string[]
  switchTab?: string
}

interface ArgSpec {
  name: string                     // matches a {name} in the template
  description?: string             // help text shown in arg dialog
  default?: string                 // prefilled value
}
```

**Removed from current schema:** `type`, `prompt`, `command`, `agents`.

**Reserved context variables** (auto-filled from session/git state, never prompt the user):

- `{main}` — repo default branch
- `{branch}` — current branch
- `{directory}` — working directory
- `{issueNumber}` — linked GitHub issue, empty string if none

Any other `{name}` in `template` is treated as a user-supplied argument.

**Optional flag-groups:** If the template contains `--flag {name}` (or `-x {name}`) — that is, a `--`/`-` flag immediately preceding a `{placeholder}` — the arg is treated as optional. In the dialog it renders as a toggleable checkbox; when off, the flag and its placeholder are stripped from the resolved command before substitution.

**Dispatch (no schema field):**

- Resolved template starting with `!` → strip the `!`, run via `window.shell.exec`.
- Otherwise → send to agent (PTY paste or Agent SDK depending on connection mode).

### Migration on load

A loader sees `version: 1` files and migrates in memory:

- `prompt` (when `type === 'agent'`) → `template`.
- `command` (when `type === 'shell'`) → `template`, prefixed with `!`.
- `agents` overrides dropped silently.
- `type` field dropped.

Migrated files are not rewritten until the user saves them in the editor. On save the file is written with `version: 2`.

## Stage state machine

### Storage

A new field on `Session`:

```ts
stage: string  // default "new", persisted with the rest of the session
```

Lives in the existing session config and uses the existing debounced save path (no separate file, no per-branch storage).

### Visibility rule

```
visible =
  matchesSurface(action.surface, currentSurface)
  AND evaluateShowWhen(action.showWhen, conditionState)
  AND (action.stages == null || action.stages.includes(session.stage))
```

`stages: undefined` means "any stage" — fully backwards compatible with stage-unaware actions like the Basics pack.

### Transitions

After a successful execution:

- Shell commands: `setStage` applied iff exit code is 0 (matching today's `onGitStatusRefresh` rule).
- Agent commands: `setStage` applied on successful send (PTY paste returned, or Agent SDK accepted the message). We do not wait for the agent to finish — the user can correct via the pill if needed.
- `setStage: null` writes `"new"`. Omitted `setStage` leaves stage unchanged.

### UI: the stage pill

Rendered at the top of the action-button block in any surface that uses commands.

- Hidden iff no action in the effective list references `stages` or `setStage`. Users on the Basics pack will never see it.
- Visible state: `Stage: planning  ⌄`.
- Click opens a popover with the **discovered stage set**: the union of all `setStage` values and all values in any `stages: [...]` array across the effective actions, plus `"new"` always, plus the current value if not otherwise listed.
- Sorted alphabetically with `"new"` pinned to the top.
- Selecting an item writes `session.stage` directly. This is the canonical reset/override path; there is no separate "clear" button.

## Editor UI

A two-column editor in the file viewer panel.

```
┌──────────────────────────────────────────────────────────────────────┐
│ [User (~/.broomy)] [Project (.broomy/)]              [Save] [●]      │
├──────────────────────────────────┬───────────────────────────────────┤
│ ▸ ☰ Plan feature         ●       │ Label:        [Plan feature   ]   │
│   /plan                          │ Description:  [Brainstorm a…  ]   │
│ ┄ ☰ Commit with AI               │ Command:                          │
│   /commit                        │   [/plan {topic} --depth {depth}] │
│ ┄ ☰ Sync branch                  │   ▾ Arguments (2 detected)        │
│   /sync                          │   ┌─ name ── desc ── default ──┐  │
│ ┄ ☰ Resolve conflicts            │   │ topic   …      …           │  │
│   resolve.md (text block)        │   │ depth   …      …  optional │  │
│ ┄ ☰ Get AI review                │   └────────────────────────────┘  │
│   /review                        │ Show when:  [conditions picker]   │
│ + Add command                    │ Stages:     [chips: planning, …]  │
│                                  │ Set stage:  [(no change) ▾]       │
│                                  │ Style:      [secondary ▾]         │
│                                  │ Surface:    [source-control ▾]    │
│                                  │ Switch tab: [(none) ▾]            │
│                                  │ [Switch to text-block mode]       │
│                                  │ [Delete]                          │
└──────────────────────────────────┴───────────────────────────────────┘
```

### Header

- Tabs switch which file is loaded into the editor:
  - **User** edits `~/.broomy/commands.json`.
  - **Project** edits `<repo>/.broomy/commands.json`.
- Each tab has its own dirty state. Switching tabs while either is dirty prompts: "Save changes to User commands?" (Save / Discard / Cancel).
- Save button persists the currently visible tab.
- The Project tab with no file shows a single "Add project commands" CTA in the right pane.

### Left column (~280 px)

- One row per action: drag handle, label (top), slash-subtitle (bottom; first whitespace-delimited token of `template` iff it starts with `/`; otherwise "text block").
- Unsaved rows show a leading dot.
- Selected row has accent stripe + filled background.
- "+ Add command" pinned at the bottom of the list creates a new row with `id = action-<timestamp>`, selects it, and focuses the Label field.
- Drag-to-reorder updates the `actions` array order.

### Right column

When a row is selected, the field stack shown above. When nothing is selected, a hint: "Select a command to edit, or click + Add command".

**Command field modes:**

- **One-line mode** (default for new commands; auto-detected when `template` has no newline): single-line input. Args table appears below, auto-derived.
- **Text-block mode** (auto-detected when `template` contains a newline): multi-line textarea, args table hidden.
- A button below the field toggles modes. Switching one-line → text-block keeps the existing content; switching text-block → one-line is only enabled if the current content has no newlines.
- Mode is *not* a stored field — it's purely a UI affordance derived from the content.

**Arguments table:**

- Rows auto-added as `{name}` placeholders are typed into the template, auto-removed when removed.
- Per-row fields: name (read-only), description, default.
- Args inside a `--flag {name}` group get an "optional" badge.
- Args inside the template but not in `args[]` get a row with empty description/default (so the user can fill them in).
- Reserved context vars are not surfaced in the table.

**Reordering & deletion:**

- Drag handles in the left list reorder.
- "Delete" in the right pane removes the selected row with a two-step confirm.

**Right-click on a row (left list):**

- "Duplicate" — copies the action into the same list with a new id.
- "Move to user / Move to project" — moves between files. Saves both files immediately to avoid mid-state ambiguity.

## Setup flow & packs

### When the CTA appears

If neither `~/.broomy/commands.json` nor `<repo>/.broomy/commands.json` exists, the action-button area renders a single full-width **"Set up commands"** button. The existing source-control setup banner is removed; the in-panel CTA replaces it.

A secondary text link below the button: "Or start with an empty config →" opens the editor with an empty user-side and an unsaved blank action.

### The picker modal

```
┌─ Set up commands ────────────────────────────────────────────────┐
│ Pick a starter set. You can edit anything afterwards.            │
│                                                                  │
│ ┌─ Basics ──────────────┐ ┌─ Superpowers ──┐ ┌─ gstack ────────┐ │
│ │ Cross-agent           │ │ Brainstorm,    │ │ Stack-based git │ │
│ │ git workflows.        │ │ plan, build,   │ │ workflows.      │ │
│ │ Works on Claude Code, │ │ verify, debug. │ │ 6 commands      │ │
│ │ Codex, Gemini.        │ │ 8 commands     │ │                 │ │
│ │ 6 commands            │ │                │ │                 │ │
│ └───────────────────────┘ └────────────────┘ └─────────────────┘ │
│                                                                  │
│ Installs to ~/.broomy/commands.json                              │
│                                                                  │
│                       [Cancel]  [Install]                        │
└──────────────────────────────────────────────────────────────────┘
```

- Cards are ordered Basics → Superpowers → gstack. Basics is recommended (first, with a "Recommended" tag).
- Selecting a card highlights it; "Install" writes the pack's `actions` to `~/.broomy/commands.json` and closes.
- The pack `id` is *not* persisted — once installed, the file is just commands.
- If `~/.broomy/commands.json` already exists when setup is re-triggered (e.g. from a future "reset" affordance), prompt: "Replace existing user commands?" with Replace / Cancel. No merge.

### Pack format

Bundled JSON files at `src/renderer/features/commands/packs/<id>.json`:

```json
{
  "id": "basics",
  "name": "Basics",
  "description": "Cross-agent git workflows. Works on Claude Code, Codex, Gemini.",
  "version": 2,
  "actions": [ ... ]
}
```

A `packs/index.ts` exports the list. Adding a new pack = drop a JSON file and add it to the index. No remote fetch in v1.

### Basics pack (v1)

Designed for the lowest common denominator across Claude Code, Codex, and Gemini. Pure condition-based — no stages — so the stage pill stays hidden.

| Label | template | showWhen | style |
|---|---|---|---|
| Commit | `Commit the current changes with a clear message. Don't commit any files that contain secrets.` | `has-changes`, `!merging` | primary |
| Resolve conflicts | `Resolve the current merge conflicts. Ask before guessing on anything ambiguous.` | `conflicts` | danger |
| Sync | `Pull the latest from {main} into this branch and fix any conflicts.` | `behind-main`, `!on-main`, `!merging` | primary |
| Push branch | `!git push -u origin HEAD` | `clean`, `no-tracking`, `!on-main` | primary |
| Create PR | `Create a PR for this branch against {main}.` | `no-pr`, `!on-main`, `!empty`, `!conflicts` | primary |
| Review | `/review` | `clean`, `pushed\|open` | accent |

Workflow is PR-only: commit → sync → push → create PR → review. Merging happens in GitHub. No `/security-review`, no `/init`, no per-agent variants.

### Superpowers pack (v1)

A starter set covering the main superpowers slash commands (`/brainstorm`, `/plan`, `/verify`, `/debug`, `/review-feedback`, `/finish-branch`, etc.). Uses `stages` and `setStage` to express the brainstorm → planning → implementing → verifying flow. Exact action list is an implementation detail tracked in the plan; spec commits to ~6–10 entries and at least one example each of: arg use, optional flag-group, and a `setStage` transition.

### gstack pack (v1)

Same shape: friendly buttons mapping to gstack's core commands (`/stack`, `/submit`, `/restack`, `/sync`, `/diff`, `/checkout`). Implementation detail.

## Action button rendering

The existing `ActionButtons` component, with three changes:

1. **Stage pill** at the top of the block (Section "Stage state machine" above).
2. **Two-line button content**: label on top, slash-subtitle below in smaller, dimmed text. Subtitle is the first whitespace-delimited token of `template` iff it starts with `/`; otherwise no subtitle. `description` shown as a native `title=` tooltip on hover.
3. **No `defaultCommands.json` fallback.** When `actions` is null or empty after merge, the whole block renders the "Set up commands" CTA instead.

The `edit commands` link remains in the corner and opens the editor (User tab selected if user file exists, Project tab otherwise).

## Argument dialog

Triggered when a clicked action's `template` references any non-reserved `{name}` placeholders. The dialog parses the template directly to determine which slots to render; `args[]` is only consulted to look up per-arg `description` and `default`. This means an action authored or imported without `args[]` populated still prompts correctly — `args[]` is metadata, not the source of truth for which slots exist.

```
┌─ Plan feature ─────────────────────────┐
│ Brainstorm and write a design spec     │
│                                        │
│ Topic *                                │
│ [_______________________________]      │
│ The thing you want to plan             │
│                                        │
│ ☐ --depth                              │
│ [_______________________________]      │
│ How deep to go                         │
│                                        │
│ Resolved: /plan auth-refactor          │
│                                        │
│           [Cancel]  [Run]              │
└────────────────────────────────────────┘
```

- One field per arg, in template order.
- Required args (bare `{name}`) always shown; missing values disable Run.
- Optional flag-group args (`--flag {name}`) rendered behind a checkbox toggling the whole group.
- Per-arg `description` shown as help text below the field.
- A live, read-only "Resolved" preview at the bottom shows exactly the string Broomy will send.
- Last-used arg values remembered in renderer memory only (cleared on app restart and session switch).
- Enter on last field = Run; Esc = Cancel.

After a successful Run, `setStage` is applied per the rules in the stage section.

## ConditionState changes

Existing condition tokens are unchanged. The `no-pr` token (currently true when no PR exists or PR is merged/closed) keeps its current meaning. No new condition tokens are required by this design; stages live in a separate dimension.

## Removed / deprecated surface

- `defaultCommands.json` is no longer imported anywhere. The file can stay in the tree as reference for migration but is dead code; remove in cleanup.
- `getDefaultCommandsConfig()` is removed.
- `CommandsSetupBanner` (in source-control) is removed; the in-panel "Set up commands" CTA replaces it.
- `CommandsSetupDialog` is rewritten as the pack picker.
- `PromptVariants` component and the `agents` field in actions are removed.
- The `type`-field UI in `CommandsEditor` is removed.
- The legacy `.broomy` gitignore helpers (`checkLegacyBroomyGitignore`, `removeLegacyBroomyGitignore`) keep their behavior since project-level `.broomy/commands.json` still exists for users who opt into it.

## Testing strategy

- **Unit tests** for the loader (user-only, project-only, both, neither, version 1 → 2 migration, malformed JSON, malformed schema), the template parser (extract args, detect flag-groups, leave context vars alone), the substitution (with and without optional flag-groups), the stage discovery (union, sort, "new" pinning), and the visibility filter (stage + showWhen + surface combinations).
- **Component tests** for the editor (tab switching with dirty state, args table auto-population, mode switching, drag-to-reorder, +Add command), the arg dialog (required validation, optional toggle behavior, live resolved preview), and the action button block (stage pill visibility, two-line button content, setup CTA fallback).
- **Storybook stories** for: empty state (no files), user-only, both files, each pack picker card, the arg dialog (no args, one required, one required + one optional, all optional), the stage pill (hidden, visible with one stage, visible with many).
- **E2E** smoke flows: first-run setup → install Basics → click Commit → button disappears (clean state); install Superpowers → click /brainstorm → stage transitions visible in pill.

## Verification

1. Run `/validate` (covers lint, typecheck, check:all, unit tests, coverage, E2E).
2. Run `/feature-doc command-skills` to create or update the screenshot walkthrough.
3. Run `/code-review` on changed files.

## Open questions deferred to implementation

- "Add project commands" CTA in the editor: blank actions array, or copy the user file as a starting point? Leaning toward blank — additive semantics are clearer.
- Exact action list for the Superpowers and gstack packs. Spec commits to ~6–10 entries each; the curated list is implementation work.
- Whether to surface "reset to pack" in the editor (e.g. an overflow menu item). Not required for v1.
