import { useRef, useCallback } from 'react'
import { stripAnsi } from '../utils/stripAnsi'

/**
 * Rolling buffer plan file detection from terminal output.
 * Detects plan file paths matching `/.claude-personal/plans/*.md` in terminal data.
 * Returns a function to process each chunk of terminal output.
 */
export function usePlanDetection(
  sessionIdRef: React.MutableRefObject<string | undefined>,
  setPlanFileRef: React.MutableRefObject<(sessionId: string, planFile: string) => void>,
) {
  // Rolling buffer for plan file detection (agent terminals only)
  const planDetectionBufferRef = useRef('')
  const lastDetectedPlanRef = useRef<string | null>(null)

  const processPlanDetection = useCallback((data: string) => {
    if (!sessionIdRef.current) return

    const stripped = stripAnsi(data)
    planDetectionBufferRef.current += stripped
    if (planDetectionBufferRef.current.length > 1000) {
      planDetectionBufferRef.current = planDetectionBufferRef.current.slice(-1000)
    }
    const planMatch = planDetectionBufferRef.current.match(/\/[^\s)]+\.claude-personal\/plans\/[^\s)]+\.md/)
    if (planMatch && planMatch[0] !== lastDetectedPlanRef.current) {
      lastDetectedPlanRef.current = planMatch[0]
      setPlanFileRef.current(sessionIdRef.current, planMatch[0])
    }
  }, [sessionIdRef, setPlanFileRef])

  return processPlanDetection
}
