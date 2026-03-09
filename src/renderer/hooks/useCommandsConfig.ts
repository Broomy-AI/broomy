/**
 * Hook that loads and watches commands.json for the active session's directory.
 * Returns null when no commands.json exists (prompting the setup banner).
 */
import { useState, useEffect } from 'react'
import type { CommandsConfig } from '../utils/commandsConfig'
import { loadCommandsConfig } from '../utils/commandsConfig'

export function useCommandsConfig(directory: string | undefined): {
  config: CommandsConfig | null
  loading: boolean
  exists: boolean
  error: string | null
} {
  const [config, setConfig] = useState<CommandsConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [exists, setExists] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!directory) {
      setConfig(null)
      setLoading(false)
      setExists(false)
      setError(null)
      return
    }

    let cancelled = false

    const watcherId = `commands-config-${directory}`
    const commandsFile = `${directory}/.broomy/commands.json`
    let watching = false

    function startWatching() {
      if (watching) return
      void window.fs.watch(watcherId, commandsFile).then((result: { success: boolean }) => {
        watching = result.success
      })
    }

    async function load() {
      setLoading(true)
      const result = await loadCommandsConfig(directory!)
      if (!cancelled) {
        if (result === null) {
          setConfig(null)
          setExists(false)
          setError(null)
        } else if (!result.ok) {
          setConfig(null)
          setExists(true)
          setError(result.error)
        } else {
          setConfig(result.config)
          setExists(true)
          setError(null)
        }
        setLoading(false)
        // If config exists, the file exists — start watching if not already
        if (result !== null) startWatching()
      }
    }

    void load()

    // Watch the commands.json file directly for external edits
    startWatching()
    const removeListener = window.fs.onChange(watcherId, () => {
      void load()
    })

    return () => {
      cancelled = true
      removeListener()
      void window.fs.unwatch(watcherId)
    }
  }, [directory])

  return { config, loading, exists, error }
}
