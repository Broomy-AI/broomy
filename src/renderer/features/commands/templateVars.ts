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
import type { GitStatusResult } from '../../../preload/index'

export type TemplateVarSurface = 'command' | 'agent' | 'envValue' | 'init'
export type TemplateVarGroup = 'Repo' | 'Branch' | 'Pull request' | 'Issue' | 'Session'

/** Only the repo fields the registry reads, so callers holding a narrower repo type can pass it. */
export interface TemplateVarRepo {
  name?: string
  rootDir?: string
  defaultBranch?: string
}

export interface TemplateVarInput {
  session?: Session
  repo?: TemplateVarRepo
  syncStatus?: GitStatusResult | null
  directory?: string
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

function basename(path: string | undefined): string {
  if (!path) return ''
  const trimmed = path.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx === -1 ? trimmed : trimmed.slice(idx + 1)
}

export const TEMPLATE_VARS: TemplateVarDef[] = [
  {
    name: 'directory', envName: 'BROOMY_DIRECTORY', group: 'Repo',
    description: 'Working directory of the session',
    get: i => str(i.directory),
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
  envValue: 'not available here',
  init: 'not set at init time',
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
