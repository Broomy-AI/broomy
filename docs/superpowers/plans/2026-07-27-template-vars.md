# Template Variables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand command template variables from 4 to 14, make them available in the agent command, agent env, and per-repo init script, and add a searchable picker modal so they are discoverable.

**Architecture:** One registry array in `features/commands/templateVars.ts` is the single source of truth. Two builders walk it: `buildTemplateVars` produces a `{name: value}` map for `{}` substitution, `buildTemplateEnv` produces a `BROOMY_*` map for shell surfaces. A single `TemplateVarsModal` renders the registry for any surface. Shell targets get env vars (injection-safe); data targets get `{}` substitution.

**Tech Stack:** TypeScript, React, Zustand, Vitest, Testing Library, Storybook, Electron IPC.

Spec: `docs/superpowers/specs/2026-07-27-command-template-vars-design.md`

## Global Constraints

- Package manager is **pnpm**. Never npm or yarn.
- Never use `${}`, `$(...)`, or shell parameter expansion in Bash tool calls.
- Do not run tests manually — use `/validate`, which runs everything in order.
- Unit tests are co-located with source (`src/**/*.test.ts`). 90% line coverage threshold.
- Every new IPC parameter must be handled under `isE2ETest` in the main handler.
- Stories are co-located as `*.stories.tsx`; reference images live in `.storybook-refs/`.
- Two syntaxes, by target: `{name}` for data targets (commands.json templates, agent env values), `$BROOMY_NAME` for shell targets (agent command, repo init script).
- Every variable resolves to a string; missing data yields `''`, never `undefined`.

---

### Task 1: Variable registry and builders

**Files:**
- Create: `src/renderer/features/commands/templateVars.ts`
- Create: `src/renderer/features/commands/templateVars.test.ts`
- Modify: `src/renderer/features/commands/templateParser.ts:1` (delete the hardcoded Set, re-export)

**Interfaces:**
- Consumes: `Session` from `store/sessions`, `ManagedRepo` from `preload/index`, `GitStatusResult` from `preload/index`
- Produces: `TEMPLATE_VARS: TemplateVarDef[]`, `RESERVED_CONTEXT_VARS: Set<string>`, `buildTemplateVars(input): Record<string, string>`, `buildTemplateEnv(input, surface): Record<string, string>`, types `TemplateVarDef`, `TemplateVarInput`, `TemplateVarSurface`, `TemplateVarGroup`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/features/commands/templateVars.test.ts
import { describe, it, expect } from 'vitest'
import { TEMPLATE_VARS, RESERVED_CONTEXT_VARS, buildTemplateVars, buildTemplateEnv } from './templateVars'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'

const repo = { id: 'r1', name: 'broomy', remoteUrl: '', rootDir: '/repos/broomy', defaultBranch: 'main' } as ManagedRepo
const session = {
  id: 's1', name: 'Fix login', directory: '/repos/broomy/wt/fix-login', branch: 'fix/login',
  stage: 'coding', prNumber: 42, prTitle: 'Fix login', prUrl: 'https://gh/pr/42',
  issueNumber: 7, issueTitle: 'Login broken', issueUrl: 'https://gh/i/7',
} as Session

describe('registry', () => {
  it('has unique names and env names', () => {
    expect(new Set(TEMPLATE_VARS.map(v => v.name)).size).toBe(TEMPLATE_VARS.length)
    expect(new Set(TEMPLATE_VARS.map(v => v.envName)).size).toBe(TEMPLATE_VARS.length)
  })

  it('uses valid identifiers and BROOMY_-prefixed env names', () => {
    for (const v of TEMPLATE_VARS) {
      expect(v.name).toMatch(/^[A-Za-z_][\w]*$/)
      expect(v.envName).toMatch(/^BROOMY_[A-Z0-9_]+$/)
      expect(v.description.length).toBeGreaterThan(0)
    }
  })

  it('reserves every registry name', () => {
    expect(RESERVED_CONTEXT_VARS).toEqual(new Set(TEMPLATE_VARS.map(v => v.name)))
  })
})

describe('buildTemplateVars', () => {
  it('resolves every variable from a full session', () => {
    const vars = buildTemplateVars({ session, repo, directory: session.directory, branchBaseName: 'main' })
    expect(vars).toEqual({
      directory: '/repos/broomy/wt/fix-login',
      folderName: 'fix-login',
      repoRoot: '/repos/broomy',
      repoName: 'broomy',
      branch: 'fix/login',
      main: 'main',
      prNumber: '42',
      prTitle: 'Fix login',
      prUrl: 'https://gh/pr/42',
      issueNumber: '7',
      issueTitle: 'Login broken',
      issueUrl: 'https://gh/i/7',
      sessionName: 'Fix login',
      stage: 'coding',
    })
  })

  it('returns a key for every registry entry even with no data', () => {
    const vars = buildTemplateVars({ directory: '' })
    expect(Object.keys(vars).sort()).toEqual(TEMPLATE_VARS.map(v => v.name).sort())
    expect(Object.values(vars).every(v => v === '' || v === 'main')).toBe(true)
  })

  it('prefers syncStatus branch over the session branch', () => {
    const vars = buildTemplateVars({
      session, repo, directory: session.directory,
      syncStatus: { current: 'other/branch' } as never,
    })
    expect(vars.branch).toBe('other/branch')
  })

  it('takes issue values from the loose issue input when there is no session', () => {
    const vars = buildTemplateVars({
      repo, directory: '/repos/broomy/wt/new',
      issue: { number: 9, title: 'New thing', url: 'https://gh/i/9' },
    })
    expect(vars.issueNumber).toBe('9')
    expect(vars.issueTitle).toBe('New thing')
    expect(vars.sessionName).toBe('')
  })
})

describe('buildTemplateEnv', () => {
  it('maps every variable to its BROOMY_ name for the command surface', () => {
    const env = buildTemplateEnv({ session, repo, directory: session.directory }, 'command')
    expect(env.BROOMY_BRANCH).toBe('fix/login')
    expect(env.BROOMY_PR_NUMBER).toBe('42')
    expect(Object.keys(env)).toHaveLength(TEMPLATE_VARS.length)
  })

  it('omits variables unavailable at the init surface', () => {
    const env = buildTemplateEnv({ session, repo, directory: session.directory }, 'init')
    expect(env.BROOMY_PR_NUMBER).toBeUndefined()
    expect(env.BROOMY_PR_TITLE).toBeUndefined()
    expect(env.BROOMY_PR_URL).toBeUndefined()
    expect(env.BROOMY_SESSION_NAME).toBeUndefined()
    expect(env.BROOMY_STAGE).toBeUndefined()
    expect(env.BROOMY_BRANCH).toBe('fix/login')
    expect(env.BROOMY_ISSUE_TITLE).toBe('Login broken')
  })

  it('exports empty strings rather than omitting keys with no value', () => {
    const env = buildTemplateEnv({ directory: '/x' }, 'agent')
    expect(env.BROOMY_PR_NUMBER).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/features/commands/templateVars.test.ts`
Expected: FAIL — cannot resolve `./templateVars`.

- [ ] **Step 3: Write the registry**

```ts
// src/renderer/features/commands/templateVars.ts
/**
 * Single source of truth for command template variables.
 *
 * Every consumer derives from TEMPLATE_VARS: the parser's reserved-name set,
 * {name} substitution, BROOMY_* env export, and the picker modal. Adding a
 * variable is a one-entry change here.
 *
 * Two syntaxes, chosen by target. Data targets (commands.json templates, agent
 * env values) use {name}. Shell targets (agent command, repo init script) use
 * $BROOMY_NAME, because PR and issue titles carry GitHub-controlled text and
 * splicing that into a command line is a shell injection.
 */
import type { Session } from '../../store/sessions'
import type { ManagedRepo, GitStatusResult } from '../../../preload/index'

export type TemplateVarSurface = 'command' | 'agent' | 'init'
export type TemplateVarGroup = 'Repo' | 'Branch' | 'Pull request' | 'Issue' | 'Session'

export interface TemplateVarInput {
  session?: Session
  repo?: ManagedRepo
  syncStatus?: GitStatusResult | null
  directory: string
  branchBaseName?: string
  /** Issue data for call sites that run before the session exists. */
  issue?: { number?: number; title?: string; url?: string }
}

export interface TemplateVarDef {
  name: string
  envName: string
  group: TemplateVarGroup
  description: string
  /** Surfaces where this can never carry a value, with the reason shown in the picker. */
  unavailableAt?: TemplateVarSurface[]
  get: (input: TemplateVarInput) => string
}

/** Init scripts run before the session object exists and before any PR does. */
const NOT_AT_INIT: TemplateVarSurface[] = ['init']

function str(v: string | number | undefined | null): string {
  return v === undefined || v === null ? '' : String(v)
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx === -1 ? trimmed : trimmed.slice(idx + 1)
}

export const TEMPLATE_VARS: TemplateVarDef[] = [
  {
    name: 'directory', envName: 'BROOMY_DIRECTORY', group: 'Repo',
    description: 'Working directory of the session',
    get: i => i.directory,
  },
  {
    name: 'folderName', envName: 'BROOMY_FOLDER_NAME', group: 'Repo',
    description: 'Name of the working directory, without its path',
    get: i => basename(i.directory),
  },
  {
    name: 'repoRoot', envName: 'BROOMY_REPO_ROOT', group: 'Repo',
    description: 'Root directory of the repository',
    get: i => str(i.repo?.rootDir),
  },
  {
    name: 'repoName', envName: 'BROOMY_REPO_NAME', group: 'Repo',
    description: 'Name of the repository',
    get: i => str(i.repo?.name),
  },
  {
    name: 'branch', envName: 'BROOMY_BRANCH', group: 'Branch',
    description: 'Current branch',
    get: i => i.syncStatus?.current ?? str(i.session?.branch),
  },
  {
    name: 'main', envName: 'BROOMY_MAIN', group: 'Branch',
    description: 'Base branch this work merges into',
    get: i => i.branchBaseName || i.session?.prBaseBranch || i.repo?.defaultBranch || 'main',
  },
  {
    name: 'prNumber', envName: 'BROOMY_PR_NUMBER', group: 'Pull request',
    description: 'Number of the pull request for this branch',
    unavailableAt: NOT_AT_INIT,
    get: i => str(i.session?.prNumber),
  },
  {
    name: 'prTitle', envName: 'BROOMY_PR_TITLE', group: 'Pull request',
    description: 'Title of the pull request',
    unavailableAt: NOT_AT_INIT,
    get: i => str(i.session?.prTitle),
  },
  {
    name: 'prUrl', envName: 'BROOMY_PR_URL', group: 'Pull request',
    description: 'URL of the pull request',
    unavailableAt: NOT_AT_INIT,
    get: i => str(i.session?.prUrl),
  },
  {
    name: 'issueNumber', envName: 'BROOMY_ISSUE_NUMBER', group: 'Issue',
    description: 'Number of the linked issue',
    get: i => str(i.session?.issueNumber ?? i.issue?.number),
  },
  {
    name: 'issueTitle', envName: 'BROOMY_ISSUE_TITLE', group: 'Issue',
    description: 'Title of the linked issue',
    get: i => str(i.session?.issueTitle ?? i.issue?.title),
  },
  {
    name: 'issueUrl', envName: 'BROOMY_ISSUE_URL', group: 'Issue',
    description: 'URL of the linked issue',
    get: i => str(i.session?.issueUrl ?? i.issue?.url),
  },
  {
    name: 'sessionName', envName: 'BROOMY_SESSION_NAME', group: 'Session',
    description: 'Name of the session',
    unavailableAt: NOT_AT_INIT,
    get: i => str(i.session?.name),
  },
  {
    name: 'stage', envName: 'BROOMY_STAGE', group: 'Session',
    description: 'Current workflow stage of the session',
    unavailableAt: NOT_AT_INIT,
    get: i => str(i.session?.stage),
  },
]

export const RESERVED_CONTEXT_VARS = new Set(TEMPLATE_VARS.map(v => v.name))

/** Why a variable is dimmed in the picker for a surface. */
export const UNAVAILABLE_REASON: Record<TemplateVarSurface, string> = {
  command: 'not available here',
  agent: 'not available here',
  init: 'not set when the init script runs',
}

export function isAvailableAt(v: TemplateVarDef, surface: TemplateVarSurface): boolean {
  return !v.unavailableAt?.includes(surface)
}

export function buildTemplateVars(input: TemplateVarInput): Record<string, string> {
  const out: Record<string, string> = {}
  for (const v of TEMPLATE_VARS) out[v.name] = v.get(input)
  return out
}

export function buildTemplateEnv(
  input: TemplateVarInput,
  surface: TemplateVarSurface
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const v of TEMPLATE_VARS) {
    if (!isAvailableAt(v, surface)) continue
    out[v.envName] = v.get(input)
  }
  return out
}
```

- [ ] **Step 4: Point the parser at the registry**

In `src/renderer/features/commands/templateParser.ts`, delete line 1 (the hardcoded `Set`) and replace it with a re-export so existing importers keep working:

```ts
import { RESERVED_CONTEXT_VARS } from './templateVars'

export { RESERVED_CONTEXT_VARS }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/features/commands/templateVars.test.ts src/renderer/features/commands/templateParser.test.ts`
Expected: PASS. The parser tests must still pass unchanged — the reserved set grew, so add a case asserting a new name is excluded from parsed args:

```ts
it('excludes new reserved context vars from parsed args', () => {
  const parsed = parseTemplate('/summarize {prTitle} {myArg}')
  expect(parsed.args.map(a => a.name)).toEqual(['myArg'])
})
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/features/commands/templateVars.ts src/renderer/features/commands/templateVars.test.ts src/renderer/features/commands/templateParser.ts src/renderer/features/commands/templateParser.test.ts
git commit -m "feat(commands): add template variable registry"
```

---

### Task 2: Widen substitution to the registry

**Files:**
- Modify: `src/renderer/features/commands/templateSubstitute.ts`
- Modify: `src/renderer/features/commands/templateSubstitute.test.ts`

**Interfaces:**
- Consumes: `buildTemplateVars` from Task 1
- Produces: `SubContext = Record<string, string>` (widened from the 4-field interface)

- [ ] **Step 1: Write the failing test**

Add to `templateSubstitute.test.ts`:

```ts
it('substitutes the new context variables', () => {
  const result = substituteTemplate('/review {prTitle} on {branch} in {repoName}', {
    context: { prTitle: 'Fix login', branch: 'fix/login', repoName: 'broomy' },
    args: {},
  })
  expect(result).toBe('/review Fix login on fix/login in broomy')
})

it('substitutes an empty string for a context variable with no value', () => {
  const result = substituteTemplate('/pr {prNumber}', { context: { prNumber: '' }, args: {} })
  expect(result).toBe('/pr ')
})

it('leaves unknown placeholders untouched', () => {
  const result = substituteTemplate('/x {notAVar}', { context: { branch: 'b' }, args: {} })
  expect(result).toBe('/x {notAVar}')
})

it('prefers a context variable over an arg of the same name', () => {
  const result = substituteTemplate('/x {branch}', {
    context: { branch: 'from-context' },
    args: { branch: { value: 'from-arg' } },
  })
  expect(result).toBe('/x from-context')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/features/commands/templateSubstitute.test.ts`
Expected: FAIL — type error on the narrowed `SubContext`, and unknown variables are not substituted.

- [ ] **Step 3: Widen the type and loop over the map**

In `templateSubstitute.ts`, replace the `SubContext` interface and the four hardcoded `.replace` calls:

```ts
/** Context variable values, keyed by registry name. See templateVars.ts. */
export type SubContext = Record<string, string>
```

```ts
  // Substitute reserved context vars. Runs before user args so a context
  // variable always wins a name collision (parseTemplate already excludes
  // reserved names from args, so this is belt and braces).
  s = s.replace(/\{([A-Za-z_][\w]*)\}/g, (full, name: string) => {
    const v = input.context[name]
    return v !== undefined ? v : full
  })
```

Leave the flag-group stripping above it and the user-arg substitution below it exactly as they are.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/features/commands/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/commands/templateSubstitute.ts src/renderer/features/commands/templateSubstitute.test.ts
git commit -m "feat(commands): substitute all registry variables"
```

---

### Task 3: Use the shared builder at the two command call sites

**Files:**
- Modify: `src/renderer/panels/explorer/tabs/source-control/SourceControl.tsx:148-153`
- Modify: `src/renderer/panels/explorer/tabs/review/ReviewPanel.tsx:386-391`

**Interfaces:**
- Consumes: `buildTemplateVars`, `TemplateVarInput` from Task 1
- Produces: nothing new — both sites keep passing `templateVars` to `ActionButtons`

- [ ] **Step 1: Replace the SourceControl useMemo**

```tsx
  // Template variables for action labels and prompts
  const templateVars = useMemo(() => buildTemplateVars({
    session: activeSession,
    repo: data.currentRepo,
    syncStatus,
    directory: directory ?? '',
    branchBaseName: data.branchBaseName,
  }), [activeSession, data.currentRepo, syncStatus, directory, data.branchBaseName])
```

Import `buildTemplateVars` from `../../../../features/commands/templateVars`. Read `activeSession` from the session store if it is not already in scope in this component — check first, and use the existing local if there is one.

- [ ] **Step 2: Replace the ReviewPanel useMemo**

```tsx
  const templateVars: SubContext = useMemo(() => buildTemplateVars({
    session,
    repo: repos.find(r => r.id === session.repoId),
    syncStatus,
    directory: session.directory,
    branchBaseName: session.prBaseBranch,
  }), [session, repos, syncStatus])
```

Import `buildTemplateVars`, and `useRepoStore` if `repos` is not already in scope.

- [ ] **Step 3: Run the affected tests**

Run: `pnpm vitest run src/renderer/panels/explorer/tabs/source-control src/renderer/panels/explorer/tabs/review`
Expected: PASS. Existing tests assert on `{branch}` and `{issueNumber}` substitution; both still resolve.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/panels/explorer/tabs/source-control/SourceControl.tsx src/renderer/panels/explorer/tabs/review/ReviewPanel.tsx
git commit -m "refactor(commands): build template vars from the shared registry"
```

---

### Task 4: The picker modal

**Files:**
- Create: `src/renderer/shared/components/TemplateVarsModal.tsx`
- Create: `src/renderer/shared/components/TemplateVarsModal.test.tsx`
- Create: `src/renderer/shared/components/TemplateVarsModal.stories.tsx`

**Interfaces:**
- Consumes: `TEMPLATE_VARS`, `buildTemplateVars`, `isAvailableAt`, `UNAVAILABLE_REASON`, `TemplateVarSurface`, `TemplateVarInput` from Task 1
- Produces: `TemplateVarsModal({ surface, varInput, onInsert, onClose })`, and `insertionTextFor(def, surface): string`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/shared/components/TemplateVarsModal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TemplateVarsModal } from './TemplateVarsModal'

const varInput = { directory: '/repos/broomy/wt/fix-login' }

describe('TemplateVarsModal', () => {
  it('renders a row per variable, grouped', () => {
    render(<TemplateVarsModal surface="command" varInput={varInput} onInsert={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('{branch}')).toBeInTheDocument()
    expect(screen.getByText('{prTitle}')).toBeInTheDocument()
    expect(screen.getByText('Pull request')).toBeInTheDocument()
  })

  it('shows the BROOMY_ form on shell surfaces', () => {
    render(<TemplateVarsModal surface="init" varInput={varInput} onInsert={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('$BROOMY_BRANCH')).toBeInTheDocument()
    expect(screen.queryByText('{branch}')).not.toBeInTheDocument()
  })

  it('shows the live value for a variable that has one', () => {
    render(<TemplateVarsModal surface="command" varInput={varInput} onInsert={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('fix-login')).toBeInTheDocument()
  })

  it('filters by name and description', () => {
    render(<TemplateVarsModal surface="command" varInput={varInput} onInsert={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search variables…'), { target: { value: 'issue' } })
    expect(screen.getByText('{issueTitle}')).toBeInTheDocument()
    expect(screen.queryByText('{branch}')).not.toBeInTheDocument()
  })

  it('inserts the variable and closes on click', () => {
    const onInsert = vi.fn()
    const onClose = vi.fn()
    render(<TemplateVarsModal surface="command" varInput={varInput} onInsert={onInsert} onClose={onClose} />)
    fireEvent.click(screen.getByText('{branch}'))
    expect(onInsert).toHaveBeenCalledWith('{branch}')
    expect(onClose).toHaveBeenCalled()
  })

  it('does not insert an unavailable variable and explains why', () => {
    const onInsert = vi.fn()
    render(<TemplateVarsModal surface="init" varInput={varInput} onInsert={onInsert} onClose={vi.fn()} />)
    expect(screen.getByText('not set when the init script runs')).toBeInTheDocument()
    fireEvent.click(screen.getByText('$BROOMY_PR_TITLE'))
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<TemplateVarsModal surface="command" varInput={varInput} onInsert={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/shared/components/TemplateVarsModal.test.tsx`
Expected: FAIL — cannot resolve `./TemplateVarsModal`.

- [ ] **Step 3: Write the component**

```tsx
// src/renderer/shared/components/TemplateVarsModal.tsx
/**
 * Picker for template variables, shared by every surface that accepts them.
 *
 * Shows each variable in the surface's syntax ({name} for data targets,
 * $BROOMY_NAME for shell targets) with its description and current live value.
 * Variables that can never carry a value on this surface render dimmed with a
 * reason rather than being hidden, so the list matches the documentation.
 */
import { useMemo, useState } from 'react'
import {
  TEMPLATE_VARS, buildTemplateVars, isAvailableAt, UNAVAILABLE_REASON,
  type TemplateVarDef, type TemplateVarInput, type TemplateVarSurface,
} from '../../features/commands/templateVars'

export function insertionTextFor(def: TemplateVarDef, surface: TemplateVarSurface): string {
  return surface === 'command' || surface === 'envValue' ? `{${def.name}}` : `$${def.envName}`
}

interface TemplateVarsModalProps {
  surface: TemplateVarSurface
  varInput: TemplateVarInput
  onInsert: (text: string) => void
  onClose: () => void
  /** Shown under the list — e.g. that PR values are empty on a new session. */
  footerNote?: string
}

export function TemplateVarsModal({ surface, varInput, onInsert, onClose, footerNote }: TemplateVarsModalProps) {
  const [query, setQuery] = useState('')
  const values = useMemo(() => buildTemplateVars(varInput), [varInput])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = TEMPLATE_VARS.filter(v =>
      !q ||
      v.name.toLowerCase().includes(q) ||
      v.envName.toLowerCase().includes(q) ||
      v.description.toLowerCase().includes(q)
    )
    const out = new Map<string, TemplateVarDef[]>()
    for (const v of matches) {
      const list = out.get(v.group) ?? []
      list.push(v)
      out.set(v.group, list)
    }
    return [...out.entries()]
  }, [query])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      role="dialog"
      aria-label="Template variables"
      tabIndex={-1}
    >
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-xl w-[min(560px,90vw)] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <h3 className="text-sm font-medium text-text-primary">Template variables</h3>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary px-2"
            title="Close"
            data-testid="close-template-vars"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-2 border-b border-border">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search variables…"
            autoFocus
            className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {groups.length === 0 && (
            <p className="p-3 text-sm text-text-secondary">No variables match.</p>
          )}
          {groups.map(([group, vars]) => (
            <div key={group} className="mb-2">
              <div className="px-2 py-1 text-2xs uppercase tracking-wide text-text-tertiary">{group}</div>
              {vars.map(v => {
                const available = isAvailableAt(v, surface)
                const value = values[v.name]
                return (
                  <button
                    key={v.name}
                    type="button"
                    disabled={!available}
                    onClick={() => { onInsert(insertionTextFor(v, surface)); onClose() }}
                    className={`w-full text-left px-2 py-1.5 rounded flex items-baseline gap-2 ${
                      available ? 'hover:bg-bg-tertiary' : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-sm font-mono text-text-primary shrink-0">
                      {insertionTextFor(v, surface)}
                    </span>
                    <span className="text-2xs text-text-secondary flex-1 truncate">{v.description}</span>
                    <span className="text-2xs font-mono text-text-tertiary truncate max-w-[40%]">
                      {available ? (value || '—') : UNAVAILABLE_REASON[surface]}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-border text-2xs text-text-tertiary">
          {footerNote ?? 'Click a variable to insert it at the cursor.'}
        </div>
      </div>
    </div>
  )
}
```

Note: `insertionTextFor` above references an `'envValue'` surface. Add it to the `TemplateVarSurface` union in `templateVars.ts` — agent env **values** take the `{}` form because they are never shell-parsed. Give it the same `UNAVAILABLE_REASON` entry as `agent`, and no `unavailableAt` entries.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/shared/components/TemplateVarsModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the story**

```tsx
// src/renderer/shared/components/TemplateVarsModal.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { TemplateVarsModal } from './TemplateVarsModal'

const varInput = {
  directory: '/Users/rob/repos/broomy/wt/fix-login',
  repo: { id: 'r1', name: 'broomy', remoteUrl: '', rootDir: '/Users/rob/repos/broomy', defaultBranch: 'main' },
  session: {
    name: 'Fix login', branch: 'fix/login', stage: 'coding',
    prNumber: 42, prTitle: 'Fix the login redirect', prUrl: 'https://github.com/x/y/pull/42',
    issueNumber: 7, issueTitle: 'Login redirect loops', issueUrl: 'https://github.com/x/y/issues/7',
  },
} as never

const meta: Meta<typeof TemplateVarsModal> = {
  title: 'Shared/TemplateVarsModal',
  component: TemplateVarsModal,
  args: { varInput, onInsert: () => {}, onClose: () => {} },
}
export default meta
type Story = StoryObj<typeof TemplateVarsModal>

export const CommandSurface: Story = { args: { surface: 'command' } }
export const AgentSurface: Story = {
  args: { surface: 'agent', footerNote: 'Pull request values are empty until the branch has a PR.' },
}
export const InitScriptSurface: Story = { args: { surface: 'init' } }
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/shared/components/TemplateVarsModal.tsx src/renderer/shared/components/TemplateVarsModal.test.tsx src/renderer/shared/components/TemplateVarsModal.stories.tsx src/renderer/features/commands/templateVars.ts
git commit -m "feat(commands): add template variable picker modal"
```

---

### Task 5: Insert at cursor, wired into the commands editor

**Files:**
- Create: `src/renderer/shared/hooks/useInsertAtCursor.ts`
- Create: `src/renderer/shared/hooks/useInsertAtCursor.test.ts`
- Modify: `src/renderer/panels/fileViewer/CommandsEditor.tsx:344-386`
- Modify: `src/renderer/panels/fileViewer/CommandsEditorParts.tsx:284-326` (`CommandExpandedEditor`)
- Modify: `src/renderer/panels/fileViewer/CommandsEditor.test.tsx`

**Interfaces:**
- Consumes: `TemplateVarsModal` from Task 4
- Produces: `useInsertAtCursor<T extends HTMLInputElement | HTMLTextAreaElement>()` returning `{ ref, insert }` where `insert(text: string, value: string, onChange: (v: string) => void): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/shared/hooks/useInsertAtCursor.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useInsertAtCursor } from './useInsertAtCursor'

function inputWithSelection(value: string, start: number, end: number) {
  const el = document.createElement('input')
  el.value = value
  el.setSelectionRange = vi.fn()
  el.focus = vi.fn()
  Object.defineProperty(el, 'selectionStart', { value: start, writable: true })
  Object.defineProperty(el, 'selectionEnd', { value: end, writable: true })
  return el
}

describe('useInsertAtCursor', () => {
  it('splices text at the caret', () => {
    const { result } = renderHook(() => useInsertAtCursor<HTMLInputElement>())
    result.current.ref.current = inputWithSelection('/fix  now', 5, 5)
    const onChange = vi.fn()
    result.current.insert('{branch}', '/fix  now', onChange)
    expect(onChange).toHaveBeenCalledWith('/fix {branch} now')
  })

  it('replaces the selection', () => {
    const { result } = renderHook(() => useInsertAtCursor<HTMLInputElement>())
    result.current.ref.current = inputWithSelection('/fix OLD now', 5, 8)
    const onChange = vi.fn()
    result.current.insert('{branch}', '/fix OLD now', onChange)
    expect(onChange).toHaveBeenCalledWith('/fix {branch} now')
  })

  it('appends when there is no element', () => {
    const { result } = renderHook(() => useInsertAtCursor<HTMLInputElement>())
    const onChange = vi.fn()
    result.current.insert('{branch}', '/fix', onChange)
    expect(onChange).toHaveBeenCalledWith('/fix{branch}')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/shared/hooks/useInsertAtCursor.test.ts`
Expected: FAIL — cannot resolve `./useInsertAtCursor`.

- [ ] **Step 3: Write the hook**

```ts
// src/renderer/shared/hooks/useInsertAtCursor.ts
/**
 * Splices text into an input or textarea at the caret, restoring focus after.
 *
 * Used by the template variable picker so inserting lands where the user was
 * typing rather than at the end of the field.
 */
import { useCallback, useRef } from 'react'

export function useInsertAtCursor<T extends HTMLInputElement | HTMLTextAreaElement>() {
  const ref = useRef<T | null>(null)

  const insert = useCallback((text: string, value: string, onChange: (v: string) => void) => {
    const el = ref.current
    if (!el) {
      onChange(value + text)
      return
    }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? start
    const next = value.slice(0, start) + text + value.slice(end)
    onChange(next)
    const caret = start + text.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }, [])

  return { ref, insert }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/shared/hooks/useInsertAtCursor.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the inline command field**

In `CommandsEditor.tsx`'s `Detail` component, add state and the hook, and read the active session for live values:

```tsx
  const [showVars, setShowVars] = useState(false)
  const { ref: commandRef, insert } = useInsertAtCursor<HTMLInputElement & HTMLTextAreaElement>()
  const activeSession = useSessionStore(s => s.sessions.find(x => x.id === s.activeSessionId))
  const repos = useRepoStore(s => s.repos)
  const varInput = useMemo(() => ({
    session: activeSession,
    repo: repos.find(r => r.id === activeSession?.repoId),
    directory: activeSession?.directory ?? '',
  }), [activeSession, repos])
```

Add the trigger to the `Field` action slot beside `⤢ Expand`:

```tsx
          <button
            type="button"
            onClick={() => setShowVars(true)}
            className="text-2xs text-text-tertiary hover:text-text-primary transition-colors mr-2"
            title="Insert a template variable"
            data-testid="open-template-vars"
          >
            {'{} Vars'}
          </button>
```

Attach `ref={commandRef}` to both the `input` and the `textarea` branches, and render the modal:

```tsx
      {showVars && (
        <TemplateVarsModal
          surface="command"
          varInput={varInput}
          onInsert={t => insert(t, selected.template, v => onUpdate({ template: v }))}
          onClose={() => setShowVars(false)}
        />
      )}
```

- [ ] **Step 6: Wire the expanded editor**

`CommandExpandedEditor` in `CommandsEditorParts.tsx` gains the same three pieces: a `useInsertAtCursor<HTMLTextAreaElement>()`, `ref` on its textarea, and a `{} Vars` button in its footer next to the hint text, rendering the same modal with `surface="command"`. Add a `varInput` prop so the parent passes the value it already computed rather than each component deriving its own.

- [ ] **Step 7: Test the wiring**

Add to `CommandsEditor.test.tsx`:

```tsx
it('inserts a variable at the caret in the command field', async () => {
  render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
  // select the first command, then:
  const field = await screen.findByDisplayValue('/fix  now')
  ;(field as HTMLInputElement).setSelectionRange(5, 5)
  fireEvent.click(screen.getByTestId('open-template-vars'))
  fireEvent.click(screen.getByText('{branch}'))
  expect(await screen.findByDisplayValue('/fix {branch} now')).toBeInTheDocument()
})
```

Adapt the fixture to whatever the existing tests in that file already set up — reuse their mock config rather than adding a new one.

- [ ] **Step 8: Run tests and commit**

Run: `pnpm vitest run src/renderer/panels/fileViewer src/renderer/shared/hooks/useInsertAtCursor.test.ts`
Expected: PASS.

```bash
git add src/renderer/shared/hooks/useInsertAtCursor.ts src/renderer/shared/hooks/useInsertAtCursor.test.ts src/renderer/panels/fileViewer/
git commit -m "feat(commands): insert template variables at the cursor"
```

---

### Task 6: Agent command and env surface

**Files:**
- Modify: `src/renderer/shared/hooks/useAppCallbacks.ts:162-166` (`getAgentEnv`)
- Modify: `src/renderer/shared/hooks/useAppCallbacks.test.ts`
- Modify: `src/renderer/panels/settings/AgentSettingsAgentTab.tsx:138` and `:281`
- Modify: `src/renderer/panels/settings/EnvVarEditor.tsx`

**Interfaces:**
- Consumes: `buildTemplateEnv`, `buildTemplateVars` from Task 1, `substituteTemplate` from Task 2, `TemplateVarsModal` from Task 4
- Produces: `getAgentEnv(session)` now returns the agent env with `{}` resolved plus the `BROOMY_*` keys merged in

- [ ] **Step 1: Write the failing test**

Add to `useAppCallbacks.test.ts`:

```ts
it('getAgentEnv exports BROOMY_ variables for the session', () => {
  const { result } = renderHook(() => useAppCallbacks(baseConfig))
  const env = result.current.getAgentEnv({ agentId: 'a1', branch: 'fix/login', directory: '/repo/wt' } as never)
  expect(env?.BROOMY_BRANCH).toBe('fix/login')
  expect(env?.BROOMY_DIRECTORY).toBe('/repo/wt')
})

it('getAgentEnv resolves {vars} inside configured env values', () => {
  // agent a1 configured with env { MY_BRANCH: '{branch}' }
  const { result } = renderHook(() => useAppCallbacks(baseConfig))
  const env = result.current.getAgentEnv({ agentId: 'a1', branch: 'fix/login', directory: '/repo/wt' } as never)
  expect(env?.MY_BRANCH).toBe('fix/login')
})

it('getAgentEnv still returns BROOMY_ variables when the session has no agent env', () => {
  const { result } = renderHook(() => useAppCallbacks(baseConfig))
  const env = result.current.getAgentEnv({ agentId: 'no-env-agent', branch: 'b', directory: '/d' } as never)
  expect(env?.BROOMY_BRANCH).toBe('b')
})
```

Extend the existing agent fixture in that file with `env: { MY_BRANCH: '{branch}' }` on agent `a1`, and add a second agent with no `env`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/shared/hooks/useAppCallbacks.test.ts`
Expected: FAIL — `BROOMY_BRANCH` is undefined.

- [ ] **Step 3: Implement**

```ts
  const getAgentEnv = useCallback((session: Session) => {
    const varInput = {
      session,
      repo: repos.find((r) => r.id === session.repoId),
      directory: session.directory,
    }
    // BROOMY_* lets the agent command line reference session state without
    // splicing GitHub-controlled text into a shell. Configured env values use
    // {var} instead, because they are passed to spawn unexpanded.
    const broomyEnv = buildTemplateEnv(varInput, 'agent')
    const agent = session.agentId ? agents.find((a) => a.id === session.agentId) : undefined
    const vars = buildTemplateVars(varInput)
    const resolved: Record<string, string> = {}
    for (const [k, v] of Object.entries(agent?.env ?? {})) {
      resolved[k] = substituteTemplate(v, { context: vars, args: {} })
    }
    return { ...resolved, ...broomyEnv }
  }, [agents, repos])
```

Note this no longer returns `undefined` — it always returns at least the `BROOMY_*` keys. Check every `getAgentEnv` caller tolerates a defined value: `usePanelsMap.tsx:348` passes it straight to `agentEnv`, which is optional, so a defined object is fine. Update the `getAgentEnv` type in `usePanelsMap.tsx:89` from `Record<string, string> | undefined` to `Record<string, string>`, and remove the now-dead "returns undefined when session has no agentId" test, replacing it with the third test above.

- [ ] **Step 4: Add the picker to Agent Settings**

In `AgentSettingsAgentTab.tsx`, both the add form (line ~138) and the edit form (line ~281) get a `{} Vars` button beside the command input, using `useInsertAtCursor` and `TemplateVarsModal` with `surface="agent"` and:

```tsx
footerNote="Pull request values are empty until the branch has a PR."
```

Agent Settings has no session in scope, so pass `varInput={{ directory: '' }}` — every live value renders as `—`, which is honest at configuration time.

- [ ] **Step 5: Add the picker to env values**

In `EnvVarEditor.tsx`, add a `{} Vars` button to each value input and the pending new-value input, with `surface="envValue"` so it inserts `{branch}` rather than `$BROOMY_BRANCH`.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm vitest run src/renderer/shared/hooks src/renderer/panels/settings`
Expected: PASS.

```bash
git add src/renderer/shared/hooks/useAppCallbacks.ts src/renderer/shared/hooks/useAppCallbacks.test.ts src/renderer/hooks/usePanelsMap.tsx src/renderer/panels/settings/AgentSettingsAgentTab.tsx src/renderer/panels/settings/EnvVarEditor.tsx
git commit -m "feat(agent): expose template variables to the agent command and env"
```

---

### Task 7: Repo init script surface

**Files:**
- Modify: `src/main/handlers/shell.ts:218-234`
- Modify: `src/preload/apis/shell.ts:11` and `:71`
- Create: `src/renderer/features/sessions/runRepoInitScript.ts`
- Create: `src/renderer/features/sessions/runRepoInitScript.test.ts`
- Modify: `src/renderer/panels/settings/useBackgroundInit.ts:85-91` and `:135-141`
- Modify: `src/renderer/features/sessions/newSession/NewBranchView.tsx:121-128`
- Modify: `src/renderer/features/sessions/newSession/ExistingBranchView.tsx:86-90`
- Modify: `src/renderer/features/sessions/newSession/ReviewPrsView.tsx:56-60`
- Modify: `src/renderer/panels/settings/RepoSettingsEditor.tsx:160-170`

**Interfaces:**
- Consumes: `buildTemplateEnv` from Task 1, `TemplateVarsModal` from Task 4
- Produces: `runRepoInitScript(repo: ManagedRepo, worktreePath: string, varInput: Omit<TemplateVarInput, 'directory'>): Promise<void>`; `window.shell.exec(command, cwd, env?)`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/features/sessions/runRepoInitScript.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRepoInitScript } from './runRepoInitScript'
import type { ManagedRepo } from '../../../preload/index'

const repo = { id: 'r1', name: 'broomy', remoteUrl: '', rootDir: '/repos/broomy', defaultBranch: 'main' } as ManagedRepo

beforeEach(() => {
  window.repos = { getInitScript: vi.fn().mockResolvedValue('pnpm install') } as never
  window.shell = { exec: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 }) } as never
})

describe('runRepoInitScript', () => {
  it('runs the script in the worktree with BROOMY_ variables', async () => {
    await runRepoInitScript(repo, '/repos/broomy/wt/fix-login', { repo, issue: { number: 7, title: 'Login broken' } })
    expect(window.shell.exec).toHaveBeenCalledWith('pnpm install', '/repos/broomy/wt/fix-login', expect.objectContaining({
      BROOMY_DIRECTORY: '/repos/broomy/wt/fix-login',
      BROOMY_FOLDER_NAME: 'fix-login',
      BROOMY_REPO_NAME: 'broomy',
      BROOMY_ISSUE_NUMBER: '7',
      BROOMY_ISSUE_TITLE: 'Login broken',
    }))
  })

  it('omits variables that are not set at init time', async () => {
    await runRepoInitScript(repo, '/repos/broomy/wt/x', { repo })
    const env = vi.mocked(window.shell.exec).mock.calls[0][2] as Record<string, string>
    expect(env.BROOMY_PR_NUMBER).toBeUndefined()
    expect(env.BROOMY_SESSION_NAME).toBeUndefined()
  })

  it('does nothing when the repo has no init script', async () => {
    vi.mocked(window.repos.getInitScript).mockResolvedValue(null)
    await runRepoInitScript(repo, '/repos/broomy/wt/x', { repo })
    expect(window.shell.exec).not.toHaveBeenCalled()
  })

  it('never throws when the script fails', async () => {
    vi.mocked(window.shell.exec).mockRejectedValue(new Error('boom'))
    await expect(runRepoInitScript(repo, '/repos/broomy/wt/x', { repo })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/features/sessions/runRepoInitScript.test.ts`
Expected: FAIL — cannot resolve `./runRepoInitScript`.

- [ ] **Step 3: Add the env parameter to the IPC layer**

`src/main/handlers/shell.ts:218`:

```ts
  ipcMain.handle('shell:exec', async (_event, command: string, cwd: string, env?: Record<string, string>) => {
    if (ctx.isE2ETest && !ctx.e2eRealRepos) {
      return { success: true, stdout: '', stderr: '', exitCode: 0 }
    }

    return new Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>((resolve) => {
      exec(
        command,
        {
          cwd: expandHomePath(cwd),
          shell: getExecShell(),
          timeout: 300000,
          env: env ? { ...process.env, ...env } : process.env,
        },
        (error, stdout, stderr) => {
```

`src/preload/apis/shell.ts` line 11 and line 71:

```ts
  exec: (command: string, cwd: string, env?: Record<string, string>) => Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>
```

```ts
  exec: (command, cwd, env) => ipcRenderer.invoke('shell:exec', command, cwd, env),
```

- [ ] **Step 4: Write the helper**

```ts
// src/renderer/features/sessions/runRepoInitScript.ts
/**
 * Runs a repo's init script in a freshly created worktree.
 *
 * Session state is passed as BROOMY_* environment variables rather than
 * substituted into the script text: issue and PR titles carry
 * GitHub-controlled text, and splicing that into a shell script executes it.
 *
 * Failures are non-fatal — a session is still usable if setup did not finish.
 */
import { buildTemplateEnv, type TemplateVarInput } from '../commands/templateVars'
import type { ManagedRepo } from '../../../preload/index'

export async function runRepoInitScript(
  repo: ManagedRepo,
  worktreePath: string,
  varInput: Omit<TemplateVarInput, 'directory'> = {}
): Promise<void> {
  try {
    const script = await window.repos.getInitScript(repo.id)
    if (!script) return
    const env = buildTemplateEnv({ ...varInput, repo, directory: worktreePath }, 'init')
    await window.shell.exec(script, worktreePath, env)
  } catch {
    // Non-fatal, matching the behaviour of the call sites this replaces.
  }
}
```

- [ ] **Step 5: Replace all five call sites**

Each of these currently holds the same six-line block. Replace with a single call, keeping the surrounding abort checks and control flow exactly as they are.

`useBackgroundInit.ts:85-91` and `:135-141`:
```ts
        await runRepoInitScript(repo, worktreePath, { issue })
```
(pass `{ issue }` only where an issue is in scope; otherwise call with two arguments.)

`NewBranchView.tsx:121-128`:
```ts
      await runRepoInitScript(repo, worktreePath, {
        issue: issue ? { number: issue.number, title: issue.title, url: issue.url } : undefined,
      })
```

`ExistingBranchView.tsx:86-90` and `ReviewPrsView.tsx:56-60`:
```ts
    await runRepoInitScript(repo, worktreePath)
```

Delete the now-unused `try`/`catch` wrappers and `getInitScript` imports at each site — the helper owns both.

- [ ] **Step 6: Add the picker to Repo Settings**

In `RepoSettingsEditor.tsx`, put a `{} Vars` button next to the "Init Script (runs when session starts)" label at line 160, wired with `useInsertAtCursor<HTMLTextAreaElement>()` and `TemplateVarsModal` with `surface="init"` and `varInput={{ directory: '', repo }}`. Update the label's helper text to mention that variables arrive as environment variables:

```tsx
        <p className="text-2xs text-text-tertiary">
          Session details are available as environment variables, e.g. $BROOMY_BRANCH.
        </p>
```

- [ ] **Step 7: Run tests and commit**

Run: `pnpm vitest run src/renderer/features/sessions src/renderer/panels/settings src/main`
Expected: PASS.

```bash
git add src/main/handlers/shell.ts src/preload/apis/shell.ts src/renderer/features/sessions/ src/renderer/panels/settings/
git commit -m "feat(sessions): pass template variables to repo init scripts"
```

---

### Task 8: Validate, document, and walk through

**Files:**
- Create: `docs/features/template-vars/` (screenshot walkthrough, via the feature-doc skill)
- Modify: `docs/architecture.md` if it describes the commands feature

- [ ] **Step 1: Run the full validation suite**

Run: `/validate`
This runs lint, typecheck, check:all, unit tests, coverage, and E2E in order, and fixes failures. Do not run the individual commands by hand.

- [ ] **Step 2: Bring coverage back to threshold if it dropped**

Run: `/coverage-check src/renderer/features/commands/templateVars.ts` and the same for each new file. The 90% line threshold is enforced. Add tests for any uncovered branch rather than lowering the threshold.

- [ ] **Step 3: Update the storybook reference images**

Run: `pnpm storybook:test` to screenshot and diff. The three new `TemplateVarsModal` stories have no reference yet, so accept them: `pnpm storybook:update-refs`. Review the diff report at `.storybook-report/index.html` first to confirm no *existing* story changed unexpectedly — the commands editor and settings panels gained buttons, so small diffs there are expected and should be eyeballed before accepting.

- [ ] **Step 4: Build the screenshot walkthrough**

Run: `/feature-doc template-vars`

Cover the four surfaces end to end:
1. The commands editor with the picker open, showing grouped variables and live values.
2. A command using `{prTitle}`, and the resulting resolved prompt.
3. Agent Settings with the picker open on the command field, showing the `$BROOMY_` form.
4. Repo Settings init script with the picker open, showing PR variables dimmed with their reason.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: screenshot walkthrough for template variables"
```

---

## Self-Review

**Spec coverage:** Registry §1 → Task 1. Variables §2 → Task 1. Builders §3 → Tasks 1–3. Agent surface §4 → Task 6. Init script surface §5 → Task 7. Picker §6 → Task 4. Insertion points §7 → Tasks 5–7. Behavior change §Behavior → covered by the parser test in Task 1 Step 5. Testing §Testing → distributed across every task, with `/validate` and coverage in Task 8.

**Known gap accepted:** the spec lists a `RepoSettingsEditor.test.tsx` / `AgentSettingsAgentTab.test.tsx` assertion for the `$BROOMY_` insert. Those are folded into Tasks 6 and 7 as part of the settings test runs rather than getting their own steps.

**Type consistency:** `TemplateVarSurface` is `'command' | 'agent' | 'init' | 'envValue'` — the fourth member is added in Task 4 Step 3 and used in Task 6 Step 5. `buildTemplateVars` returns `Record<string, string>` everywhere. `SubContext` is that same type after Task 2. `runRepoInitScript` takes `Omit<TemplateVarInput, 'directory'>` in both its definition (Task 7 Step 4) and its call sites (Step 5).
