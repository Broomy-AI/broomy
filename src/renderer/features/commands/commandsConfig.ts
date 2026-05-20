/**
 * Commands configuration system for modular source control actions.
 *
 * Loads action definitions from `.broomy/commands.json` in the repo directory.
 * Each action defines when it appears (showWhen conditions), how it executes
 * (shell command or agent prompt), and visual style.
 */

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

// --- Template variables ---

export interface TemplateVars {
  main: string
  branch: string
  directory: string
  issueNumber?: string
}

export function resolveTemplateVars(text: string, vars: TemplateVars): string {
  return text
    .replace(/\{main\}/g, vars.main)
    .replace(/\{branch\}/g, vars.branch)
    .replace(/\{directory\}/g, vars.directory)
    .replace(/\{issueNumber\}/g, vars.issueNumber ?? '')
}

// --- Condition evaluation ---

export interface ConditionState {
  'has-changes': boolean
  'clean': boolean
  'merging': boolean
  'conflicts': boolean
  'no-tracking': boolean
  'ahead': boolean
  'behind': boolean
  'behind-main': boolean
  'on-main': boolean
  'in-progress': boolean
  'pushed': boolean
  'empty': boolean
  'open': boolean
  'merged': boolean
  'closed': boolean
  'no-pr': boolean
  'has-write-access': boolean
  'allow-approve-and-merge': boolean
  'checks-passed': boolean
  'has-issue': boolean
  'no-devcontainer': boolean
  'review': boolean
}

/**
 * Evaluate a single condition token against state.
 * Supports negation (!) and OR (|) within a token.
 */
function evaluateToken(token: string, state: ConditionState): boolean {
  // Handle negation
  if (token.startsWith('!')) {
    return !evaluateToken(token.slice(1), state)
  }

  // Handle OR within a token
  if (token.includes('|')) {
    return token.split('|').some(part => evaluateToken(part.trim(), state))
  }

  return state[token as keyof ConditionState]
}

/**
 * Evaluate showWhen conditions (ALL must be true).
 */
export function evaluateShowWhen(conditions: string[], state: ConditionState): boolean {
  if (conditions.length === 0) return true
  return conditions.every(token => evaluateToken(token, state))
}

// --- Surface matching ---

/**
 * Check if an action should appear on a given surface.
 * Actions without a surface property default to 'source-control'.
 */
export function matchesSurface(action: ActionDefinition, surface: string): boolean {
  if (!action.surface) return surface === 'source-control'
  if (Array.isArray(action.surface)) return action.surface.includes(surface)
  return action.surface === surface
}

// --- Validation ---

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

// --- Loading ---

export function commandsConfigPath(directory: string): string {
  return `${directory}/.broomy/commands.json`
}

export type LoadResult =
  | { ok: true; config: CommandsConfig }
  | { ok: false; error: string }

export async function loadCommandsConfig(directory: string): Promise<LoadResult | null> {
  try {
    const path = commandsConfigPath(directory)
    const exists = await window.fs.exists(path)
    if (!exists) return null

    const content = await window.fs.readFile(path)

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (e) {
      return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` }
    }

    const validationErrors = validateCommandsConfig(parsed)
    if (validationErrors.length > 0) {
      return { ok: false, error: `Invalid commands.json:\n${validationErrors.join('\n')}` }
    }

    const config = parsed as CommandsConfig

    return { ok: true, config }
  } catch {
    return null
  }
}

// --- Agent type detection ---

export function detectAgentType(command: string): string | null {
  const base = command.trim().split(/\s+/)[0]
  const name = base.includes('/') ? base.split('/').pop()! : base

  if (name === 'claude') return 'claude'
  if (name === 'aider') return 'aider'
  if (name === 'cursor') return 'cursor'
  if (name === 'codex') return 'codex'
  if (name === 'gemini') return 'gemini'
  return null
}

/**
 * Return unique sorted agent type strings from a list of agent configs.
 */
export function getAgentTypes(agents: { command: string }[]): string[] {
  const types = new Set<string>()
  for (const agent of agents) {
    const t = detectAgentType(agent.command)
    if (t) types.add(t)
  }
  return [...types].sort()
}

// --- Default config ---

import defaultCommandsJson from './defaultCommands.json'

export function getDefaultCommandsConfig(): CommandsConfig {
  return defaultCommandsJson as CommandsConfig
}


// --- Legacy .broomy gitignore helpers ---

/**
 * Check if .broomy/ itself is in the repo's .gitignore (legacy pattern).
 */
export async function checkLegacyBroomyGitignore(directory: string): Promise<boolean> {
  try {
    const gitignorePath = `${directory}/.gitignore`
    const exists = await window.fs.exists(gitignorePath)
    if (!exists) return false

    const content = await window.fs.readFile(gitignorePath)
    const lines = content.split(/\r?\n/).map((l: string) => l.trim())
    return lines.some((line: string) => line === '.broomy' || line === '.broomy/' || line === '/.broomy' || line === '/.broomy/')
  } catch {
    return false
  }
}

/**
 * Remove .broomy/ from the repo's .gitignore (legacy cleanup).
 */
export async function removeLegacyBroomyGitignore(directory: string): Promise<void> {
  try {
    const gitignorePath = `${directory}/.gitignore`
    const exists = await window.fs.exists(gitignorePath)
    if (!exists) return

    const content = await window.fs.readFile(gitignorePath)
    const lines = content.split(/\r?\n/)
    const filtered = lines.filter((line: string) => {
      const trimmed = line.trim()
      if (trimmed === '.broomy' || trimmed === '.broomy/' || trimmed === '/.broomy' || trimmed === '/.broomy/') return false
      return true
    })
    // Also remove "# Broomy review data" comment lines that preceded the entry
    const cleaned = filtered.filter((line: string, i: number) => {
      if (line.trim() === '# Broomy review data' && (i === filtered.length - 1 || filtered[i + 1]?.trim() === '')) return false
      return true
    })
    await window.fs.writeFile(gitignorePath, cleaned.join('\n'))
  } catch {
    // Non-fatal
  }
}

// --- Output gitignore helpers ---

/** Check whether .broomy/output is already covered by a gitignore rule. */
export async function isOutputGitignored(directory: string): Promise<boolean> {
  // Check .broomy/.gitignore for /output/ entry
  const broomyGitignore = `${directory}/.broomy/.gitignore`
  try {
    if (await window.fs.exists(broomyGitignore)) {
      const content = await window.fs.readFile(broomyGitignore)
      const lines = content.split(/\r?\n/).map((l: string) => l.trim())
      if (lines.some((l: string) => l === 'output' || l === 'output/' || l === '/output' || l === '/output/')) {
        return true
      }
    }
  } catch {
    // ignore
  }

  // Check repo .gitignore for .broomy/ entry (legacy pattern)
  try {
    if (await checkLegacyBroomyGitignore(directory)) {
      return true
    }
  } catch {
    // ignore
  }

  return false
}

// --- Ensure .broomy/.gitignore exists ---

export async function ensureOutputGitignore(directory: string): Promise<void> {
  const broomyDir = `${directory}/.broomy`
  const gitignorePath = `${broomyDir}/.gitignore`

  await window.fs.mkdir(broomyDir)

  try {
    if (await isOutputGitignored(directory)) return

    const exists = await window.fs.exists(gitignorePath)
    if (exists) {
      const content = await window.fs.readFile(gitignorePath)
      const lines = content.split(/\r?\n/).map((l: string) => l.trim())
      if (!lines.some((l: string) => l === 'output' || l === 'output/' || l === '/output' || l === '/output/')) {
        await window.fs.appendFile(gitignorePath, '\n/output/\n')
      }
    } else {
      await window.fs.writeFile(gitignorePath, '# Broomy generated files\n/output/\n')
    }
  } catch {
    // Best effort
  }
}
