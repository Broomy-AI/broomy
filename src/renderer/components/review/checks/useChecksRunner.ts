/**
 * Hook that runs automated check commands and manages results.
 */
import { useState, useCallback } from 'react'
import type { CheckDefinition, CheckResult } from '../../../types/checks'
import { BUILTIN_CHECKS } from '../../../types/checks'
import type { ManagedRepo } from '../../../../preload/index'

function buildCheckList(repo?: ManagedRepo): CheckDefinition[] {
  const checks: CheckDefinition[] = BUILTIN_CHECKS.map((check) => ({
    ...check,
    command: repo?.checkCommands?.[check.id] ?? check.command,
  }))

  if (repo?.customChecks) {
    for (const custom of repo.customChecks) {
      checks.push({ ...custom, enabled: true })
    }
  }

  return checks
}

export interface ChecksRunnerState {
  results: CheckResult[]
  isRunning: boolean
  checks: CheckDefinition[]
  runChecks: () => Promise<void>
  runCheck: (checkId: string) => Promise<void>
}

export function useChecksRunner(directory: string, repo?: ManagedRepo): ChecksRunnerState {
  const checks = buildCheckList(repo)
  const [results, setResults] = useState<CheckResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const runSingleCheck = useCallback(async (check: CheckDefinition): Promise<CheckResult> => {
    const start = Date.now()
    try {
      const result = await window.shell.exec(check.command, directory)
      return {
        id: check.id,
        status: result.exitCode === 0 ? 'passed' : 'failed',
        output: `${result.stdout}\n${result.stderr}`.trim(),
        exitCode: result.exitCode,
        durationMs: Date.now() - start,
      }
    } catch (err) {
      return {
        id: check.id,
        status: 'failed',
        output: err instanceof Error ? err.message : String(err),
        exitCode: null,
        durationMs: Date.now() - start,
      }
    }
  }, [directory])

  const runChecks = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)

    // Initialize all as pending
    const initial: CheckResult[] = checks.map((c) => ({
      id: c.id, status: 'pending', output: '', exitCode: null, durationMs: 0,
    }))
    setResults(initial)

    // Run sequentially
    const updated = [...initial]
    for (let i = 0; i < checks.length; i++) {
      // Mark current as running
      updated[i] = { ...updated[i], status: 'running' }
      setResults([...updated])

      const result = await runSingleCheck(checks[i])
      updated[i] = result
      setResults([...updated])
    }

    setIsRunning(false)
  }, [checks, isRunning, runSingleCheck])

  const runCheck = useCallback(async (checkId: string) => {
    const check = checks.find((c) => c.id === checkId)
    if (!check || isRunning) return

    setIsRunning(true)

    // Mark as running
    setResults((prev) => {
      const idx = prev.findIndex((r) => r.id === checkId)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], status: 'running', output: '', exitCode: null, durationMs: 0 }
        return next
      }
      return [...prev, { id: checkId, status: 'running' as const, output: '', exitCode: null, durationMs: 0 }]
    })

    const result = await runSingleCheck(check)

    setResults((prev) => {
      const idx = prev.findIndex((r) => r.id === checkId)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = result
        return next
      }
      return [...prev, result]
    })

    setIsRunning(false)
  }, [checks, isRunning, runSingleCheck])

  return { results, isRunning, checks, runChecks, runCheck }
}
