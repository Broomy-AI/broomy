/**
 * Watches `.broomy/output/pr-result.json` for creation/modification and triggers PR status updates.
 */
import { useEffect } from 'react'
import type { PrState } from '../../store/sessions'
import type { GitHubPrStatus } from '../../../preload/index'

interface UsePrResultWatcherConfig {
  directory?: string
  onUpdatePrState?: (prState: PrState, prNumber?: number, prUrl?: string) => void
  setPrStatus: (status: GitHubPrStatus) => void
}

export function usePrResultWatcher({ directory, onUpdatePrState, setPrStatus }: UsePrResultWatcherConfig) {
  useEffect(() => {
    if (!directory) return

    const outputDir = `${directory}/.broomy/output`
    const prResultPath = `${outputDir}/pr-result.json`
    const watcherId = `pr-result-${directory}`
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    // Start watching — may fail if .broomy/output doesn't exist yet, which is fine
    void window.fs.watch(watcherId, outputDir)
    const removeListener = window.fs.onChange(watcherId, (event: { eventType: string; filename: string | null }) => {
      if (event.filename && event.filename !== 'pr-result.json') return

      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void (async () => {
          try {
            const content = await window.fs.readFile(prResultPath)
            const result = JSON.parse(content) as { url?: string; number?: number }
            if (!result.url) return

            // Update session PR state immediately from the file
            onUpdatePrState?.('OPEN', result.number, result.url)

            // Fetch full PR status for the source control UI
            const fullStatus = await window.gh.prStatus(directory)
            if (fullStatus) {
              setPrStatus(fullStatus)
            }
          } catch {
            // File may not exist yet or be partially written
          }
        })()
      }, 300)
    })

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      removeListener()
      void window.fs.unwatch(watcherId)
    }
  }, [directory])
}
