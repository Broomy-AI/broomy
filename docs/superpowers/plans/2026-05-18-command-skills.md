# Command Skills Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the action-button system around user-level `~/.broomy/commands.json` with optional per-project additions, a one-line slash-command template format with auto-detected args, a session "stage" state machine, and three bundled starter packs (Basics, Superpowers, gstack).

**Architecture:** Renderer loads two config files (user + project), merges by concatenation, and renders filtered action buttons. A new template parser produces an args list from `{name}` and `--flag {name}` placeholders. A new ArgDialog modal collects values, substitutes them into the template, and dispatches via shell (`!` prefix) or agent (PTY/SDK). A new `stage` field on Session drives a discoverable state machine that gates and is mutated by actions. The legacy `defaultCommands.json` fallback is removed; a new pack-picker setup CTA replaces it.

**Tech Stack:** TypeScript, React, Vitest, Zustand, Electron IPC (`window.fs`, `window.app.homedir()`), Tailwind CSS.

**Reference spec:** `docs/superpowers/specs/2026-05-18-command-skills-design.md` — keep open while implementing.

---

## File map

### Modified
- `src/renderer/features/commands/commandsConfig.ts` — schema types, validation, migration, dual-file loader, visibility filter.
- `src/renderer/features/commands/commandsConfig.test.ts` — tests for above.
- `src/renderer/features/commands/conditionState.ts` — unchanged in behavior.
- `src/renderer/features/commands/actionExecutor.ts` — drop `type`/`agents`, use template, call `setStage`.
- `src/renderer/features/commands/actionExecutor.test.ts` — update tests.
- `src/renderer/features/commands/hooks/useCommandsConfig.ts` — load user + project files; return merged + each side.
- `src/renderer/features/commands/hooks/useCommandsConfig.test.ts` — update tests.
- `src/renderer/shared/components/ActionButtons.tsx` — two-line buttons, stage pill, arg dialog, setup CTA.
- `src/renderer/shared/components/ActionButtons.test.tsx` — update tests.
- `src/renderer/panels/explorer/tabs/source-control/SourceControl.tsx` — wire new hook return, drop setup banner.
- `src/renderer/panels/explorer/tabs/source-control/CommandsSetupDialog.tsx` — rewrite as pack picker.
- `src/renderer/panels/explorer/tabs/source-control/CommandsSetupDialog.test.tsx` — update tests.
- `src/renderer/panels/fileViewer/CommandsEditor.tsx` — rewrite as two-column with User/Project tabs.
- `src/renderer/panels/fileViewer/CommandsEditor.test.tsx` — update tests.
- `src/renderer/store/sessions.ts` — add `stage: string` field (default `"new"`).
- `src/renderer/store/sessionCoreActions.ts` — add `setSessionStage`.
- `src/renderer/store/sessionPersistence.ts` — include `stage` in serialization.

### Created
- `src/renderer/features/commands/templateParser.ts` + `.test.ts` — extract args + flag-groups from template.
- `src/renderer/features/commands/templateSubstitute.ts` + `.test.ts` — resolve template against context + args.
- `src/renderer/features/commands/userConfigPath.ts` + `.test.ts` — derive `~/.broomy/commands.json` path.
- `src/renderer/features/commands/packs/basics.json`
- `src/renderer/features/commands/packs/superpowers.json`
- `src/renderer/features/commands/packs/gstack.json`
- `src/renderer/features/commands/packs/index.ts` + `.test.ts`
- `src/renderer/shared/components/StagePill.tsx` + `.test.tsx` + `.stories.tsx`
- `src/renderer/shared/components/ArgDialog.tsx` + `.test.tsx` + `.stories.tsx`
- `src/renderer/shared/components/SetupCta.tsx` + `.test.tsx` + `.stories.tsx`

### Deleted
- `src/renderer/features/commands/defaultCommands.json`
- `src/renderer/shared/components/PromptVariants.tsx` + `.stories.tsx`
- `src/renderer/panels/explorer/tabs/source-control/CommandsSetupBanner.tsx` + `.stories.tsx`

---

## Task 1: Define v2 schema types

**Files:**
- Modify: `src/renderer/features/commands/commandsConfig.ts`
- Test: `src/renderer/features/commands/commandsConfig.test.ts`

- [ ] **Step 1: Write failing tests for the new types and validation**

Append to `src/renderer/features/commands/commandsConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateCommandsConfig, CURRENT_CONFIG_VERSION } from './commandsConfig'

describe('v2 schema', () => {
  it('CURRENT_CONFIG_VERSION is 2', () => {
    expect(CURRENT_CONFIG_VERSION).toBe(2)
  })

  it('accepts a minimal v2 config', () => {
    const config = {
      version: 2,
      actions: [
        { id: 'a', label: 'A', template: '/foo {x}' },
      ],
    }
    expect(validateCommandsConfig(config)).toEqual([])
  })

  it('accepts stages, setStage, args, description', () => {
    const config = {
      version: 2,
      actions: [
        {
          id: 'a',
          label: 'A',
          description: 'hover help',
          template: '/foo {x}',
          showWhen: ['has-changes'],
          stages: ['planning', 'building'],
          setStage: 'verifying',
          args: [{ name: 'x', description: 'd', default: 'v' }],
          style: 'primary',
          surface: 'source-control',
          switchTab: 'review',
        },
      ],
    }
    expect(validateCommandsConfig(config)).toEqual([])
  })

  it('rejects missing template', () => {
    const errs = validateCommandsConfig({
      version: 2,
      actions: [{ id: 'a', label: 'A' }],
    })
    expect(errs.some(e => e.includes('template'))).toBe(true)
  })

  it('rejects non-string setStage when not null', () => {
    const errs = validateCommandsConfig({
      version: 2,
      actions: [{ id: 'a', label: 'A', template: 't', setStage: 42 }],
    })
    expect(errs.some(e => e.includes('setStage'))).toBe(true)
  })

  it('accepts setStage: null', () => {
    expect(validateCommandsConfig({
      version: 2,
      actions: [{ id: 'a', label: 'A', template: 't', setStage: null }],
    })).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/features/commands/commandsConfig.test.ts`
Expected: FAIL — `CURRENT_CONFIG_VERSION` not exported, `template` not validated.

- [ ] **Step 3: Add v2 types and exports**

Replace the `Types` section in `src/renderer/features/commands/commandsConfig.ts` (the `ActionDefinition`, `AgentOverride`, `CommandsConfig` interfaces at the top) with:

```ts
// --- Types ---

export const CURRENT_CONFIG_VERSION = 2

export interface ArgSpec {
  name: string
  description?: string
  default?: string
}

export interface ActionDefinition {
  id: string
  label: string
  description?: string
  template: string

  showWhen?: string[]
  stages?: string[]
  setStage?: string | null

  args?: ArgSpec[]

  style?: 'primary' | 'secondary' | 'accent' | 'danger'
  surface?: string | string[]
  switchTab?: string
}

export interface CommandsConfig {
  version: number
  actions: ActionDefinition[]
}
```

- [ ] **Step 4: Update validateCommandsConfig for v2**

Replace `validateAction` and `validateCommandsConfig` in `src/renderer/features/commands/commandsConfig.ts` with:

```ts
const VALID_STYLES = ['primary', 'secondary', 'accent', 'danger'] as const

function validateSurface(surface: unknown, label: string, errors: string[]): void {
  if (surface === undefined) return
  if (typeof surface === 'string') return
  if (Array.isArray(surface)) {
    if (surface.some((v: unknown) => typeof v !== 'string')) {
      errors.push(`${label}: "surface" entries must be strings.`)
    }
    return
  }
  errors.push(`${label}: "surface" must be a string or array of strings.`)
}

function validateStages(stages: unknown, label: string, errors: string[]): void {
  if (stages === undefined) return
  if (!Array.isArray(stages) || stages.some(v => typeof v !== 'string')) {
    errors.push(`${label}: "stages" must be an array of strings.`)
  }
}

function validateSetStage(setStage: unknown, label: string, errors: string[]): void {
  if (setStage === undefined) return
  if (setStage === null) return
  if (typeof setStage !== 'string') {
    errors.push(`${label}: "setStage" must be a string or null.`)
  }
}

function validateArgs(args: unknown, label: string, errors: string[]): void {
  if (args === undefined) return
  if (!Array.isArray(args)) {
    errors.push(`${label}: "args" must be an array.`)
    return
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as Record<string, unknown>
    if (typeof a !== 'object' || a === null) {
      errors.push(`${label} args[${i}]: must be an object.`)
      continue
    }
    if (typeof a.name !== 'string' || !a.name) {
      errors.push(`${label} args[${i}]: "name" must be a non-empty string.`)
    }
    if (a.description !== undefined && typeof a.description !== 'string') {
      errors.push(`${label} args[${i}]: "description" must be a string.`)
    }
    if (a.default !== undefined && typeof a.default !== 'string') {
      errors.push(`${label} args[${i}]: "default" must be a string.`)
    }
  }
}

function actionLabel(action: Record<string, unknown>, index: number): string {
  const id = typeof action.id === 'string' ? action.id : '?'
  return `Action ${index + 1} (${id})`
}

function validateAction(action: Record<string, unknown>, index: number, errors: string[]): void {
  const label = actionLabel(action, index)

  if (typeof action.id !== 'string' || !action.id) errors.push(`Action ${index + 1}: "id" must be a non-empty string.`)
  if (typeof action.label !== 'string' || !action.label) errors.push(`${label}: "label" must be a non-empty string.`)
  if (typeof action.template !== 'string' || !action.template) errors.push(`${label}: "template" must be a non-empty string.`)
  if (action.description !== undefined && typeof action.description !== 'string') errors.push(`${label}: "description" must be a string.`)

  if (action.showWhen !== undefined) {
    if (!Array.isArray(action.showWhen) || action.showWhen.some((v: unknown) => typeof v !== 'string')) {
      errors.push(`${label}: "showWhen" must be an array of strings.`)
    }
  }

  validateStages(action.stages, label, errors)
  validateSetStage(action.setStage, label, errors)
  validateArgs(action.args, label, errors)

  if (action.style !== undefined && !VALID_STYLES.includes(action.style as typeof VALID_STYLES[number])) {
    errors.push(`${label}: "style" must be one of: ${VALID_STYLES.join(', ')}.`)
  }
  validateSurface(action.surface, label, errors)
  if (action.switchTab !== undefined && typeof action.switchTab !== 'string') errors.push(`${label}: "switchTab" must be a string.`)
}

export function validateCommandsConfig(config: unknown): string[] {
  const errors: string[] = []

  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    errors.push('Config must be a JSON object with "version" and "actions".')
    return errors
  }

  const obj = config as Record<string, unknown>

  if (typeof obj.version !== 'number') errors.push('"version" must be a number.')
  if (!Array.isArray(obj.actions)) {
    errors.push('"actions" must be an array.')
    return errors
  }

  for (let i = 0; i < obj.actions.length; i++) {
    const raw = obj.actions[i]
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push(`Action ${i + 1}: must be an object.`)
      continue
    }
    validateAction(raw as Record<string, unknown>, i, errors)
  }

  return errors
}
```

Also remove the now-unused constant `VALID_TYPES` and the `AgentOverride` interface from the file. Delete the `detectAgentType` and `getAgentTypes` functions — they will no longer be referenced after later tasks; leaving them in for now is fine (they have tests). They'll be cleaned up in Task 20.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/features/commands/commandsConfig.test.ts`
Expected: PASS on the new v2 tests. Older tests referencing `type: 'agent' | 'shell'` will now fail — those tests are deleted in Task 2 (migration) where we cover migration semantics.

For this task, comment out the old tests in `describe('validateCommandsConfig', ...)` blocks that reference the old schema fields (`type`, `prompt`, `command`, `agents`). Add `// REMOVE in Task 2 — covered by migration tests` above the block.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/features/commands/commandsConfig.ts src/renderer/features/commands/commandsConfig.test.ts
git commit -m "feat(commands): add v2 schema types and validation"
```

---

## Task 2: Add v1→v2 migration

**Files:**
- Modify: `src/renderer/features/commands/commandsConfig.ts`
- Test: `src/renderer/features/commands/commandsConfig.test.ts`

- [ ] **Step 1: Write failing tests for migration**

Append to `commandsConfig.test.ts`:

```ts
import { migrateConfig } from './commandsConfig'

describe('migrateConfig', () => {
  it('passes v2 configs through unchanged', () => {
    const v2 = {
      version: 2,
      actions: [{ id: 'a', label: 'A', template: '/x' }],
    }
    expect(migrateConfig(v2)).toEqual(v2)
  })

  it('migrates v1 agent prompt to template', () => {
    const v1 = {
      version: 1,
      actions: [{
        id: 'commit',
        label: 'Commit',
        type: 'agent',
        prompt: 'Commit changes',
        showWhen: ['has-changes'],
        style: 'primary',
      }],
    }
    const v2 = migrateConfig(v1)
    expect(v2.version).toBe(2)
    expect(v2.actions[0]).toEqual({
      id: 'commit',
      label: 'Commit',
      template: 'Commit changes',
      showWhen: ['has-changes'],
      style: 'primary',
    })
  })

  it('migrates v1 shell command to template with ! prefix', () => {
    const v1 = {
      version: 1,
      actions: [{ id: 'push', label: 'Push', type: 'shell', command: 'git push' }],
    }
    expect(migrateConfig(v1).actions[0]).toEqual({
      id: 'push',
      label: 'Push',
      template: '!git push',
    })
  })

  it('drops agents overrides silently', () => {
    const v1 = {
      version: 1,
      actions: [{
        id: 'x',
        label: 'X',
        type: 'agent',
        prompt: 'base',
        agents: { claude: { prompt: 'claude prompt' } },
      }],
    }
    const out = migrateConfig(v1).actions[0]
    expect(out.template).toBe('base')
    expect('agents' in out).toBe(false)
  })

  it('preserves surface and switchTab through migration', () => {
    const v1 = {
      version: 1,
      actions: [{
        id: 'r', label: 'R', type: 'agent', prompt: 'p',
        surface: ['source-control', 'review'], switchTab: 'review',
      }],
    }
    const out = migrateConfig(v1).actions[0]
    expect(out.surface).toEqual(['source-control', 'review'])
    expect(out.switchTab).toBe('review')
  })

  it('preserves empty showWhen', () => {
    const v1 = {
      version: 1,
      actions: [{ id: 'a', label: 'A', type: 'agent', prompt: 'p', showWhen: [] }],
    }
    expect(migrateConfig(v1).actions[0].showWhen).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/features/commands/commandsConfig.test.ts`
Expected: FAIL — `migrateConfig` not exported.

- [ ] **Step 3: Add migrateConfig function**

Add to `src/renderer/features/commands/commandsConfig.ts` (before the `// --- Loading ---` section):

```ts
// --- Migration ---

interface LegacyAgentOverride {
  prompt?: string
}
interface LegacyActionV1 {
  id: string
  label: string
  type?: 'agent' | 'shell'
  prompt?: string
  command?: string
  showWhen?: string[]
  style?: ActionDefinition['style']
  surface?: string | string[]
  switchTab?: string
  agents?: Record<string, LegacyAgentOverride>
}

function migrateAction(a: LegacyActionV1): ActionDefinition {
  let template: string
  if (a.type === 'shell' && typeof a.command === 'string') {
    template = `!${a.command}`
  } else {
    template = a.prompt ?? ''
  }

  const out: ActionDefinition = {
    id: a.id,
    label: a.label,
    template,
  }
  if (a.showWhen !== undefined) out.showWhen = a.showWhen
  if (a.style !== undefined) out.style = a.style
  if (a.surface !== undefined) out.surface = a.surface
  if (a.switchTab !== undefined) out.switchTab = a.switchTab
  return out
}

export function migrateConfig(config: unknown): CommandsConfig {
  if (typeof config !== 'object' || config === null) {
    return { version: CURRENT_CONFIG_VERSION, actions: [] }
  }
  const obj = config as Record<string, unknown>
  if (obj.version === CURRENT_CONFIG_VERSION) {
    return obj as unknown as CommandsConfig
  }
  const rawActions = Array.isArray(obj.actions) ? (obj.actions as LegacyActionV1[]) : []
  return {
    version: CURRENT_CONFIG_VERSION,
    actions: rawActions.map(migrateAction),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/features/commands/commandsConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/commands/commandsConfig.ts src/renderer/features/commands/commandsConfig.test.ts
git commit -m "feat(commands): add v1 to v2 migration"
```

---

## Task 3: Template parser

**Files:**
- Create: `src/renderer/features/commands/templateParser.ts`
- Test: `src/renderer/features/commands/templateParser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/renderer/features/commands/templateParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseTemplate, RESERVED_CONTEXT_VARS } from './templateParser'

describe('parseTemplate', () => {
  it('extracts a single bare placeholder', () => {
    const r = parseTemplate('/plan {topic}')
    expect(r.args).toEqual([{ name: 'topic', optional: false, flag: null }])
  })

  it('extracts multiple bare placeholders in order', () => {
    const r = parseTemplate('/plan {a} {b} {c}')
    expect(r.args.map(a => a.name)).toEqual(['a', 'b', 'c'])
  })

  it('detects optional flag group with --long flag', () => {
    const r = parseTemplate('/plan {topic} --depth {depth}')
    expect(r.args).toEqual([
      { name: 'topic', optional: false, flag: null },
      { name: 'depth', optional: true, flag: '--depth' },
    ])
  })

  it('detects optional flag group with -short flag', () => {
    const r = parseTemplate('/x {a} -v {value}')
    expect(r.args[1]).toEqual({ name: 'value', optional: true, flag: '-v' })
  })

  it('ignores reserved context vars', () => {
    const r = parseTemplate('Create a PR against {main} for {branch}, see {directory} and {issueNumber}')
    expect(r.args).toEqual([])
  })

  it('mixes reserved and user args', () => {
    const r = parseTemplate('On {branch}, run /plan {topic}')
    expect(r.args).toEqual([{ name: 'topic', optional: false, flag: null }])
  })

  it('returns empty args for text-block templates', () => {
    const r = parseTemplate('multi\nline\nprompt')
    expect(r.args).toEqual([])
  })

  it('deduplicates repeated placeholders', () => {
    const r = parseTemplate('/x {topic} again {topic}')
    expect(r.args).toEqual([{ name: 'topic', optional: false, flag: null }])
  })

  it('reserved set includes the canonical four', () => {
    expect(RESERVED_CONTEXT_VARS).toEqual(new Set(['main', 'branch', 'directory', 'issueNumber']))
  })

  it('flag-group beats bare when same name appears twice', () => {
    const r = parseTemplate('/x {topic} --topic-flag {topic}')
    // Even though `topic` is referenced bare elsewhere, the dedupe keeps the first; result is one entry.
    expect(r.args.map(a => a.name)).toEqual(['topic'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/features/commands/templateParser.test.ts`
Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Implement the parser**

Create `src/renderer/features/commands/templateParser.ts`:

```ts
export const RESERVED_CONTEXT_VARS = new Set(['main', 'branch', 'directory', 'issueNumber'])

export interface TemplateArg {
  name: string
  optional: boolean
  flag: string | null
}

export interface ParsedTemplate {
  args: TemplateArg[]
  isMultiLine: boolean
}

const FLAG_AND_PLACEHOLDER = /(?:^|\s)(--?[A-Za-z][\w-]*)\s+\{([A-Za-z_][\w]*)\}/g
const ANY_PLACEHOLDER = /\{([A-Za-z_][\w]*)\}/g

export function parseTemplate(template: string): ParsedTemplate {
  const isMultiLine = template.includes('\n')
  if (isMultiLine) return { args: [], isMultiLine }

  const flagBy = new Map<string, string>()
  let m: RegExpExecArray | null
  FLAG_AND_PLACEHOLDER.lastIndex = 0
  while ((m = FLAG_AND_PLACEHOLDER.exec(template)) != null) {
    const [, flag, name] = m
    if (!RESERVED_CONTEXT_VARS.has(name) && !flagBy.has(name)) {
      flagBy.set(name, flag)
    }
  }

  const seen = new Set<string>()
  const args: TemplateArg[] = []
  ANY_PLACEHOLDER.lastIndex = 0
  while ((m = ANY_PLACEHOLDER.exec(template)) != null) {
    const name = m[1]
    if (RESERVED_CONTEXT_VARS.has(name)) continue
    if (seen.has(name)) continue
    seen.add(name)
    const flag = flagBy.get(name) ?? null
    args.push({ name, optional: flag != null, flag })
  }

  return { args, isMultiLine }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/features/commands/templateParser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/commands/templateParser.ts src/renderer/features/commands/templateParser.test.ts
git commit -m "feat(commands): add template parser for args and flag-groups"
```

---

## Task 4: Template substitution

**Files:**
- Create: `src/renderer/features/commands/templateSubstitute.ts`
- Test: `src/renderer/features/commands/templateSubstitute.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/renderer/features/commands/templateSubstitute.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { substituteTemplate } from './templateSubstitute'

const CTX = { main: 'main', branch: 'feat/x', directory: '/tmp/repo', issueNumber: '42' }

describe('substituteTemplate', () => {
  it('substitutes reserved context vars', () => {
    expect(substituteTemplate('Create a PR against {main}', { context: CTX, args: {} }))
      .toBe('Create a PR against main')
  })

  it('substitutes user args', () => {
    expect(substituteTemplate('/plan {topic}', { context: CTX, args: { topic: { value: 'auth' } } }))
      .toBe('/plan auth')
  })

  it('strips optional flag-group when arg is omitted', () => {
    expect(substituteTemplate(
      '/plan {topic} --depth {depth}',
      { context: CTX, args: { topic: { value: 'auth' }, depth: { value: '', enabled: false } } },
    )).toBe('/plan auth')
  })

  it('includes optional flag-group when arg is enabled', () => {
    expect(substituteTemplate(
      '/plan {topic} --depth {depth}',
      { context: CTX, args: { topic: { value: 'auth' }, depth: { value: '5', enabled: true } } },
    )).toBe('/plan auth --depth 5')
  })

  it('handles -short optional flag', () => {
    expect(substituteTemplate(
      '/x {a} -v {value}',
      { context: CTX, args: { a: { value: 'A' }, value: { value: '', enabled: false } } },
    )).toBe('/x A')
  })

  it('leaves bare reserved var empty when context lacks it', () => {
    expect(substituteTemplate('issue {issueNumber}', { context: { ...CTX, issueNumber: '' }, args: {} }))
      .toBe('issue ')
  })

  it('does not strip flag-groups for required (non-flag) args', () => {
    expect(substituteTemplate('/x {a}', { context: CTX, args: { a: { value: 'A' } } }))
      .toBe('/x A')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/features/commands/templateSubstitute.test.ts`
Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Implement substitution**

Create `src/renderer/features/commands/templateSubstitute.ts`:

```ts
import { parseTemplate } from './templateParser'

export interface SubContext {
  main: string
  branch: string
  directory: string
  issueNumber: string
}

export interface ArgValue {
  value: string
  /** Only meaningful for optional flag-group args; required args ignore this. */
  enabled?: boolean
}

export interface SubInput {
  context: SubContext
  args: Record<string, ArgValue>
}

export function substituteTemplate(template: string, input: SubInput): string {
  const parsed = parseTemplate(template)
  let s = template

  // Strip optional flag-groups whose arg is disabled.
  for (const arg of parsed.args) {
    if (!arg.optional || !arg.flag) continue
    const val = input.args[arg.name]
    const enabled = val?.enabled ?? false
    if (!enabled) {
      // Remove the leading whitespace + flag + whitespace + {name} portion.
      const escapedFlag = arg.flag.replace(/[-]/g, '\\-')
      const re = new RegExp(`(\\s+)?${escapedFlag}\\s+\\{${arg.name}\\}`, 'g')
      s = s.replace(re, '')
    }
  }

  // Substitute reserved context vars.
  s = s
    .replace(/\{main\}/g, input.context.main)
    .replace(/\{branch\}/g, input.context.branch)
    .replace(/\{directory\}/g, input.context.directory)
    .replace(/\{issueNumber\}/g, input.context.issueNumber)

  // Substitute user args.
  s = s.replace(/\{([A-Za-z_][\w]*)\}/g, (full, name: string) => {
    const v = input.args[name]
    return v ? v.value : full
  })

  return s
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/features/commands/templateSubstitute.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/commands/templateSubstitute.ts src/renderer/features/commands/templateSubstitute.test.ts
git commit -m "feat(commands): add template substitution with flag-group stripping"
```

---

## Task 5: User config path helper

**Files:**
- Create: `src/renderer/features/commands/userConfigPath.ts`
- Test: `src/renderer/features/commands/userConfigPath.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/renderer/features/commands/userConfigPath.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getUserCommandsConfigPath } from './userConfigPath'

beforeEach(() => {
  ;(globalThis as any).window = { app: { homedir: vi.fn().mockResolvedValue('/Users/test') } }
})

describe('getUserCommandsConfigPath', () => {
  it('joins homedir with .broomy/commands.json', async () => {
    expect(await getUserCommandsConfigPath()).toBe('/Users/test/.broomy/commands.json')
  })

  it('memoizes after first call', async () => {
    await getUserCommandsConfigPath()
    await getUserCommandsConfigPath()
    expect(((globalThis as any).window.app.homedir as any).mock.calls.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/features/commands/userConfigPath.test.ts`
Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Implement**

Create `src/renderer/features/commands/userConfigPath.ts`:

```ts
let cachedHome: string | null = null

async function getHome(): Promise<string> {
  if (cachedHome) return cachedHome
  cachedHome = await window.app.homedir()
  return cachedHome
}

export async function getUserCommandsConfigPath(): Promise<string> {
  const home = await getHome()
  return `${home}/.broomy/commands.json`
}

export function userCommandsDir(home: string): string {
  return `${home}/.broomy`
}

/** Test-only: clear memoised home dir. */
export function _resetUserCommandsCacheForTest(): void {
  cachedHome = null
}
```

Update the test to call `_resetUserCommandsCacheForTest` in `beforeEach`:

```ts
import { getUserCommandsConfigPath, _resetUserCommandsCacheForTest } from './userConfigPath'
beforeEach(() => {
  _resetUserCommandsCacheForTest()
  ;(globalThis as any).window = { app: { homedir: vi.fn().mockResolvedValue('/Users/test') } }
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/features/commands/userConfigPath.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/commands/userConfigPath.ts src/renderer/features/commands/userConfigPath.test.ts
git commit -m "feat(commands): add user commands.json path helper"
```

---

## Task 6: Dual-file loader and visibility filter

**Files:**
- Modify: `src/renderer/features/commands/commandsConfig.ts`
- Test: `src/renderer/features/commands/commandsConfig.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `commandsConfig.test.ts`:

```ts
import { loadConfigFromPath, mergeConfigs, isVisible, discoverStages } from './commandsConfig'

describe('loadConfigFromPath', () => {
  beforeEach(() => {
    ;(globalThis as any).window = {
      fs: {
        exists: vi.fn(),
        readFile: vi.fn(),
      },
    }
  })

  it('returns null when file missing', async () => {
    ;(window.fs.exists as any).mockResolvedValue(false)
    expect(await loadConfigFromPath('/x')).toBeNull()
  })

  it('returns ok with migrated config for valid v2', async () => {
    ;(window.fs.exists as any).mockResolvedValue(true)
    ;(window.fs.readFile as any).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'a', label: 'A', template: 't' }],
    }))
    const r = await loadConfigFromPath('/x')
    expect(r).toEqual({ ok: true, config: { version: 2, actions: [{ id: 'a', label: 'A', template: 't' }] } })
  })

  it('returns ok after v1 migration', async () => {
    ;(window.fs.exists as any).mockResolvedValue(true)
    ;(window.fs.readFile as any).mockResolvedValue(JSON.stringify({
      version: 1, actions: [{ id: 'a', label: 'A', type: 'agent', prompt: 'p' }],
    }))
    const r = await loadConfigFromPath('/x')
    expect(r).toMatchObject({ ok: true })
    if (r && r.ok) {
      expect(r.config.actions[0].template).toBe('p')
    }
  })

  it('returns error for invalid JSON', async () => {
    ;(window.fs.exists as any).mockResolvedValue(true)
    ;(window.fs.readFile as any).mockResolvedValue('{ not json')
    const r = await loadConfigFromPath('/x')
    expect(r?.ok).toBe(false)
  })

  it('returns error for schema-invalid config (post-migration)', async () => {
    ;(window.fs.exists as any).mockResolvedValue(true)
    ;(window.fs.readFile as any).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'a', label: 'A' }], // missing template
    }))
    const r = await loadConfigFromPath('/x')
    expect(r?.ok).toBe(false)
  })
})

describe('mergeConfigs', () => {
  it('returns null when both inputs null', () => {
    expect(mergeConfigs(null, null)).toBeNull()
  })

  it('returns user actions when project null', () => {
    expect(mergeConfigs(
      { version: 2, actions: [{ id: 'a', label: 'A', template: 't' }] },
      null,
    )?.actions.map(a => a.id)).toEqual(['a'])
  })

  it('returns project actions when user null', () => {
    expect(mergeConfigs(
      null,
      { version: 2, actions: [{ id: 'b', label: 'B', template: 't' }] },
    )?.actions.map(a => a.id)).toEqual(['b'])
  })

  it('concatenates user then project, keeping duplicate ids', () => {
    const merged = mergeConfigs(
      { version: 2, actions: [{ id: 'a', label: 'User A', template: 't' }] },
      { version: 2, actions: [{ id: 'a', label: 'Project A', template: 't' }, { id: 'b', label: 'B', template: 't' }] },
    )
    expect(merged?.actions.map(a => a.label)).toEqual(['User A', 'Project A', 'B'])
  })
})

describe('isVisible', () => {
  const baseState = {
    'has-changes': false, 'clean': true, 'merging': false, 'conflicts': false,
    'no-tracking': false, 'ahead': false, 'behind': false, 'behind-main': false,
    'on-main': false, 'in-progress': false, 'pushed': false, 'empty': false,
    'open': false, 'merged': false, 'closed': false, 'no-pr': true,
    'has-write-access': true, 'allow-approve-and-merge': true,
    'checks-passed': true, 'has-issue': false, 'no-devcontainer': false, 'review': false,
  } as any

  it('is true when no filters specified', () => {
    expect(isVisible({ id: 'a', label: 'A', template: 't' }, baseState, 'new', 'source-control')).toBe(true)
  })

  it('honors showWhen', () => {
    expect(isVisible({ id: 'a', label: 'A', template: 't', showWhen: ['has-changes'] }, baseState, 'new', 'source-control')).toBe(false)
    expect(isVisible({ id: 'a', label: 'A', template: 't', showWhen: ['clean'] }, baseState, 'new', 'source-control')).toBe(true)
  })

  it('honors stages list', () => {
    expect(isVisible({ id: 'a', label: 'A', template: 't', stages: ['planning'] }, baseState, 'new', 'source-control')).toBe(false)
    expect(isVisible({ id: 'a', label: 'A', template: 't', stages: ['new', 'planning'] }, baseState, 'new', 'source-control')).toBe(true)
  })

  it('honors surface filter', () => {
    expect(isVisible({ id: 'a', label: 'A', template: 't', surface: 'review' }, baseState, 'new', 'source-control')).toBe(false)
    expect(isVisible({ id: 'a', label: 'A', template: 't', surface: ['review', 'source-control'] }, baseState, 'new', 'source-control')).toBe(true)
  })
})

describe('discoverStages', () => {
  it('always includes "new" pinned first', () => {
    expect(discoverStages([], 'new')).toEqual(['new'])
  })

  it('unions stages and setStage across actions, sorts non-"new" alphabetically', () => {
    const stages = discoverStages([
      { id: 'a', label: 'A', template: 't', setStage: 'planning' },
      { id: 'b', label: 'B', template: 't', stages: ['planning', 'building'] },
      { id: 'c', label: 'C', template: 't', stages: ['verifying'] },
    ], 'new')
    expect(stages).toEqual(['new', 'building', 'planning', 'verifying'])
  })

  it('includes current stage even if no command references it', () => {
    expect(discoverStages([], 'mystage')).toEqual(['new', 'mystage'])
  })

  it('ignores setStage: null', () => {
    expect(discoverStages([
      { id: 'a', label: 'A', template: 't', setStage: null },
    ], 'new')).toEqual(['new'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/features/commands/commandsConfig.test.ts`
Expected: FAIL — new exports don't exist.

- [ ] **Step 3: Replace the loader and add merge/visibility/stage helpers**

Replace the entire `// --- Loading ---` section in `src/renderer/features/commands/commandsConfig.ts` with:

```ts
// --- Loading ---

export function projectCommandsConfigPath(directory: string): string {
  return `${directory}/.broomy/commands.json`
}

// Kept under its previous name for callers that still pass a repo directory.
export const commandsConfigPath = projectCommandsConfigPath

export type LoadResult =
  | { ok: true; config: CommandsConfig }
  | { ok: false; error: string }

export async function loadConfigFromPath(path: string): Promise<LoadResult | null> {
  try {
    const exists = await window.fs.exists(path)
    if (!exists) return null
    const content = await window.fs.readFile(path)

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (e) {
      return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` }
    }

    const migrated = migrateConfig(parsed)
    const errors = validateCommandsConfig(migrated)
    if (errors.length > 0) {
      return { ok: false, error: `Invalid commands.json:\n${errors.join('\n')}` }
    }
    return { ok: true, config: migrated }
  } catch {
    return null
  }
}

// --- Merge ---

export function mergeConfigs(user: CommandsConfig | null, project: CommandsConfig | null): CommandsConfig | null {
  if (!user && !project) return null
  return {
    version: CURRENT_CONFIG_VERSION,
    actions: [...(user?.actions ?? []), ...(project?.actions ?? [])],
  }
}

// --- Visibility ---

export function isVisible(
  action: ActionDefinition,
  state: ConditionState,
  stage: string,
  surface: string,
): boolean {
  if (!matchesSurface(action, surface)) return false
  if (action.showWhen && action.showWhen.length > 0 && !evaluateShowWhen(action.showWhen, state)) return false
  if (action.stages && !action.stages.includes(stage)) return false
  return true
}

// --- Stage discovery ---

export function discoverStages(actions: ActionDefinition[], currentStage: string): string[] {
  const set = new Set<string>(['new'])
  for (const a of actions) {
    if (typeof a.setStage === 'string') set.add(a.setStage)
    if (a.stages) for (const s of a.stages) set.add(s)
  }
  set.add(currentStage)
  const rest = [...set].filter(s => s !== 'new').sort()
  return ['new', ...rest]
}
```

Also delete the old `loadCommandsConfig` function and the now-unused `getDefaultCommandsConfig` function. Delete the import of `defaultCommandsJson`.

If any tests still reference `loadCommandsConfig` (look in `useCommandsConfig.test.ts`), update them to mock `loadConfigFromPath` in Task 12.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/features/commands/commandsConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/commands/commandsConfig.ts src/renderer/features/commands/commandsConfig.test.ts
git commit -m "feat(commands): add dual-file loader, merge, visibility, stage discovery"
```

---

## Task 7: Add Session.stage with persistence

**Files:**
- Modify: `src/renderer/store/sessions.ts`
- Modify: `src/renderer/store/sessionCoreActions.ts`
- Modify: `src/renderer/store/sessionPersistence.ts`
- Test: `src/renderer/store/sessions.test.ts`

- [ ] **Step 1: Read the surrounding code**

Read these to understand the patterns:
- `src/renderer/store/sessions.ts:54-119` — Session interface
- `src/renderer/store/sessionCoreActions.ts` — to find where to add `setSessionStage`
- `src/renderer/store/sessionPersistence.ts` — to see how fields are persisted

Don't make changes yet.

- [ ] **Step 2: Write failing test**

Append to `src/renderer/store/sessions.test.ts`:

```ts
describe('session.stage', () => {
  it('new sessions default to "new"', async () => {
    const { addSession, sessions } = useSessionStore.getState()
    await addSession('/tmp', null)
    const last = useSessionStore.getState().sessions.at(-1)
    expect(last?.stage).toBe('new')
  })

  it('setSessionStage updates a single session', () => {
    const { setSessionStage } = useSessionStore.getState()
    const id = useSessionStore.getState().sessions[0].id
    setSessionStage(id, 'planning')
    expect(useSessionStore.getState().sessions.find(s => s.id === id)?.stage).toBe('planning')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/store/sessions.test.ts`
Expected: FAIL — `stage` doesn't exist on Session, `setSessionStage` doesn't exist on store.

- [ ] **Step 4: Add the field and action**

In `src/renderer/store/sessions.ts`:

1. Add `stage: string` to the `Session` interface after `isArchived: boolean` (around line 112):
```ts
  // Stage state machine — drives command visibility (persisted)
  stage: string
```

2. Add to the `SessionStore` interface (after `updateChecksStatus`, around line 186):
```ts
  // Stage state machine
  setSessionStage: (sessionId: string, stage: string) => void
```

In `src/renderer/store/sessionCoreActions.ts`, find where new sessions are created (`addSession` and `addInitializingSession`) and add `stage: 'new'` to the session object. Add the action factory:

```ts
setSessionStage: (sessionId: string, stage: string) => {
  const { sessions } = get()
  const updated = sessions.map(s => s.id === sessionId ? { ...s, stage } : s)
  set({ sessions: updated })
  debouncedSave()
},
```

Make sure this action is included in the returned object from `createCoreActions`.

In `src/renderer/store/sessionPersistence.ts`, add `stage` to the list of fields written out and read in. Find the serialization function and include `stage: s.stage ?? 'new'` (the `?? 'new'` guards against sessions loaded from an older config that lacks the field).

- [ ] **Step 5: Run all session tests**

Run: `pnpm vitest run src/renderer/store/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/store/sessions.ts src/renderer/store/sessionCoreActions.ts src/renderer/store/sessionPersistence.ts src/renderer/store/sessions.test.ts
git commit -m "feat(sessions): add stage field and setSessionStage action"
```

---

## Task 8: Pack JSON files

**Files:**
- Create: `src/renderer/features/commands/packs/basics.json`
- Create: `src/renderer/features/commands/packs/superpowers.json`
- Create: `src/renderer/features/commands/packs/gstack.json`
- Create: `src/renderer/features/commands/packs/index.ts`
- Test: `src/renderer/features/commands/packs/index.test.ts`

- [ ] **Step 1: Create the Basics pack**

Create `src/renderer/features/commands/packs/basics.json`:

```json
{
  "id": "basics",
  "name": "Basics",
  "description": "Cross-agent git workflows. Works on Claude Code, Codex, Gemini.",
  "version": 2,
  "actions": [
    {
      "id": "commit",
      "label": "Commit",
      "description": "Commit current changes with an AI-written message.",
      "template": "Commit the current changes with a clear message. Don't commit any files that contain secrets.",
      "showWhen": ["has-changes", "!merging"],
      "style": "primary"
    },
    {
      "id": "resolve-conflicts",
      "label": "Resolve conflicts",
      "description": "Resolve merge conflicts, asking before guessing.",
      "template": "Resolve the current merge conflicts. Ask before guessing on anything ambiguous.",
      "showWhen": ["conflicts"],
      "style": "danger"
    },
    {
      "id": "sync",
      "label": "Sync",
      "description": "Pull the latest from main and fix conflicts.",
      "template": "Pull the latest from {main} into this branch and fix any conflicts.",
      "showWhen": ["behind-main", "!on-main", "!merging"],
      "style": "primary"
    },
    {
      "id": "push-branch",
      "label": "Push branch",
      "description": "Push this branch to the remote.",
      "template": "!git push -u origin HEAD",
      "showWhen": ["clean", "no-tracking", "!on-main"],
      "style": "primary"
    },
    {
      "id": "create-pr",
      "label": "Create PR",
      "description": "Open a PR for this branch against main.",
      "template": "Create a PR for this branch against {main}.",
      "showWhen": ["no-pr", "!on-main", "!empty", "!conflicts"],
      "style": "primary"
    },
    {
      "id": "review",
      "label": "Review",
      "description": "Run the agent's built-in code review on this branch.",
      "template": "/review",
      "showWhen": ["clean", "pushed|open"],
      "style": "accent",
      "surface": ["source-control", "review"],
      "switchTab": "review"
    }
  ]
}
```

- [ ] **Step 2: Create the Superpowers pack**

Create `src/renderer/features/commands/packs/superpowers.json`:

```json
{
  "id": "superpowers",
  "name": "Superpowers",
  "description": "Brainstorm, plan, build, verify, debug.",
  "version": 2,
  "actions": [
    {
      "id": "brainstorm",
      "label": "Brainstorm",
      "description": "Turn an idea into a design spec.",
      "template": "/brainstorm {idea}",
      "args": [{ "name": "idea", "description": "The thing you want to design.", "default": "" }],
      "setStage": "planning",
      "style": "primary"
    },
    {
      "id": "plan",
      "label": "Write plan",
      "description": "Produce an implementation plan from a spec.",
      "template": "/plan {spec} --focus {focus}",
      "args": [
        { "name": "spec", "description": "Path to the spec or topic to plan.", "default": "" },
        { "name": "focus", "description": "Optional aspect to emphasise.", "default": "" }
      ],
      "stages": ["planning"],
      "setStage": "implementing",
      "style": "primary"
    },
    {
      "id": "verify",
      "label": "Verify",
      "description": "Run the verification checklist.",
      "template": "/verify",
      "stages": ["implementing", "verifying"],
      "setStage": "verifying",
      "style": "primary"
    },
    {
      "id": "debug",
      "label": "Debug",
      "description": "Systematic debugging walkthrough.",
      "template": "/debug {symptom}",
      "args": [{ "name": "symptom", "description": "What's going wrong.", "default": "" }],
      "stages": ["implementing", "verifying"],
      "style": "secondary"
    },
    {
      "id": "review-feedback",
      "label": "Address feedback",
      "description": "Apply code-review feedback systematically.",
      "template": "/review-feedback",
      "stages": ["verifying"],
      "style": "secondary"
    },
    {
      "id": "finish-branch",
      "label": "Finish branch",
      "description": "Decide on merge / PR / cleanup.",
      "template": "/finish-branch",
      "stages": ["verifying"],
      "setStage": "new",
      "style": "accent"
    },
    {
      "id": "request-review",
      "label": "Request review",
      "description": "Ask for a fresh code review.",
      "template": "/request-review",
      "stages": ["verifying"],
      "style": "secondary"
    }
  ]
}
```

- [ ] **Step 3: Create the gstack pack**

Create `src/renderer/features/commands/packs/gstack.json`:

```json
{
  "id": "gstack",
  "name": "gstack",
  "description": "Stack-based git workflows.",
  "version": 2,
  "actions": [
    {
      "id": "stack",
      "label": "New stack entry",
      "description": "Create a new stack entry from current branch.",
      "template": "/stack {name}",
      "args": [{ "name": "name", "description": "Name for the new stack entry." }],
      "style": "primary"
    },
    {
      "id": "submit",
      "label": "Submit stack",
      "description": "Submit the current stack as PRs.",
      "template": "/submit",
      "showWhen": ["clean"],
      "style": "primary"
    },
    {
      "id": "restack",
      "label": "Restack",
      "description": "Rebase all stack entries on the latest base.",
      "template": "/restack",
      "style": "secondary"
    },
    {
      "id": "sync-stack",
      "label": "Sync stack",
      "description": "Pull latest base and update all stack entries.",
      "template": "/sync",
      "style": "secondary"
    },
    {
      "id": "diff-stack",
      "label": "Stack diff",
      "description": "Show diff for the current stack entry.",
      "template": "/diff",
      "style": "secondary"
    },
    {
      "id": "checkout",
      "label": "Checkout entry",
      "description": "Switch to a different stack entry.",
      "template": "/checkout {entry}",
      "args": [{ "name": "entry", "description": "Stack entry name to switch to." }],
      "style": "secondary"
    }
  ]
}
```

- [ ] **Step 4: Write failing tests for the index**

Create `src/renderer/features/commands/packs/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PACKS, getPack } from './index'
import { validateCommandsConfig } from '../commandsConfig'

describe('packs', () => {
  it('exposes basics, superpowers, gstack', () => {
    expect(PACKS.map(p => p.id)).toEqual(['basics', 'superpowers', 'gstack'])
  })

  it('every pack passes schema validation', () => {
    for (const p of PACKS) {
      expect(validateCommandsConfig({ version: 2, actions: p.actions })).toEqual([])
    }
  })

  it('getPack returns by id', () => {
    expect(getPack('basics')?.name).toBe('Basics')
    expect(getPack('missing')).toBeUndefined()
  })

  it('basics has no stages or setStage', () => {
    const basics = getPack('basics')!
    for (const a of basics.actions) {
      expect(a.stages).toBeUndefined()
      expect(a.setStage).toBeUndefined()
    }
  })

  it('superpowers uses stages', () => {
    const sp = getPack('superpowers')!
    const hasStageRef = sp.actions.some(a => a.stages || typeof a.setStage === 'string')
    expect(hasStageRef).toBe(true)
  })
})
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/features/commands/packs/`
Expected: FAIL — index doesn't exist.

- [ ] **Step 6: Create the index**

Create `src/renderer/features/commands/packs/index.ts`:

```ts
import type { ActionDefinition } from '../commandsConfig'
import basics from './basics.json'
import superpowers from './superpowers.json'
import gstack from './gstack.json'

export interface Pack {
  id: string
  name: string
  description: string
  version: number
  actions: ActionDefinition[]
}

export const PACKS: Pack[] = [basics as Pack, superpowers as Pack, gstack as Pack]

export function getPack(id: string): Pack | undefined {
  return PACKS.find(p => p.id === id)
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/features/commands/packs/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/features/commands/packs/
git commit -m "feat(commands): add Basics, Superpowers, gstack starter packs"
```

---

## Task 9: Refactor actionExecutor to use template

**Files:**
- Modify: `src/renderer/features/commands/actionExecutor.ts`
- Test: `src/renderer/features/commands/actionExecutor.test.ts`

- [ ] **Step 1: Replace the test file**

Replace contents of `src/renderer/features/commands/actionExecutor.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../shared/utils/focusHelpers', () => ({
  sendAgentPrompt: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../store/sessions', () => ({
  useSessionStore: {
    getState: () => ({ setSessionStage: vi.fn(), activeSessionId: 'sess', sessions: [] }),
  },
}))

vi.mock('../../store/agentChat', () => ({ useAgentChatStore: { getState: () => ({}) } }))
vi.mock('../../store/agents', () => ({ useAgentStore: { getState: () => ({ agents: [] }) } }))
vi.mock('../../store/repos', () => ({ useRepoStore: { getState: () => ({ repos: [] }) } }))

beforeEach(() => {
  ;(globalThis as any).window = {
    fs: { mkdir: vi.fn(), writeFile: vi.fn() },
    shell: { exec: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 }) },
  }
})

describe('executeAction', () => {
  it('runs shell action when template starts with !', async () => {
    const { executeAction } = await import('./actionExecutor')
    const result = await executeAction(
      { id: 'a', label: 'Push', template: '!git push' },
      {
        directory: '/repo',
        agentPtyId: 'pty-1',
        templateVars: { main: 'main', branch: 'b', directory: '/repo', issueNumber: '' },
        argValues: {},
      },
    )
    expect(result.success).toBe(true)
    expect((window.shell.exec as any)).toHaveBeenCalledWith('git push', '/repo')
  })

  it('substitutes context vars in shell template', async () => {
    const { executeAction } = await import('./actionExecutor')
    await executeAction(
      { id: 'a', label: 'X', template: '!echo {branch}' },
      { directory: '/r', templateVars: { main: 'main', branch: 'feat', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    expect((window.shell.exec as any)).toHaveBeenCalledWith('echo feat', '/r')
  })

  it('sends agent prompt when template lacks ! prefix', async () => {
    const { executeAction } = await import('./actionExecutor')
    const { sendAgentPrompt } = await import('../../shared/utils/focusHelpers')
    await executeAction(
      { id: 'a', label: 'Plan', template: '/plan {topic}' },
      {
        directory: '/r',
        agentPtyId: 'pty-1',
        templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' },
        argValues: { topic: { value: 'auth' } },
      },
    )
    expect(sendAgentPrompt).toHaveBeenCalledWith('pty-1', '/plan auth')
  })

  it('strips disabled optional flag-groups', async () => {
    const { executeAction } = await import('./actionExecutor')
    const { sendAgentPrompt } = await import('../../shared/utils/focusHelpers')
    await executeAction(
      { id: 'a', label: 'Plan', template: '/plan {topic} --depth {depth}' },
      {
        directory: '/r',
        agentPtyId: 'pty-1',
        templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' },
        argValues: { topic: { value: 'auth' }, depth: { value: '', enabled: false } },
      },
    )
    expect(sendAgentPrompt).toHaveBeenCalledWith('pty-1', '/plan auth')
  })

  it('calls setSessionStage after successful shell exec', async () => {
    const setStage = vi.fn()
    const useSessionStore = (await import('../../store/sessions')).useSessionStore
    ;(useSessionStore.getState as any) = () => ({ setSessionStage: setStage, activeSessionId: 'sess', sessions: [] })

    const { executeAction } = await import('./actionExecutor')
    await executeAction(
      { id: 'a', label: 'Push', template: '!git push', setStage: 'pushed' },
      { directory: '/r', templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    expect(setStage).toHaveBeenCalledWith('sess', 'pushed')
  })

  it('setStage: null writes "new"', async () => {
    const setStage = vi.fn()
    const useSessionStore = (await import('../../store/sessions')).useSessionStore
    ;(useSessionStore.getState as any) = () => ({ setSessionStage: setStage, activeSessionId: 'sess', sessions: [] })

    const { executeAction } = await import('./actionExecutor')
    await executeAction(
      { id: 'a', label: 'Finish', template: '/finish', setStage: null },
      { directory: '/r', agentPtyId: 'pty-1', templateVars: { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }, argValues: {} },
    )
    expect(setStage).toHaveBeenCalledWith('sess', 'new')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/features/commands/actionExecutor.test.ts`
Expected: FAIL — old executor signature, no template support.

- [ ] **Step 3: Rewrite the executor**

Replace contents of `src/renderer/features/commands/actionExecutor.ts` with:

```ts
/**
 * Executes actions defined in commands.json (v2).
 *
 * Dispatch:
 * - Resolved template starting with `!` → shell exec via window.shell.
 * - Otherwise → agent prompt via PTY paste or Agent SDK.
 *
 * After a successful run, applies `setStage` to the active session.
 */
import type { ActionDefinition } from './commandsConfig'
import type { ArgValue, SubContext } from './templateSubstitute'
import { substituteTemplate } from './templateSubstitute'
import { sendAgentPrompt } from '../../shared/utils/focusHelpers'
import { useAgentStore, type AgentConfig } from '../../store/agents'
import { useAgentChatStore } from '../../store/agentChat'
import { useSessionStore } from '../../store/sessions'
import { useRepoStore } from '../../store/repos'
import { ENABLE_AGENT_SDK } from '../../../shared/featureFlags'

export interface ActionExecutionContext {
  directory: string
  agentPtyId?: string
  agentId?: string | null
  templateVars: SubContext
  argValues: Record<string, ArgValue>
  onGitStatusRefresh?: () => void
}

export interface ActionResult {
  success: boolean
  error?: string
}

function isShellTemplate(resolved: string): boolean {
  return resolved.startsWith('!')
}

function applySetStage(action: ActionDefinition): void {
  if (action.setStage === undefined) return
  const { activeSessionId, setSessionStage } = useSessionStore.getState()
  if (!activeSessionId) return
  const stage = action.setStage ?? 'new'
  setSessionStage(activeSessionId, stage)
}

async function executeShell(resolved: string, ctx: ActionExecutionContext): Promise<ActionResult> {
  const command = resolved.slice(1) // strip leading '!'
  try {
    const result = await window.shell.exec(command, ctx.directory)
    if (result.success) {
      ctx.onGitStatusRefresh?.()
      return { success: true }
    }
    const output = `${result.stdout}\n${result.stderr}`
    if (/CONFLICT|Merge conflict|fix conflicts/i.test(output)) {
      ctx.onGitStatusRefresh?.()
      return { success: true }
    }
    return { success: false, error: result.stderr || `Command exited with code ${result.exitCode}` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function getApiModeSessionId(agentId?: string | null): string | null {
  if (!ENABLE_AGENT_SDK || !agentId) return null
  const agent = useAgentStore.getState().agents.find((a: AgentConfig) => a.id === agentId)
  if (agent?.connectionMode !== 'api') return null
  return useSessionStore.getState().activeSessionId
}

async function executeAgent(resolved: string, ctx: ActionExecutionContext): Promise<ActionResult> {
  const apiSessionId = getApiModeSessionId(ctx.agentId)
  if (!apiSessionId && !ctx.agentPtyId) {
    return { success: false, error: 'No agent terminal available' }
  }
  try {
    const outputDir = `${ctx.directory}/.broomy/output`
    await window.fs.mkdir(`${ctx.directory}/.broomy`)
    await window.fs.mkdir(outputDir)
    await window.fs.writeFile(`${outputDir}/context.json`, JSON.stringify(ctx.templateVars, null, 2))

    if (apiSessionId) {
      useAgentChatStore.getState().addMessage(apiSessionId, {
        id: `user-${String(Date.now())}`,
        type: 'text',
        timestamp: Date.now(),
        text: resolved,
      })
      useAgentChatStore.getState().setState(apiSessionId, 'running')
      useSessionStore.getState().updateAgentMonitor(apiSessionId, { status: 'working' })
      const session = useSessionStore.getState().sessions.find(s => s.id === apiSessionId)
      const repoList = useRepoStore.getState().repos
      const repo = session?.repoId
        ? repoList.find(r => r.id === session.repoId)
        : repoList.find(r => ctx.directory.startsWith(`${r.rootDir}/`) || ctx.directory === r.rootDir)
      const agent = ctx.agentId ? useAgentStore.getState().agents.find((a: AgentConfig) => a.id === ctx.agentId) : undefined
      void window.agentSdk.send(apiSessionId, resolved, {
        cwd: ctx.directory,
        permissionMode: (repo?.skipApproval ? 'bypassPermissions' : 'default'),
        env: agent?.env,
        sdkSessionId: session?.sdkSessionId,
      })
    } else if (ctx.agentPtyId) {
      await sendAgentPrompt(ctx.agentPtyId, resolved)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function executeAction(action: ActionDefinition, ctx: ActionExecutionContext): Promise<ActionResult> {
  const resolved = substituteTemplate(action.template, { context: ctx.templateVars, args: ctx.argValues })

  const result = isShellTemplate(resolved)
    ? await executeShell(resolved, ctx)
    : await executeAgent(resolved, ctx)

  if (result.success) applySetStage(action)
  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/features/commands/actionExecutor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/commands/actionExecutor.ts src/renderer/features/commands/actionExecutor.test.ts
git commit -m "feat(commands): rewrite executor around template + setStage"
```

---

## Task 10: useCommandsConfig hook (user + project)

**Files:**
- Modify: `src/renderer/features/commands/hooks/useCommandsConfig.ts`
- Test: `src/renderer/features/commands/hooks/useCommandsConfig.test.ts`

- [ ] **Step 1: Replace tests**

Replace contents of `src/renderer/features/commands/hooks/useCommandsConfig.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const fakeFs = {
  exists: vi.fn(),
  readFile: vi.fn(),
  watch: vi.fn().mockResolvedValue({ success: true }),
  unwatch: vi.fn().mockResolvedValue(undefined),
  onChange: vi.fn().mockReturnValue(() => undefined),
}

beforeEach(() => {
  fakeFs.exists.mockReset()
  fakeFs.readFile.mockReset()
  ;(globalThis as any).window = {
    fs: fakeFs,
    app: { homedir: vi.fn().mockResolvedValue('/Users/test') },
  }
})

describe('useCommandsConfig', () => {
  it('returns null/null when neither file exists', async () => {
    fakeFs.exists.mockResolvedValue(false)
    const { useCommandsConfig } = await import('./useCommandsConfig')
    const { result } = renderHook(() => useCommandsConfig('/repo'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(result.current.project).toBeNull()
    expect(result.current.merged).toBeNull()
  })

  it('loads user-only when only ~/.broomy/commands.json exists', async () => {
    fakeFs.exists.mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    fakeFs.readFile.mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'User', template: 't' }],
    }))
    const { useCommandsConfig } = await import('./useCommandsConfig')
    const { result } = renderHook(() => useCommandsConfig('/repo'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user?.actions[0].id).toBe('u')
    expect(result.current.project).toBeNull()
    expect(result.current.merged?.actions.map(a => a.id)).toEqual(['u'])
  })

  it('concatenates user + project actions', async () => {
    fakeFs.exists.mockResolvedValue(true)
    fakeFs.readFile.mockImplementation(async (p: string) => {
      if (p === '/Users/test/.broomy/commands.json') {
        return JSON.stringify({ version: 2, actions: [{ id: 'u', label: 'U', template: 't' }] })
      }
      return JSON.stringify({ version: 2, actions: [{ id: 'p', label: 'P', template: 't' }] })
    })
    const { useCommandsConfig } = await import('./useCommandsConfig')
    const { result } = renderHook(() => useCommandsConfig('/repo'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.merged?.actions.map(a => a.id)).toEqual(['u', 'p'])
  })

  it('surfaces errors when a file fails validation', async () => {
    fakeFs.exists.mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    fakeFs.readFile.mockResolvedValue('not json')
    const { useCommandsConfig } = await import('./useCommandsConfig')
    const { result } = renderHook(() => useCommandsConfig('/repo'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.userError).toMatch(/Invalid JSON/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/features/commands/hooks/useCommandsConfig.test.ts`
Expected: FAIL — hook returns the old shape.

- [ ] **Step 3: Rewrite the hook**

Replace `src/renderer/features/commands/hooks/useCommandsConfig.ts`:

```ts
/**
 * Loads user (~/.broomy/commands.json) and project (<repo>/.broomy/commands.json) configs.
 * Watches both files for external edits.
 * Returns each side plus the merged concatenation.
 */
import { useState, useEffect } from 'react'
import type { CommandsConfig } from '../commandsConfig'
import { loadConfigFromPath, mergeConfigs, projectCommandsConfigPath } from '../commandsConfig'
import { getUserCommandsConfigPath } from '../userConfigPath'

export interface UseCommandsConfigResult {
  user: CommandsConfig | null
  userError: string | null
  userExists: boolean
  project: CommandsConfig | null
  projectError: string | null
  projectExists: boolean
  merged: CommandsConfig | null
  loading: boolean
  reload: () => void
}

export function useCommandsConfig(directory: string | undefined): UseCommandsConfigResult {
  const [user, setUser] = useState<CommandsConfig | null>(null)
  const [userError, setUserError] = useState<string | null>(null)
  const [userExists, setUserExists] = useState(false)
  const [project, setProject] = useState<CommandsConfig | null>(null)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [projectExists, setProjectExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      setLoading(true)
      const userPath = await getUserCommandsConfigPath()
      const userResult = await loadConfigFromPath(userPath)
      let projectResult: Awaited<ReturnType<typeof loadConfigFromPath>> = null
      let projectPath: string | null = null
      if (directory) {
        projectPath = projectCommandsConfigPath(directory)
        projectResult = await loadConfigFromPath(projectPath)
      }

      if (cancelled) return

      if (userResult === null) { setUser(null); setUserExists(false); setUserError(null) }
      else if (!userResult.ok) { setUser(null); setUserExists(true); setUserError(userResult.error) }
      else { setUser(userResult.config); setUserExists(true); setUserError(null) }

      if (projectResult === null) { setProject(null); setProjectExists(false); setProjectError(null) }
      else if (!projectResult.ok) { setProject(null); setProjectExists(true); setProjectError(projectResult.error) }
      else { setProject(projectResult.config); setProjectExists(true); setProjectError(null) }

      setLoading(false)
      return { userPath, projectPath }
    }

    const watchIds: string[] = []
    const removeFns: Array<() => void> = []

    void loadAll().then((paths) => {
      if (!paths || cancelled) return
      const watchEntries: Array<{ id: string; path: string }> = [
        { id: 'user-commands-config', path: paths.userPath },
      ]
      if (paths.projectPath) watchEntries.push({ id: `project-commands-config-${directory}`, path: paths.projectPath })

      for (const w of watchEntries) {
        void window.fs.watch(w.id, w.path)
        watchIds.push(w.id)
        const off = window.fs.onChange(w.id, () => setReloadKey(k => k + 1))
        removeFns.push(off)
      }
    })

    return () => {
      cancelled = true
      for (const off of removeFns) off()
      for (const id of watchIds) void window.fs.unwatch(id)
    }
  }, [directory, reloadKey])

  const merged = mergeConfigs(user, project)
  const reload = () => setReloadKey(k => k + 1)

  return { user, userError, userExists, project, projectError, projectExists, merged, loading, reload }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/features/commands/hooks/useCommandsConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/commands/hooks/useCommandsConfig.ts src/renderer/features/commands/hooks/useCommandsConfig.test.ts
git commit -m "feat(commands): load both user and project configs in the hook"
```

---

## Task 11: ArgDialog component

**Files:**
- Create: `src/renderer/shared/components/ArgDialog.tsx`
- Test: `src/renderer/shared/components/ArgDialog.test.tsx`
- Story: `src/renderer/shared/components/ArgDialog.stories.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/renderer/shared/components/ArgDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ArgDialog } from './ArgDialog'

const ctx = { main: 'main', branch: 'feat', directory: '/r', issueNumber: '' }

beforeEach(() => {
  ;(globalThis as any).window = {}
})

describe('ArgDialog', () => {
  it('renders one field per required arg', () => {
    render(
      <ArgDialog
        title="Plan"
        description="Plan a feature"
        template="/plan {topic}"
        argsMeta={[{ name: 'topic', description: 'The topic' }]}
        context={ctx}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/topic/i)).toBeInTheDocument()
    expect(screen.getByText('The topic')).toBeInTheDocument()
  })

  it('disables Run while required args are empty', () => {
    render(
      <ArgDialog
        title="Plan"
        template="/plan {topic}"
        argsMeta={[]}
        context={ctx}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
  })

  it('enables Run once required args have values', () => {
    render(
      <ArgDialog
        title="Plan"
        template="/plan {topic}"
        argsMeta={[]}
        context={ctx}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText(/topic/i), { target: { value: 'auth' } })
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled()
  })

  it('toggles optional flag-group with a checkbox', () => {
    render(
      <ArgDialog
        title="Plan"
        template="/plan {topic} --depth {depth}"
        argsMeta={[]}
        context={ctx}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText(/topic/i), { target: { value: 'a' } })
    // Depth input should be hidden until checkbox is checked
    expect(screen.queryByLabelText(/depth/i)).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: /--depth/i }))
    expect(screen.getByLabelText(/depth/i)).toBeInTheDocument()
  })

  it('shows live resolved preview', () => {
    render(
      <ArgDialog
        title="Plan"
        template="/plan {topic}"
        argsMeta={[]}
        context={ctx}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText(/topic/i), { target: { value: 'auth' } })
    expect(screen.getByTestId('resolved-preview')).toHaveTextContent('/plan auth')
  })

  it('calls onRun with arg values map', () => {
    const onRun = vi.fn()
    render(
      <ArgDialog
        title="Plan"
        template="/plan {topic} --depth {depth}"
        argsMeta={[]}
        context={ctx}
        onRun={onRun}
        onCancel={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText(/topic/i), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onRun).toHaveBeenCalledWith({
      topic: { value: 'a' },
      depth: { value: '', enabled: false },
    })
  })

  it('Cancel triggers onCancel', () => {
    const onCancel = vi.fn()
    render(
      <ArgDialog title="t" template="/x" argsMeta={[]} context={ctx} onRun={vi.fn()} onCancel={onCancel} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/shared/components/ArgDialog.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement ArgDialog**

Create `src/renderer/shared/components/ArgDialog.tsx`:

```tsx
import { useState, useMemo } from 'react'
import { parseTemplate } from '../../features/commands/templateParser'
import { substituteTemplate } from '../../features/commands/templateSubstitute'
import type { ArgValue, SubContext } from '../../features/commands/templateSubstitute'
import type { ArgSpec } from '../../features/commands/commandsConfig'

interface ArgDialogProps {
  title: string
  description?: string
  template: string
  argsMeta: ArgSpec[]
  context: SubContext
  onRun: (values: Record<string, ArgValue>) => void
  onCancel: () => void
}

export function ArgDialog({ title, description, template, argsMeta, context, onRun, onCancel }: ArgDialogProps) {
  const parsed = useMemo(() => parseTemplate(template), [template])
  const metaByName = useMemo(() => new Map(argsMeta.map(a => [a.name, a])), [argsMeta])

  const [values, setValues] = useState<Record<string, ArgValue>>(() => {
    const init: Record<string, ArgValue> = {}
    for (const a of parsed.args) {
      const meta = metaByName.get(a.name)
      init[a.name] = a.optional
        ? { value: meta?.default ?? '', enabled: false }
        : { value: meta?.default ?? '' }
    }
    return init
  })

  const requiredOk = parsed.args.every(a => a.optional || (values[a.name]?.value ?? '').length > 0)
  const resolved = substituteTemplate(template, { context, args: values })

  function update(name: string, patch: Partial<ArgValue>) {
    setValues(v => ({ ...v, [name]: { ...v[name], ...patch } }))
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onCancel()
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && requiredOk) {
      onRun(values)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
      onKeyDown={onKeyDown}
      role="dialog"
    >
      <div className="bg-bg-secondary border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-medium text-text-primary">{title}</h3>
        {description && <p className="text-xs text-text-secondary">{description}</p>}

        {parsed.args.map(arg => {
          const meta = metaByName.get(arg.name)
          const v = values[arg.name]
          if (arg.optional) {
            return (
              <div key={arg.name} className="space-y-1">
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={v.enabled ?? false}
                    onChange={e => update(arg.name, { enabled: e.target.checked })}
                    className="accent-accent"
                  />
                  <span className="font-mono text-accent">{arg.flag}</span>
                </label>
                {v.enabled && (
                  <>
                    <input
                      aria-label={arg.name}
                      type="text"
                      value={v.value}
                      onChange={e => update(arg.name, { value: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-primary text-text-primary font-mono focus:outline-none focus:border-accent"
                    />
                    {meta?.description && <p className="text-[11px] text-text-tertiary">{meta.description}</p>}
                  </>
                )}
              </div>
            )
          }
          return (
            <div key={arg.name} className="space-y-1">
              <label className="text-xs text-text-secondary">{arg.name} <span className="text-red-400">*</span></label>
              <input
                aria-label={arg.name}
                type="text"
                value={v.value}
                onChange={e => update(arg.name, { value: e.target.value })}
                className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-primary text-text-primary font-mono focus:outline-none focus:border-accent"
                autoFocus
              />
              {meta?.description && <p className="text-[11px] text-text-tertiary">{meta.description}</p>}
            </div>
          )
        })}

        <div className="pt-2 border-t border-border">
          <div className="text-[11px] text-text-tertiary">Resolved:</div>
          <code data-testid="resolved-preview" className="block text-xs font-mono text-text-primary break-all">{resolved}</code>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
          <button
            disabled={!requiredOk}
            onClick={() => onRun(values)}
            className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-50"
          >
            Run
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/shared/components/ArgDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write a Storybook story**

Create `src/renderer/shared/components/ArgDialog.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ArgDialog } from './ArgDialog'

const meta: Meta<typeof ArgDialog> = {
  title: 'Commands/ArgDialog',
  component: ArgDialog,
  parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj<typeof ArgDialog>

const ctx = { main: 'main', branch: 'feature/x', directory: '/repo', issueNumber: '' }

export const SingleRequired: Story = {
  args: {
    title: 'Plan feature',
    description: 'Brainstorm and write a design spec',
    template: '/plan {topic}',
    argsMeta: [{ name: 'topic', description: 'The thing you want to plan.' }],
    context: ctx,
    onRun: () => undefined,
    onCancel: () => undefined,
  },
}

export const RequiredAndOptionalFlag: Story = {
  args: {
    ...SingleRequired.args,
    template: '/plan {topic} --depth {depth}',
    argsMeta: [
      { name: 'topic', description: 'What to plan.' },
      { name: 'depth', description: 'How deep to go.', default: '3' },
    ],
  },
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/shared/components/ArgDialog.tsx src/renderer/shared/components/ArgDialog.test.tsx src/renderer/shared/components/ArgDialog.stories.tsx
git commit -m "feat(commands): add ArgDialog modal"
```

---

## Task 12: StagePill component

**Files:**
- Create: `src/renderer/shared/components/StagePill.tsx`
- Test: `src/renderer/shared/components/StagePill.test.tsx`
- Story: `src/renderer/shared/components/StagePill.stories.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/renderer/shared/components/StagePill.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StagePill } from './StagePill'

describe('StagePill', () => {
  it('renders the current stage', () => {
    render(<StagePill currentStage="planning" allStages={['new', 'planning']} onSelect={vi.fn()} />)
    expect(screen.getByText('planning')).toBeInTheDocument()
  })

  it('opens a popover on click and lists all stages', () => {
    render(<StagePill currentStage="new" allStages={['new', 'planning', 'building']} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /stage:/i }))
    expect(screen.getByRole('menuitem', { name: 'new' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'planning' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'building' })).toBeInTheDocument()
  })

  it('calls onSelect when a stage is chosen', () => {
    const onSelect = vi.fn()
    render(<StagePill currentStage="new" allStages={['new', 'planning']} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /stage:/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'planning' }))
    expect(onSelect).toHaveBeenCalledWith('planning')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/shared/components/StagePill.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement**

Create `src/renderer/shared/components/StagePill.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react'

interface StagePillProps {
  currentStage: string
  allStages: string[]
  onSelect: (stage: string) => void
}

export function StagePill({ currentStage, allStages, onSelect }: StagePillProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs px-2 py-0.5 rounded-full bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border flex items-center gap-1"
        aria-label={`Stage: ${currentStage}`}
      >
        <span>Stage:</span>
        <span className="text-text-primary font-medium">{currentStage}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-1 z-10 min-w-[140px] bg-bg-secondary border border-border rounded shadow-lg py-1">
          {allStages.map(s => (
            <button
              key={s}
              role="menuitem"
              onClick={() => { onSelect(s); setOpen(false) }}
              className={`block w-full text-left px-3 py-1 text-xs hover:bg-bg-tertiary ${s === currentStage ? 'text-accent' : 'text-text-primary'}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/shared/components/StagePill.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write story**

Create `src/renderer/shared/components/StagePill.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { StagePill } from './StagePill'

const meta: Meta<typeof StagePill> = {
  title: 'Commands/StagePill',
  component: StagePill,
}
export default meta
type Story = StoryObj<typeof StagePill>

export const Default: Story = {
  args: {
    currentStage: 'planning',
    allStages: ['new', 'building', 'planning', 'verifying'],
    onSelect: () => undefined,
  },
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/shared/components/StagePill.tsx src/renderer/shared/components/StagePill.test.tsx src/renderer/shared/components/StagePill.stories.tsx
git commit -m "feat(commands): add StagePill component"
```

---

## Task 13: SetupCta component

**Files:**
- Create: `src/renderer/shared/components/SetupCta.tsx`
- Test: `src/renderer/shared/components/SetupCta.test.tsx`
- Story: `src/renderer/shared/components/SetupCta.stories.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/renderer/shared/components/SetupCta.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SetupCta } from './SetupCta'

describe('SetupCta', () => {
  it('renders primary button and secondary link', () => {
    render(<SetupCta onSetup={vi.fn()} onStartBlank={vi.fn()} />)
    expect(screen.getByRole('button', { name: /set up commands/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start with an empty config/i })).toBeInTheDocument()
  })

  it('invokes onSetup', () => {
    const onSetup = vi.fn()
    render(<SetupCta onSetup={onSetup} onStartBlank={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /set up commands/i }))
    expect(onSetup).toHaveBeenCalled()
  })

  it('invokes onStartBlank', () => {
    const onStartBlank = vi.fn()
    render(<SetupCta onSetup={vi.fn()} onStartBlank={onStartBlank} />)
    fireEvent.click(screen.getByRole('button', { name: /start with an empty config/i }))
    expect(onStartBlank).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/shared/components/SetupCta.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/renderer/shared/components/SetupCta.tsx`:

```tsx
interface SetupCtaProps {
  onSetup: () => void
  onStartBlank: () => void
}

export function SetupCta({ onSetup, onStartBlank }: SetupCtaProps) {
  return (
    <div className="px-3 py-4 border-b border-border flex flex-col items-stretch gap-2">
      <button
        onClick={onSetup}
        className="w-full px-3 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 transition-colors"
      >
        Set up commands
      </button>
      <button
        onClick={onStartBlank}
        className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
      >
        Or start with an empty config →
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/shared/components/SetupCta.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add story**

Create `src/renderer/shared/components/SetupCta.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { SetupCta } from './SetupCta'

const meta: Meta<typeof SetupCta> = {
  title: 'Commands/SetupCta',
  component: SetupCta,
}
export default meta
type Story = StoryObj<typeof SetupCta>

export const Default: Story = { args: { onSetup: () => undefined, onStartBlank: () => undefined } }
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/shared/components/SetupCta.tsx src/renderer/shared/components/SetupCta.test.tsx src/renderer/shared/components/SetupCta.stories.tsx
git commit -m "feat(commands): add SetupCta component"
```

---

## Task 14: ActionButtons rewrite

**Files:**
- Modify: `src/renderer/shared/components/ActionButtons.tsx`
- Test: `src/renderer/shared/components/ActionButtons.test.tsx`

- [ ] **Step 1: Replace tests**

Replace contents of `src/renderer/shared/components/ActionButtons.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionButtons } from './ActionButtons'

vi.mock('../../features/commands/actionExecutor', () => ({
  executeAction: vi.fn().mockResolvedValue({ success: true }),
}))

const condState = {
  'has-changes': true, 'clean': false, 'merging': false, 'conflicts': false,
  'no-tracking': false, 'ahead': false, 'behind': false, 'behind-main': false,
  'on-main': false, 'in-progress': false, 'pushed': false, 'empty': false,
  'open': false, 'merged': false, 'closed': false, 'no-pr': true,
  'has-write-access': true, 'allow-approve-and-merge': true,
  'checks-passed': true, 'has-issue': false, 'no-devcontainer': false, 'review': false,
} as any

const ctx = { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }

beforeEach(() => {
  ;(globalThis as any).window = {}
})

describe('ActionButtons', () => {
  it('renders the Setup CTA when actions is null/empty', () => {
    render(
      <ActionButtons
        actions={[]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        onSetup={vi.fn()}
        onStartBlank={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /set up commands/i })).toBeInTheDocument()
  })

  it('renders a button with two-line content (label + slash subtitle)', () => {
    render(
      <ActionButtons
        actions={[{ id: 'plan', label: 'Plan', template: '/plan' }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        onSetup={vi.fn()}
        onStartBlank={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.getByText('/plan')).toBeInTheDocument()
  })

  it('omits subtitle when template does not start with /', () => {
    render(
      <ActionButtons
        actions={[{ id: 'c', label: 'Commit', template: 'Commit this' }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        onSetup={vi.fn()}
        onStartBlank={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    expect(screen.queryByText('/Commit')).toBeNull()
  })

  it('hides the stage pill when no action references stages or setStage', () => {
    render(
      <ActionButtons
        actions={[{ id: 'a', label: 'A', template: '/x' }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        onSetup={vi.fn()}
        onStartBlank={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /stage:/i })).toBeNull()
  })

  it('shows the stage pill when any action references stages', () => {
    render(
      <ActionButtons
        actions={[{ id: 'a', label: 'A', template: '/x', stages: ['planning'] }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        onSetup={vi.fn()}
        onStartBlank={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /stage:/i })).toBeInTheDocument()
  })

  it('runs action directly when template has no user args', async () => {
    const { executeAction } = await import('../../features/commands/actionExecutor')
    render(
      <ActionButtons
        actions={[{ id: 'a', label: 'A', template: '/x' }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        onSetup={vi.fn()}
        onStartBlank={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('A'))
    expect(executeAction).toHaveBeenCalled()
  })

  it('opens ArgDialog when template has user args', async () => {
    render(
      <ActionButtons
        actions={[{ id: 'a', label: 'A', template: '/x {topic}' }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        onSetup={vi.fn()}
        onStartBlank={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('A'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/shared/components/ActionButtons.test.tsx`
Expected: FAIL — old component shape.

- [ ] **Step 3: Rewrite ActionButtons**

Replace `src/renderer/shared/components/ActionButtons.tsx`:

```tsx
import { useState, useCallback, useMemo } from 'react'
import type { ActionDefinition, ConditionState } from '../../features/commands/commandsConfig'
import type { SubContext, ArgValue } from '../../features/commands/templateSubstitute'
import { isVisible, discoverStages } from '../../features/commands/commandsConfig'
import { parseTemplate } from '../../features/commands/templateParser'
import { executeAction, type ActionExecutionContext } from '../../features/commands/actionExecutor'
import { useAgentStore } from '../../store/agents'
import { ENABLE_AGENT_SDK } from '../../../shared/featureFlags'
import { DialogErrorBanner } from './ErrorBanner'
import { StagePill } from './StagePill'
import { ArgDialog } from './ArgDialog'
import { SetupCta } from './SetupCta'

interface ActionButtonsProps {
  actions: ActionDefinition[] | null
  conditionState: ConditionState
  templateVars: SubContext
  currentStage: string
  directory: string
  agentPtyId?: string
  agentId?: string | null
  onGitStatusRefresh?: () => void
  onSwitchTab?: (tab: string) => void
  surface?: string
  onOpenCommandsEditor?: () => void
  onSetSessionStage: (stage: string) => void
  onSetup: () => void
  onStartBlank: () => void
}

const STYLE_CLASSES: Record<string, string> = {
  primary: 'bg-accent text-white hover:bg-accent/80',
  secondary: 'bg-bg-tertiary text-text-primary hover:bg-bg-secondary',
  accent: 'bg-purple-600 text-white hover:bg-purple-500',
  danger: 'bg-orange-600 text-white hover:bg-orange-500',
}

function slashSubtitle(template: string): string | null {
  if (template.includes('\n')) return null
  if (!template.startsWith('/')) return null
  return template.split(/\s+/)[0]
}

export function ActionButtons(props: ActionButtonsProps) {
  const {
    actions, conditionState, templateVars, currentStage, directory,
    agentPtyId, agentId, onGitStatusRefresh, onSwitchTab, surface = 'source-control',
    onOpenCommandsEditor, onSetSessionStage, onSetup, onStartBlank,
  } = props

  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [argDialogAction, setArgDialogAction] = useState<ActionDefinition | null>(null)

  const allActions = actions ?? []
  const visible = allActions.filter(a => isVisible(a, conditionState, currentStage, surface))
  const stagesShown = useMemo(() =>
    allActions.some(a => a.stages || typeof a.setStage === 'string'),
  [allActions])
  const stageOptions = useMemo(() => discoverStages(allActions, currentStage), [allActions, currentStage])

  const isApiMode = ENABLE_AGENT_SDK && agentId
    ? useAgentStore.getState().agents.find(a => a.id === agentId)?.connectionMode === 'api'
    : false

  const dispatch = useCallback(async (action: ActionDefinition, argValues: Record<string, ArgValue>) => {
    if (action.switchTab && onSwitchTab) onSwitchTab(action.switchTab)
    setLoadingIds(prev => new Set(prev).add(action.id))
    setErrors(prev => { const { [action.id]: _, ...rest } = prev; return rest })

    const ctx: ActionExecutionContext = {
      directory, agentPtyId, agentId, templateVars, argValues, onGitStatusRefresh,
    }
    const result = await executeAction(action, ctx)

    setLoadingIds(prev => { const next = new Set(prev); next.delete(action.id); return next })
    if (!result.success && result.error) setErrors(prev => ({ ...prev, [action.id]: result.error! }))
  }, [directory, agentPtyId, agentId, templateVars, onGitStatusRefresh, onSwitchTab])

  const onClick = (action: ActionDefinition) => {
    const parsed = parseTemplate(action.template)
    if (parsed.args.length === 0) {
      void dispatch(action, {})
      return
    }
    setArgDialogAction(action)
  }

  if (allActions.length === 0) {
    return <SetupCta onSetup={onSetup} onStartBlank={onStartBlank} />
  }

  return (
    <div className="px-3 py-2 border-b border-border flex flex-col gap-1.5">
      {stagesShown && (
        <div className="flex justify-start pb-1">
          <StagePill currentStage={currentStage} allStages={stageOptions} onSelect={onSetSessionStage} />
        </div>
      )}
      {visible.map(action => {
        const subtitle = slashSubtitle(action.template)
        const style = STYLE_CLASSES[action.style ?? 'secondary']
        const isLoading = loadingIds.has(action.id)
        const isAgentTemplate = !action.template.startsWith('!')
        const disabled = isLoading || (isAgentTemplate && !agentPtyId && !isApiMode)
        const err = errors[action.id]

        return (
          <div key={action.id}>
            <button
              onClick={() => onClick(action)}
              disabled={disabled}
              title={action.description ?? (disabled && isAgentTemplate ? 'No agent available' : undefined)}
              className={`w-full px-3 py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-start ${style}`}
            >
              <span className="text-sm">{isLoading ? `${action.label}…` : action.label}</span>
              {subtitle && <span className="text-[10px] opacity-70 font-mono">{subtitle}</span>}
            </button>
            {err && (
              <div className="mt-1">
                <DialogErrorBanner error={err} label={`${action.label} failed`} onDismiss={() => setErrors(p => { const { [action.id]: _, ...r } = p; return r })} />
              </div>
            )}
          </div>
        )
      })}
      {onOpenCommandsEditor && (
        <button
          onClick={onOpenCommandsEditor}
          className="mt-1 text-xs text-text-tertiary hover:text-text-primary transition-colors"
          data-testid="edit-commands-link"
        >
          edit commands
        </button>
      )}

      {argDialogAction && (
        <ArgDialog
          title={argDialogAction.label}
          description={argDialogAction.description}
          template={argDialogAction.template}
          argsMeta={argDialogAction.args ?? []}
          context={templateVars}
          onRun={(values) => { const a = argDialogAction; setArgDialogAction(null); void dispatch(a, values) }}
          onCancel={() => setArgDialogAction(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/shared/components/ActionButtons.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shared/components/ActionButtons.tsx src/renderer/shared/components/ActionButtons.test.tsx
git commit -m "feat(commands): rewrite ActionButtons with stage pill, arg dialog, setup CTA"
```

---

## Task 15: Pack-picker dialog

**Files:**
- Modify: `src/renderer/panels/explorer/tabs/source-control/CommandsSetupDialog.tsx`
- Test: `src/renderer/panels/explorer/tabs/source-control/CommandsSetupDialog.test.tsx`

- [ ] **Step 1: Replace tests**

Replace contents of `CommandsSetupDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommandsSetupDialog } from './CommandsSetupDialog'

const fakeFs = {
  exists: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}

beforeEach(() => {
  fakeFs.exists.mockReset()
  fakeFs.readFile.mockReset()
  ;(globalThis as any).window = {
    fs: fakeFs,
    app: { homedir: vi.fn().mockResolvedValue('/Users/test') },
  }
})

describe('CommandsSetupDialog', () => {
  it('renders three pack cards with Basics first', () => {
    render(<CommandsSetupDialog onClose={vi.fn()} onInstalled={vi.fn()} />)
    const cards = screen.getAllByTestId(/pack-card-/)
    expect(cards.map(c => c.dataset.testid)).toEqual(['pack-card-basics', 'pack-card-superpowers', 'pack-card-gstack'])
  })

  it('labels Basics as Recommended', () => {
    render(<CommandsSetupDialog onClose={vi.fn()} onInstalled={vi.fn()} />)
    expect(screen.getByText(/recommended/i)).toBeInTheDocument()
  })

  it('writes the chosen pack to ~/.broomy/commands.json and calls onInstalled', async () => {
    fakeFs.exists.mockResolvedValue(false)
    const onInstalled = vi.fn()
    render(<CommandsSetupDialog onClose={vi.fn()} onInstalled={onInstalled} />)
    fireEvent.click(screen.getByTestId('pack-card-basics'))
    fireEvent.click(screen.getByRole('button', { name: /install/i }))
    // wait one tick
    await new Promise(r => setTimeout(r, 0))
    expect(fakeFs.writeFile).toHaveBeenCalledWith(
      '/Users/test/.broomy/commands.json',
      expect.stringContaining('"id": "commit"'),
    )
    expect(onInstalled).toHaveBeenCalled()
  })

  it('prompts to replace existing user commands', async () => {
    fakeFs.exists.mockResolvedValue(true)
    render(<CommandsSetupDialog onClose={vi.fn()} onInstalled={vi.fn()} />)
    fireEvent.click(screen.getByTestId('pack-card-basics'))
    fireEvent.click(screen.getByRole('button', { name: /install/i }))
    await new Promise(r => setTimeout(r, 0))
    expect(screen.getByText(/replace existing user commands/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/panels/explorer/tabs/source-control/CommandsSetupDialog.test.tsx`
Expected: FAIL — pack picker not implemented yet.

- [ ] **Step 3: Rewrite the dialog**

Replace `CommandsSetupDialog.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { PACKS } from '../../../../features/commands/packs'
import { getUserCommandsConfigPath, userCommandsDir } from '../../../../features/commands/userConfigPath'
import { CURRENT_CONFIG_VERSION } from '../../../../features/commands/commandsConfig'

interface CommandsSetupDialogProps {
  onClose: () => void
  onInstalled: () => void
}

export function CommandsSetupDialog({ onClose, onInstalled }: CommandsSetupDialogProps) {
  const [selectedId, setSelectedId] = useState<string>(PACKS[0]?.id ?? 'basics')
  const [installing, setInstalling] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [home, setHome] = useState<string>('')

  useEffect(() => { void window.app.homedir().then(setHome) }, [])

  async function doInstall() {
    setInstalling(true)
    try {
      const pack = PACKS.find(p => p.id === selectedId)
      if (!pack) return
      const path = await getUserCommandsConfigPath()
      await window.fs.mkdir(userCommandsDir(home))
      const config = { version: CURRENT_CONFIG_VERSION, actions: pack.actions }
      await window.fs.writeFile(path, JSON.stringify(config, null, 2))
      onInstalled()
      onClose()
    } finally {
      setInstalling(false)
    }
  }

  async function onInstallClick() {
    const path = await getUserCommandsConfigPath()
    const exists = await window.fs.exists(path)
    if (exists) {
      setConfirmReplace(true)
      return
    }
    void doInstall()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div role="dialog" className="bg-bg-secondary border border-border rounded-lg shadow-xl w-full max-w-2xl mx-4 p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-text-primary">Set up commands</h3>
        <p className="text-sm text-text-secondary">Pick a starter set. You can edit anything afterwards.</p>

        <div className="grid grid-cols-3 gap-3">
          {PACKS.map((p, i) => {
            const selected = selectedId === p.id
            return (
              <button
                key={p.id}
                data-testid={`pack-card-${p.id}`}
                onClick={() => setSelectedId(p.id)}
                className={`text-left p-3 rounded border transition-colors ${selected ? 'border-accent bg-bg-tertiary' : 'border-border bg-bg-primary hover:bg-bg-tertiary'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{p.name}</span>
                  {i === 0 && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/20 text-accent">Recommended</span>}
                </div>
                <div className="text-xs text-text-secondary mt-1">{p.description}</div>
                <div className="text-[11px] text-text-tertiary mt-2">{p.actions.length} commands</div>
              </button>
            )
          })}
        </div>

        <p className="text-xs text-text-tertiary">Installs to <code className="font-mono">~/.broomy/commands.json</code></p>

        {confirmReplace && (
          <div className="p-2 rounded border border-yellow-500/30 bg-yellow-500/10 text-sm text-yellow-300">
            Replace existing user commands?
            <div className="flex gap-2 mt-2">
              <button onClick={() => { setConfirmReplace(false); void doInstall() }} className="px-3 py-1 text-xs rounded bg-accent text-white">Replace</button>
              <button onClick={() => setConfirmReplace(false)} className="px-3 py-1 text-xs">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary">Cancel</button>
          <button
            onClick={() => void onInstallClick()}
            disabled={installing}
            className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/panels/explorer/tabs/source-control/CommandsSetupDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/explorer/tabs/source-control/CommandsSetupDialog.tsx src/renderer/panels/explorer/tabs/source-control/CommandsSetupDialog.test.tsx
git commit -m "feat(commands): rewrite setup dialog as pack picker"
```

---

## Task 16: CommandsEditor two-column layout

**Files:**
- Modify: `src/renderer/panels/fileViewer/CommandsEditor.tsx`
- Test: `src/renderer/panels/fileViewer/CommandsEditor.test.tsx`

This is the biggest UI rewrite. Implement it as one task to keep the editor coherent.

- [ ] **Step 1: Replace tests**

Replace contents of `CommandsEditor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommandsEditor } from './CommandsEditor'

const fakeFs = {
  exists: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  watch: vi.fn().mockResolvedValue({ success: true }),
  unwatch: vi.fn().mockResolvedValue(undefined),
  onChange: vi.fn().mockReturnValue(() => undefined),
}

beforeEach(() => {
  fakeFs.exists.mockReset()
  fakeFs.readFile.mockReset()
  fakeFs.writeFile.mockClear()
  ;(globalThis as any).window = {
    fs: fakeFs,
    app: { homedir: vi.fn().mockResolvedValue('/Users/test') },
  }
})

describe('CommandsEditor', () => {
  it('shows User/Project tabs', async () => {
    fakeFs.exists.mockResolvedValue(false)
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    expect(await screen.findByRole('tab', { name: /user/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /project/i })).toBeInTheDocument()
  })

  it('lists user commands on the left when User tab is selected', async () => {
    fakeFs.exists.mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    fakeFs.readFile.mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'My Cmd', template: '/x' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    expect(await screen.findByText('My Cmd')).toBeInTheDocument()
    expect(screen.getByText('/x')).toBeInTheDocument()
  })

  it('selecting a row populates the right pane', async () => {
    fakeFs.exists.mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    fakeFs.readFile.mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'My Cmd', template: '/x', description: 'help' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('My Cmd'))
    expect(screen.getByDisplayValue('My Cmd')).toBeInTheDocument()
    expect(screen.getByDisplayValue('help')).toBeInTheDocument()
    expect(screen.getByDisplayValue('/x')).toBeInTheDocument()
  })

  it('args table populates from template placeholders', async () => {
    fakeFs.exists.mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    fakeFs.readFile.mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'L', template: '/plan {topic} --depth {depth}' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('L'))
    expect(screen.getByText('topic')).toBeInTheDocument()
    expect(screen.getByText('depth')).toBeInTheDocument()
    expect(screen.getByText(/optional/i)).toBeInTheDocument()
  })

  it('Save writes the file', async () => {
    fakeFs.exists.mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    fakeFs.readFile.mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'A', template: 't' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('A'))
    fireEvent.change(screen.getByDisplayValue('A'), { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(fakeFs.writeFile).toHaveBeenCalled())
  })

  it('switching to Project tab with no file shows Add CTA', async () => {
    fakeFs.exists.mockResolvedValue(false)
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('tab', { name: /project/i }))
    expect(screen.getByRole('button', { name: /add project commands/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/renderer/panels/fileViewer/CommandsEditor.test.tsx`
Expected: FAIL — old layout.

- [ ] **Step 3: Rewrite the editor**

Replace `src/renderer/panels/fileViewer/CommandsEditor.tsx` with the implementation below. (For brevity, the new file is shown as a single component; you may split into sub-files if it grows beyond ~400 lines.)

```tsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import type { ActionDefinition, CommandsConfig } from '../../features/commands/commandsConfig'
import {
  loadConfigFromPath, projectCommandsConfigPath,
  CURRENT_CONFIG_VERSION, discoverStages,
} from '../../features/commands/commandsConfig'
import { getUserCommandsConfigPath, userCommandsDir } from '../../features/commands/userConfigPath'
import { parseTemplate } from '../../features/commands/templateParser'
import { ShowWhenPicker } from '../../shared/components/ShowWhenPicker'
import { DialogErrorBanner } from '../../shared/components/ErrorBanner'

type Tab = 'user' | 'project'

interface CommandsEditorProps {
  directory: string
  onClose: () => void
}

const STYLE_OPTIONS = ['primary', 'secondary', 'accent', 'danger'] as const
const SURFACE_OPTIONS = [
  { value: 'source-control', label: 'Source Control' },
  { value: 'review', label: 'Review' },
] as const
const SWITCH_TAB_OPTIONS = [
  { value: '', label: '(none)' },
  { value: 'source-control', label: 'Source Control' },
  { value: 'files', label: 'Files' },
  { value: 'search', label: 'Search' },
  { value: 'recent', label: 'Recent Files' },
  { value: 'review', label: 'Review' },
] as const

function newAction(): ActionDefinition {
  return { id: `action-${Date.now()}`, label: 'New action', template: '/' }
}

function normalizeSurface(s: string | string[] | undefined): string[] {
  if (!s) return ['source-control']
  return Array.isArray(s) ? s : [s]
}

function slashSubtitle(template: string): string | null {
  if (template.includes('\n')) return null
  if (!template.startsWith('/')) return null
  return template.split(/\s+/)[0]
}

export function CommandsEditor({ directory, onClose }: CommandsEditorProps) {
  const [tab, setTab] = useState<Tab>('user')
  const [userActions, setUserActions] = useState<ActionDefinition[] | null>(null)
  const [projectActions, setProjectActions] = useState<ActionDefinition[] | null>(null)
  const [userPath, setUserPath] = useState<string>('')
  const [userExists, setUserExists] = useState<boolean | null>(null)
  const [projectExists, setProjectExists] = useState<boolean | null>(null)
  const [userDirty, setUserDirty] = useState(false)
  const [projectDirty, setProjectDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const projectPath = projectCommandsConfigPath(directory)

  const load = useCallback(async () => {
    const up = await getUserCommandsConfigPath()
    setUserPath(up)
    const u = await loadConfigFromPath(up)
    const p = await loadConfigFromPath(projectPath)
    if (u === null) { setUserActions(null); setUserExists(false) }
    else if (!u.ok) { setUserActions(null); setUserExists(true); setLoadError(u.error) }
    else { setUserActions(u.config.actions); setUserExists(true) }
    if (p === null) { setProjectActions(null); setProjectExists(false) }
    else if (!p.ok) { setProjectActions(null); setProjectExists(true); setLoadError(p.error) }
    else { setProjectActions(p.config.actions); setProjectExists(true) }
    setUserDirty(false); setProjectDirty(false)
  }, [projectPath])

  useEffect(() => { void load() }, [load])

  const actions = tab === 'user' ? userActions : projectActions
  const setActions = tab === 'user' ? setUserActions : setProjectActions
  const setDirty = tab === 'user' ? setUserDirty : setProjectDirty
  const dirty = tab === 'user' ? userDirty : projectDirty

  const selected = useMemo(() => actions?.find(a => a.id === selectedId) ?? null, [actions, selectedId])
  const stageOptions = useMemo(() => discoverStages(actions ?? [], 'new'), [actions])

  function updateSelected(patch: Partial<ActionDefinition>) {
    if (!selected || !actions) return
    setActions(actions.map(a => a.id === selected.id ? { ...a, ...patch } : a))
    setDirty(true)
  }

  function addAction() {
    const a = newAction()
    setActions([...(actions ?? []), a])
    setSelectedId(a.id)
    setDirty(true)
  }

  function deleteSelected() {
    if (!selected || !actions) return
    setActions(actions.filter(a => a.id !== selected.id))
    setSelectedId(null)
    setDirty(true)
  }

  function switchTab(next: Tab) {
    if (dirty) {
      const proceed = window.confirm(`You have unsaved changes to ${tab === 'user' ? 'User' : 'Project'} commands. Discard?`)
      if (!proceed) return
    }
    setTab(next)
    setSelectedId(null)
  }

  async function save() {
    setSaving(true)
    try {
      const path = tab === 'user' ? userPath : projectPath
      const dir = tab === 'user' ? userCommandsDir(userPath.replace(/\/\.broomy\/commands\.json$/, ''))
                                 : `${directory}/.broomy`
      await window.fs.mkdir(dir)
      const config: CommandsConfig = { version: CURRENT_CONFIG_VERSION, actions: actions ?? [] }
      await window.fs.writeFile(path, JSON.stringify(config, null, 2))
      if (tab === 'user') { setUserExists(true); setUserDirty(false) }
      else { setProjectExists(true); setProjectDirty(false) }
    } finally {
      setSaving(false)
    }
  }

  async function addProjectFile() {
    setProjectActions([])
    setProjectDirty(true)
    setProjectExists(true)
    await window.fs.mkdir(`${directory}/.broomy`)
  }

  return (
    <div className="h-full flex flex-col">
      <Header tab={tab} setTab={switchTab} dirty={dirty} onClose={onClose} onSave={save} saving={saving} />

      {loadError && (
        <div className="p-3">
          <DialogErrorBanner error={loadError} onDismiss={() => setLoadError(null)} />
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <div className="w-[280px] border-r border-border bg-bg-secondary flex flex-col">
          {actions === null ? (
            <EmptyPane tab={tab} onAddProjectFile={() => void addProjectFile()} />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {actions.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full text-left px-2 py-2 rounded ${selectedId === a.id ? 'bg-bg-tertiary border-l-2 border-accent' : 'hover:bg-bg-tertiary'}`}
                  >
                    <div className="text-sm text-text-primary truncate">{a.label}</div>
                    <div className="text-[11px] text-text-tertiary font-mono truncate">
                      {slashSubtitle(a.template) ?? (a.template.includes('\n') ? 'text block' : a.template)}
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={addAction} className="p-2 m-2 text-sm rounded border border-dashed border-border text-text-secondary hover:text-text-primary">
                + Add command
              </button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {actions === null ? (
            <div className="text-sm text-text-secondary">{tab === 'user' ? 'Set up your commands using the picker.' : 'No project commands.'}</div>
          ) : selected ? (
            <Detail selected={selected} onUpdate={updateSelected} onDelete={deleteSelected} stageOptions={stageOptions} />
          ) : (
            <div className="text-sm text-text-secondary">Select a command to edit, or click + Add command.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Header({ tab, setTab, dirty, onClose, onSave, saving }: {
  tab: Tab; setTab: (t: Tab) => void; dirty: boolean; onClose: () => void; onSave: () => Promise<void>; saving: boolean
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-secondary">
      <div role="tablist" className="flex gap-1">
        <button role="tab" aria-selected={tab === 'user'} onClick={() => setTab('user')}
          className={`px-3 py-1 text-sm rounded ${tab === 'user' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary'}`}>
          User (~/.broomy)
        </button>
        <button role="tab" aria-selected={tab === 'project'} onClick={() => setTab('project')}
          className={`px-3 py-1 text-sm rounded ${tab === 'project' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary'}`}>
          Project (.broomy/)
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => void onSave()} disabled={!dirty || saving}
          className="px-3 py-1 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {dirty && <span className="w-2 h-2 rounded-full bg-accent" />}
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary px-1">✕</button>
      </div>
    </div>
  )
}

function EmptyPane({ tab, onAddProjectFile }: { tab: Tab; onAddProjectFile: () => void }) {
  if (tab === 'project') {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full text-center space-y-2">
        <p className="text-sm text-text-secondary">No project commands.</p>
        <button onClick={onAddProjectFile} className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/80">
          Add project commands
        </button>
      </div>
    )
  }
  return <div className="p-4 text-sm text-text-secondary">No user commands.</div>
}

function Detail({ selected, onUpdate, onDelete, stageOptions }: {
  selected: ActionDefinition
  onUpdate: (patch: Partial<ActionDefinition>) => void
  onDelete: () => void
  stageOptions: string[]
}) {
  const parsed = parseTemplate(selected.template)
  const argsMeta = selected.args ?? []
  const mode: 'one-line' | 'block' = selected.template.includes('\n') ? 'block' : 'one-line'

  function updateArgMeta(name: string, patch: Partial<{ description: string; default: string }>) {
    const existing = argsMeta.find(a => a.name === name)
    const next = existing ? argsMeta.map(a => a.name === name ? { ...a, ...patch } : a)
                          : [...argsMeta, { name, ...patch }]
    onUpdate({ args: next })
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <Field label="Label">
        <input type="text" value={selected.label} onChange={e => onUpdate({ label: e.target.value })}
          className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary text-text-primary focus:outline-none focus:border-accent" />
      </Field>

      <Field label="Description" hint="Shown as a tooltip and in the arg dialog.">
        <input type="text" value={selected.description ?? ''} onChange={e => onUpdate({ description: e.target.value || undefined })}
          className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary text-text-primary focus:outline-none focus:border-accent" />
      </Field>

      <Field label="Command" hint={mode === 'one-line' ? "Use {name} for args; --flag {name} makes the arg optional." : "Text-block mode."}>
        {mode === 'one-line' ? (
          <input type="text" value={selected.template} onChange={e => onUpdate({ template: e.target.value })}
            className="w-full px-2 py-1.5 text-sm font-mono rounded border border-border bg-bg-secondary text-text-primary focus:outline-none focus:border-accent" />
        ) : (
          <textarea value={selected.template} onChange={e => onUpdate({ template: e.target.value })}
            rows={6} className="w-full px-2 py-1.5 text-sm font-mono rounded border border-border bg-bg-secondary text-text-primary focus:outline-none focus:border-accent" />
        )}
      </Field>

      {parsed.args.length > 0 && (
        <Field label={`Arguments (${parsed.args.length} detected)`}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-tertiary">
                <th className="text-left pr-2 pb-1">Name</th>
                <th className="text-left pr-2 pb-1">Description</th>
                <th className="text-left pr-2 pb-1">Default</th>
                <th className="text-left pb-1"></th>
              </tr>
            </thead>
            <tbody>
              {parsed.args.map(a => {
                const meta = argsMeta.find(m => m.name === a.name)
                return (
                  <tr key={a.name}>
                    <td className="pr-2 py-0.5 font-mono">{a.name}</td>
                    <td className="pr-2 py-0.5">
                      <input type="text" value={meta?.description ?? ''}
                        onChange={e => updateArgMeta(a.name, { description: e.target.value })}
                        className="w-full px-1 py-0.5 text-xs rounded border border-border bg-bg-primary text-text-primary" />
                    </td>
                    <td className="pr-2 py-0.5">
                      <input type="text" value={meta?.default ?? ''}
                        onChange={e => updateArgMeta(a.name, { default: e.target.value })}
                        className="w-full px-1 py-0.5 text-xs rounded border border-border bg-bg-primary text-text-primary" />
                    </td>
                    <td className="py-0.5">{a.optional && <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">optional</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Field>
      )}

      <Field label="Show when">
        <ShowWhenPicker showWhen={selected.showWhen ?? []} onChange={s => onUpdate({ showWhen: s })} />
      </Field>

      <Field label="Stages" hint="Show this command only in these stages (leave empty for any).">
        <StageChips selected={selected.stages ?? []} options={stageOptions} onChange={v => onUpdate({ stages: v.length === 0 ? undefined : v })} />
      </Field>

      <Field label="Set stage" hint="Stage to write after running.">
        <select value={selected.setStage === null ? '__null' : (selected.setStage ?? '__none')}
          onChange={e => {
            const v = e.target.value
            if (v === '__none') onUpdate({ setStage: undefined })
            else if (v === '__null') onUpdate({ setStage: null })
            else onUpdate({ setStage: v })
          }}
          className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary">
          <option value="__none">(no change)</option>
          <option value="__null">reset to "new"</option>
          {stageOptions.filter(s => s !== 'new').map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>

      <Field label="Style">
        <select value={selected.style ?? 'secondary'} onChange={e => onUpdate({ style: e.target.value as ActionDefinition['style'] })}
          className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary">
          {STYLE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>

      <Field label="Surface">
        <div className="flex gap-2 text-sm">
          {SURFACE_OPTIONS.map(opt => {
            const surfaces = normalizeSurface(selected.surface)
            const checked = surfaces.includes(opt.value)
            return (
              <label key={opt.value} className="flex items-center gap-1">
                <input type="checkbox" checked={checked} onChange={() => {
                  const next = checked ? surfaces.filter(s => s !== opt.value) : [...surfaces, opt.value]
                  onUpdate({ surface: next.length === 0 ? undefined : next.length === 1 ? next[0] : next })
                }} className="accent-accent" />
                {opt.label}
              </label>
            )
          })}
        </div>
      </Field>

      <Field label="Switch tab">
        <select value={selected.switchTab ?? ''} onChange={e => onUpdate({ switchTab: e.target.value || undefined })}
          className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary">
          {SWITCH_TAB_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </Field>

      <div className="pt-3 border-t border-border">
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300">Delete command</button>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-text-secondary">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-text-tertiary">{hint}</p>}
    </div>
  )
}

function StageChips({ selected, options, onChange }: {
  selected: string[]; options: string[]; onChange: (v: string[]) => void
}) {
  function toggle(s: string) {
    onChange(selected.includes(s) ? selected.filter(x => x !== s) : [...selected, s])
  }
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(s => {
        const on = selected.includes(s)
        return (
          <button key={s} type="button" onClick={() => toggle(s)}
            className={`px-2 py-0.5 text-xs rounded-full border ${on ? 'bg-accent text-white border-accent' : 'bg-bg-primary border-border text-text-secondary'}`}>
            {s}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/renderer/panels/fileViewer/CommandsEditor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/fileViewer/CommandsEditor.tsx src/renderer/panels/fileViewer/CommandsEditor.test.tsx
git commit -m "feat(commands): rewrite editor as two-column with User/Project tabs"
```

---

## Task 17: Wire SourceControl to new hook + remove setup banner

**Files:**
- Modify: `src/renderer/panels/explorer/tabs/source-control/SourceControl.tsx`
- Modify: `src/renderer/panels/explorer/tabs/source-control/SCWorkingView.tsx`
- Delete: `src/renderer/panels/explorer/tabs/source-control/CommandsSetupBanner.tsx`
- Delete: `src/renderer/panels/explorer/tabs/source-control/CommandsSetupBanner.stories.tsx`

- [ ] **Step 1: Inspect call site**

Read `SourceControl.tsx:74-258` (already in your context from exploration). Note: it currently passes `actions={commandsConfig?.actions ?? null}` to `SCWorkingView`, which threads them to `ActionButtons`. We will pass the merged actions plus stage handling.

Read `src/renderer/panels/explorer/tabs/source-control/SCWorkingView.tsx`'s ActionButtons usage; you'll add new props.

- [ ] **Step 2: Update SourceControl.tsx**

In `SourceControl.tsx`:

1. Replace the line `const { config: commandsConfig, exists: commandsExists } = useCommandsConfig(directory)` with:
```ts
const { merged: commandsConfig, userExists, projectExists } = useCommandsConfig(directory)
const commandsExists = userExists || projectExists
```

2. Remove the import and usage of `CommandsSetupBanner`. Replace the JSX `{!commandsExists && (<CommandsSetupBanner onSetup={() => setShowSetupDialog(true)} />)}` block with nothing — the setup CTA is now rendered by `ActionButtons` itself when `actions` is empty.

3. Read the active session's `stage` from the session store and pass it through to SCWorkingView. Add near the top of the component:
```ts
const stage = useSessionStore(s => s.sessions.find(x => x.id === s.activeSessionId)?.stage ?? 'new')
const setSessionStage = useSessionStore(s => s.setSessionStage)
const activeSessionId = useSessionStore(s => s.activeSessionId)
```

4. In the props passed to `<SCWorkingView ...>`, replace `actions={commandsConfig?.actions ?? null}` with:
```tsx
actions={commandsConfig?.actions ?? null}
currentStage={stage}
onSetSessionStage={(next) => activeSessionId && setSessionStage(activeSessionId, next)}
onSetup={() => setShowSetupDialog(true)}
onStartBlank={onOpenCommandsEditor ?? (() => undefined)}
```

5. Update the `<CommandsSetupDialog ...>` invocation: pass `onInstalled` instead of `onCreated`, and remove the `directory` prop:
```tsx
<CommandsSetupDialog
  onClose={() => setShowSetupDialog(false)}
  onInstalled={() => { /* file watcher will refresh */ }}
/>
```

- [ ] **Step 3: Update SCWorkingView.tsx**

Read the file. Find the `<ActionButtons ... />` call site. Add the new required props passed in from SourceControl:

```tsx
<ActionButtons
  actions={actions}
  conditionState={conditionState}
  templateVars={templateVars}
  currentStage={currentStage}
  directory={directory}
  agentPtyId={agentPtyId}
  agentId={agentId}
  onGitStatusRefresh={onGitStatusRefresh}
  onSwitchTab={onSwitchTab}
  surface="source-control"
  onOpenCommandsEditor={onOpenCommandsEditor}
  onSetSessionStage={onSetSessionStage}
  onSetup={onSetup}
  onStartBlank={onStartBlank}
/>
```

Add the new props to the SCWorkingView props interface:
```ts
currentStage: string
onSetSessionStage: (stage: string) => void
onSetup: () => void
onStartBlank: () => void
```

- [ ] **Step 4: Delete CommandsSetupBanner**

```bash
git rm src/renderer/panels/explorer/tabs/source-control/CommandsSetupBanner.tsx
git rm src/renderer/panels/explorer/tabs/source-control/CommandsSetupBanner.stories.tsx
```

- [ ] **Step 5: Run lint, typecheck, source-control tests**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run src/renderer/panels/explorer/tabs/source-control/`
Expected: PASS. Fix any prop-passing or import errors that surface.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/panels/explorer/tabs/source-control/SourceControl.tsx src/renderer/panels/explorer/tabs/source-control/SCWorkingView.tsx
git commit -m "feat(commands): wire SourceControl to dual-config hook and stage state"
```

---

## Task 18: Wire ReviewPanel to new ActionButtons props

**Files:**
- Modify: `src/renderer/panels/explorer/tabs/review/ReviewPanel.tsx`

ReviewPanel also renders ActionButtons (review surface). It needs the same new props.

- [ ] **Step 1: Inspect**

Open the file and locate the `<ActionButtons ... />` usage.

- [ ] **Step 2: Wire new props**

Following the same shape as SCWorkingView, add:

```ts
const stage = useSessionStore(s => s.sessions.find(x => x.id === s.activeSessionId)?.stage ?? 'new')
const setSessionStage = useSessionStore(s => s.setSessionStage)
const activeSessionId = useSessionStore(s => s.activeSessionId)
```

Pass `currentStage={stage}`, `onSetSessionStage`, `onSetup`, `onStartBlank` to the `ActionButtons` element. For `onSetup` and `onStartBlank` in the review surface, route them to the existing commands editor opening helper (or to a no-op + console.warn if the panel has no setup route; the setup CTA in the review surface is unusual but possible).

ReviewPanel calls `useCommandsConfig`. Replace `const { config: commandsConfig, exists } = useCommandsConfig(directory)` with `const { merged: commandsConfig, userExists, projectExists } = useCommandsConfig(directory)` and update any downstream `commandsConfig?.actions` reads (already compatible — `merged` is a `CommandsConfig | null`).

- [ ] **Step 3: Run review tests**

Run: `pnpm vitest run src/renderer/panels/explorer/tabs/review/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/panels/explorer/tabs/review/ReviewPanel.tsx
git commit -m "feat(commands): wire ReviewPanel ActionButtons to new props"
```

---

## Task 19: Cleanup — delete dead code

**Files:**
- Delete: `src/renderer/features/commands/defaultCommands.json`
- Delete: `src/renderer/shared/components/PromptVariants.tsx`
- Delete: `src/renderer/shared/components/PromptVariants.stories.tsx`
- Modify: `src/renderer/features/commands/commandsConfig.ts` — remove `detectAgentType`, `getAgentTypes`, `commandsConfigPath` legacy alias.
- Modify: `src/renderer/features/commands/conditionState.ts` — unchanged (verify).

- [ ] **Step 1: Confirm nothing imports the to-be-deleted files**

Run:
```bash
grep -rn "defaultCommands\|getDefaultCommandsConfig\|PromptVariants\|detectAgentType\|getAgentTypes" src/
```
Expected: no matches (except inside the files being deleted, or their tests, which will also be removed).

If any matches remain, fix the consumer in this commit.

- [ ] **Step 2: Delete files**

```bash
git rm src/renderer/features/commands/defaultCommands.json
git rm src/renderer/shared/components/PromptVariants.tsx
git rm src/renderer/shared/components/PromptVariants.stories.tsx
```

- [ ] **Step 3: Strip dead exports from commandsConfig.ts**

In `src/renderer/features/commands/commandsConfig.ts`, remove:

- The `detectAgentType` and `getAgentTypes` functions.
- The legacy alias `export const commandsConfigPath = projectCommandsConfigPath` if no test still references it.
- The legacy `// --- Agent type detection ---` section comment.
- The unused legacy gitignore helpers (`checkLegacyBroomyGitignore`, `removeLegacyBroomyGitignore`) iff the CommandsSetupDialog rewrite no longer calls them (verify with `grep`).

Run grep first to confirm safety:
```bash
grep -rn "checkLegacyBroomyGitignore\|removeLegacyBroomyGitignore\|ensureOutputGitignore" src/
```
Keep `ensureOutputGitignore` if anything else uses it (it's used by `actionExecutor` indirectly? — confirm). Don't blindly delete; only remove what's truly unreferenced.

- [ ] **Step 4: Run lint + typecheck + full unit tests**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run`
Expected: PASS. Fix any tests that referenced the removed exports.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(commands): remove dead default config, per-agent variants, legacy helpers"
```

---

## Task 20: Stories for empty/installed states

**Files:**
- Modify: `src/renderer/shared/components/ActionButtons.stories.tsx` (or create)
- Create: `src/renderer/panels/explorer/tabs/source-control/CommandsSetupDialog.stories.tsx` (already exists — update)

- [ ] **Step 1: Add stories for the key states**

Either create or extend the stories so the visual regression suite covers:

- `ActionButtons`: empty (renders SetupCta), single button no stages, multi-button with stage pill.
- `CommandsSetupDialog`: with all three packs visible, Basics selected.
- `CommandsEditor`: User tab populated, Project tab empty (Add CTA), one-line mode, text-block mode, with args table.

Each story is ~10 lines: import, meta, args. Use the existing patterns from Task 11/12 stories.

- [ ] **Step 2: Run Storybook tests**

Run: `pnpm storybook:test`
Expected: new snapshots produced; if you intentionally added stories, accept them with `pnpm storybook:update-refs` and re-run `pnpm storybook:test` to confirm clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/**/*.stories.tsx .storybook-refs/
git commit -m "test(commands): add storybook stories for new commands UI states"
```

---

## Task 21: Validation pass

- [ ] **Step 1: Run full validate**

Run: `/validate` (which runs lint, typecheck, check:all, unit tests with coverage, E2E).

Fix any failures. Coverage threshold is 90% lines per file — if a new file falls below, write targeted tests.

- [ ] **Step 2: Run feature-doc**

Run: `/feature-doc command-skills`
This creates the screenshot walkthrough spec.

- [ ] **Step 3: Run code-review**

Run: `/code-review src/renderer/features/commands src/renderer/shared/components/ArgDialog.tsx src/renderer/shared/components/StagePill.tsx src/renderer/shared/components/SetupCta.tsx src/renderer/shared/components/ActionButtons.tsx src/renderer/panels/fileViewer/CommandsEditor.tsx src/renderer/panels/explorer/tabs/source-control/CommandsSetupDialog.tsx`

Address review findings inline as appropriate.

- [ ] **Step 4: Final commit**

If any fixes from `/code-review` produced changes, commit them:

```bash
git add -A
git commit -m "chore(commands): address code-review feedback"
```

---

## Verification (post-implementation)

1. Open the app on a repo with no `~/.broomy/commands.json` and no `<repo>/.broomy/commands.json`. The source-control panel should show "Set up commands" with "Or start with an empty config →" below.
2. Click "Set up commands" → modal opens with Basics (Recommended), Superpowers, gstack cards.
3. Select Basics → click Install → file is written to `~/.broomy/commands.json` → buttons appear with two-line labels.
4. With dirty repo, the Commit button should appear; click → agent receives "Commit the current changes…" prompt.
5. With a `{topic}` placeholder command (Superpowers `/plan`), clicking opens the arg dialog with a Topic field and a live Resolved preview.
6. Toggle the Superpowers pack — the stage pill appears at the top of the buttons block.
7. Open the editor (edit commands link) → User and Project tabs visible; switching to Project shows "Add project commands" CTA.
8. Edit a command's template to add `{newArg}` → the args table grows in real time.
9. Existing `<repo>/.broomy/commands.json` with v1 schema loads and migrates to v2 in memory; saving rewrites to v2.

If any of those flows feel rough, file a follow-up issue rather than expanding scope here.
