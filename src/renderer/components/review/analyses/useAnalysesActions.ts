/**
 * Hook providing action handlers for running agent analyses.
 */
import { useState, useCallback } from 'react'
import type { AnalysisDefinition } from '../../../types/analysis'
import { BUILTIN_ANALYSES } from './analysisDefinitions'
import { focusAgentTerminal } from '../../../utils/focusHelpers'

export interface AnalysesActionsState {
  waitingFor: Set<string>
  handleRunAnalysis: (id: string) => Promise<void>
  handleRunAllAnalyses: () => Promise<void>
}

export function useAnalysesActions(
  directory: string,
  agentPtyId: string | undefined,
  enabledAnalyses: string[],
): AnalysesActionsState {
  const [waitingFor, setWaitingFor] = useState<Set<string>>(new Set())

  const getDefinition = (id: string): AnalysisDefinition | undefined => {
    return BUILTIN_ANALYSES.find((a) => a.id === id)
  }

  const handleRunAnalysis = useCallback(async (id: string) => {
    if (!agentPtyId) return
    const def = getDefinition(id)
    if (!def) return

    // Ensure directory exists
    await window.fs.mkdir(`${directory}/.broomy/analyses`)

    // Write prompt file
    const promptPath = `${directory}/.broomy/analyses/${id}-prompt.md`
    await window.fs.writeFile(promptPath, def.promptTemplate)

    // Send to agent
    await window.pty.write(agentPtyId, `Please read and follow the instructions in .broomy/analyses/${id}-prompt.md`)
    setWaitingFor((prev) => new Set(prev).add(id))
    focusAgentTerminal()
  }, [directory, agentPtyId])

  const handleRunAllAnalyses = useCallback(async () => {
    for (const id of enabledAnalyses) {
      await handleRunAnalysis(id)
    }
  }, [enabledAnalyses, handleRunAnalysis])

  return { waitingFor, handleRunAnalysis, handleRunAllAnalyses }
}
