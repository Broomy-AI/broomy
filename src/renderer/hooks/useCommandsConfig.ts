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
} {
  const [config, setConfig] = useState<CommandsConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [exists, setExists] = useState(false)

  useEffect(() => {
    if (!directory) {
      setConfig(null)
      setLoading(false)
      setExists(false)
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      const loaded = await loadCommandsConfig(directory!)
      if (!cancelled) {
        setConfig(loaded)
        setExists(loaded !== null)
        setLoading(false)
      }
    }

    void load()

    // Watch for changes to commands.json
    const watcherId = `commands-config-${directory}`
    const broomyDir = `${directory}/.broomy`
    void window.fs.watch(watcherId, broomyDir)
    const removeListener = window.fs.onChange(watcherId, (event: { eventType: string; filename: string | null }) => {
      if (event.filename && event.filename !== 'commands.json') return
      void load()
    })

    return () => {
      cancelled = true
      removeListener()
      void window.fs.unwatch(watcherId)
    }
  }, [directory])

  return { config, loading, exists }
}
