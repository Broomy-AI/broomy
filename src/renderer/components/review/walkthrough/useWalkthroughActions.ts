/**
 * Hook providing action handler for generating a screenshot walkthrough via agent.
 */
import { useState, useCallback } from 'react'
import { focusAgentTerminal } from '../../../utils/focusHelpers'

const DEFAULT_WALKTHROUGH_PROMPT = `Create a screenshot walkthrough of this feature.

1. Write a Playwright test script that:
   - Launches the app
   - Navigates through the key feature flows
   - Takes a screenshot at each meaningful step
   - Saves screenshots to .broomy/walkthrough-screenshots/

2. Generate .broomy/walkthrough.html that:
   - Shows each screenshot with a caption explaining what the user sees
   - Uses inline CSS for styling (dark theme, centered layout)
   - Is self-contained (no external dependencies)

Save the walkthrough HTML to .broomy/walkthrough.html.`

export interface WalkthroughActionsState {
  waitingForAgent: boolean
  handleGenerateWalkthrough: () => Promise<void>
}

export function useWalkthroughActions(
  directory: string,
  agentPtyId: string | undefined,
  customInstructions?: string,
): WalkthroughActionsState {
  const [waitingForAgent, setWaitingForAgent] = useState(false)

  const handleGenerateWalkthrough = useCallback(async () => {
    if (!agentPtyId) return

    setWaitingForAgent(true)

    // Ensure directory exists
    await window.fs.mkdir(`${directory}/.broomy`)

    // Write prompt
    const prompt = customInstructions || DEFAULT_WALKTHROUGH_PROMPT
    const promptPath = `${directory}/.broomy/walkthrough-prompt.md`
    await window.fs.writeFile(promptPath, prompt)

    // Send to agent
    await window.pty.write(agentPtyId, 'Please read and follow the instructions in .broomy/walkthrough-prompt.md')
    focusAgentTerminal()
  }, [directory, agentPtyId, customInstructions])

  return { waitingForAgent, handleGenerateWalkthrough }
}
