/**
 * Type definitions for the automated checks feature.
 */

export type CheckStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'

export interface CheckDefinition {
  id: string
  label: string
  command: string
  enabled: boolean
}

export interface CheckResult {
  id: string
  status: CheckStatus
  output: string
  exitCode: number | null
  durationMs: number
}

/** Built-in check definitions with default commands */
export const BUILTIN_CHECKS: CheckDefinition[] = [
  { id: 'lint', label: 'Lint', command: 'npm run lint', enabled: true },
  { id: 'typecheck', label: 'Typecheck', command: 'npm run typecheck', enabled: true },
  { id: 'test', label: 'Tests', command: 'npm test', enabled: true },
]
