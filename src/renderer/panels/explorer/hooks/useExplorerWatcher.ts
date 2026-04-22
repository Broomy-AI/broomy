/**
 * Watches the repo directory recursively and triggers a tree refresh on file changes.
 * Only active when a directory is provided; cleans up the watcher on unmount or directory change.
 */
import { useEffect, useRef } from 'react'

const DEBOUNCE_MS = 500

export function useExplorerWatcher(directory: string | undefined, refreshTree: () => Promise<void>) {
  const refreshRef = useRef(refreshTree)
  refreshRef.current = refreshTree

  useEffect(() => {
    if (!directory) return

    const watcherId = `explorer-${directory}`
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let unmounted = false

    void window.fs.watch(watcherId, directory, { recursive: true })

    const removeListener = window.fs.onChange(watcherId, () => {
      if (unmounted) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void refreshRef.current()
      }, DEBOUNCE_MS)
    })

    return () => {
      unmounted = true
      if (debounceTimer) clearTimeout(debounceTimer)
      removeListener()
      void window.fs.unwatch(watcherId)
    }
  }, [directory])
}
