/**
 * Loads user (~/.broomy/commands.json) and project (<repo>/.broomy/commands.json) configs.
 * Watches both files for external edits.
 * Returns each side plus the merged concatenation.
 */
import { useState, useEffect } from 'react'
import type { CommandsConfig } from '../commandsConfig'
import { loadConfigFromPath, mergeConfigs, projectCommandsConfigPath } from '../commandsConfig'
import { getUserCommandsConfigPath } from '../userConfigPath'

export interface UseCommandsConfigResult {
  user: CommandsConfig | null
  userError: string | null
  userExists: boolean
  project: CommandsConfig | null
  projectError: string | null
  projectExists: boolean
  merged: CommandsConfig | null
  loading: boolean
  reload: () => void
}

export function useCommandsConfig(directory: string | undefined): UseCommandsConfigResult {
  const [user, setUser] = useState<CommandsConfig | null>(null)
  const [userError, setUserError] = useState<string | null>(null)
  const [userExists, setUserExists] = useState(false)
  const [project, setProject] = useState<CommandsConfig | null>(null)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [projectExists, setProjectExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      setLoading(true)
      const userPath = await getUserCommandsConfigPath()
      const userResult = await loadConfigFromPath(userPath)
      let projectResult: Awaited<ReturnType<typeof loadConfigFromPath>> = null
      let projectPath: string | null = null
      if (directory) {
        projectPath = projectCommandsConfigPath(directory)
        projectResult = await loadConfigFromPath(projectPath)
      }

      if (cancelled) return

      if (userResult === null) { setUser(null); setUserExists(false); setUserError(null) }
      else if (!userResult.ok) { setUser(null); setUserExists(true); setUserError(userResult.error) }
      else { setUser(userResult.config); setUserExists(true); setUserError(null) }

      if (projectResult === null) { setProject(null); setProjectExists(false); setProjectError(null) }
      else if (!projectResult.ok) { setProject(null); setProjectExists(true); setProjectError(projectResult.error) }
      else { setProject(projectResult.config); setProjectExists(true); setProjectError(null) }

      setLoading(false)
      return { userPath, projectPath }
    }

    const watchIds: string[] = []
    const removeFns: (() => void)[] = []

    void loadAll().then((paths) => {
      if (!paths || cancelled) return
      const watchEntries: { id: string; path: string }[] = [
        { id: 'user-commands-config', path: paths.userPath },
      ]
      if (paths.projectPath) watchEntries.push({ id: `project-commands-config-${directory}`, path: paths.projectPath })

      for (const w of watchEntries) {
        void window.fs.watch(w.id, w.path)
        watchIds.push(w.id)
        const off = window.fs.onChange(w.id, () => setReloadKey(k => k + 1))
        removeFns.push(off)
      }
    })

    return () => {
      cancelled = true
      for (const off of removeFns) off()
      for (const id of watchIds) void window.fs.unwatch(id)
    }
  }, [directory, reloadKey])

  const merged = mergeConfigs(user, project)
  const reload = () => setReloadKey(k => k + 1)

  return { user, userError, userExists, project, projectError, projectExists, merged, loading, reload }
}
