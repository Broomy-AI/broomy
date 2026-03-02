/**
 * Hook that polls .broomy/analyses/ directory for analysis result files and tracks changes.
 */
import { useState, useEffect, useRef } from 'react'
import type { AnalysisResult } from '../../../types/analysis'

export function useAnalysesData(
  directory: string,
  enabledAnalyses: string[],
): Map<string, AnalysisResult> {
  const [results, setResults] = useState<Map<string, AnalysisResult>>(new Map())
  const lastSeenTimestamps = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (enabledAnalyses.length === 0) return

    const analysesDir = `${directory}/.broomy/analyses`

    const interval = setInterval(() => {
      void (async () => {
        for (const id of enabledAnalyses) {
          const filePath = `${analysesDir}/${id}.json`
          try {
            const exists = await window.fs.exists(filePath)
            if (!exists) continue

            const content = await window.fs.readFile(filePath)
            const data = JSON.parse(content) as AnalysisResult

            if (data.generatedAt !== lastSeenTimestamps.current.get(id)) {
              lastSeenTimestamps.current.set(id, data.generatedAt)
              setResults((prev) => {
                const next = new Map(prev)
                next.set(id, data)
                return next
              })
            }
          } catch {
            // File may not exist yet or be partially written
          }
        }
      })()
    }, 1000)

    return () => clearInterval(interval)
  }, [directory, enabledAnalyses])

  // Reset when directory changes
  useEffect(() => {
    setResults(new Map())
    lastSeenTimestamps.current = new Map()
  }, [directory])

  return results
}
