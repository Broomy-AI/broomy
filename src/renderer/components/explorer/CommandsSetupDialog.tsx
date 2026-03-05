/**
 * Dialog for setting up .broomy/commands.json with default modular actions.
 * Warns if .broomy/ is currently in the repo's .gitignore (legacy pattern).
 */
import { useState, useEffect } from 'react'
import {
  getDefaultCommandsConfig,
  getDefaultPromptFiles,
  commandsConfigPath,
  ensureOutputGitignore,
} from '../../utils/commandsConfig'
import { SKILL_ACTIONS, skillCommandPath } from '../../utils/skillActions'
import {
  checkLegacyBroomyGitignore,
  removeLegacyBroomyGitignore,
} from '../review/useReviewActions'

interface CommandsSetupDialogProps {
  directory: string
  onClose: () => void
  onCreated: () => void
}

export function CommandsSetupDialog({ directory, onClose, onCreated }: CommandsSetupDialogProps) {
  const [creating, setCreating] = useState(false)
  const [hasLegacyGitignore, setHasLegacyGitignore] = useState(false)
  const [removeLegacy, setRemoveLegacy] = useState(true)

  useEffect(() => {
    void checkLegacyBroomyGitignore(directory).then(setHasLegacyGitignore)
  }, [directory])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const broomyDir = `${directory}/.broomy`
      const promptsDir = `${broomyDir}/prompts`

      // Create directories
      await window.fs.mkdir(broomyDir)
      await window.fs.mkdir(promptsDir)

      // Write commands.json
      const config = getDefaultCommandsConfig()
      await window.fs.writeFile(commandsConfigPath(directory), JSON.stringify(config, null, 2))

      // Write prompt files
      const prompts = getDefaultPromptFiles()
      for (const [filename, content] of Object.entries(prompts)) {
        await window.fs.writeFile(`${promptsDir}/${filename}`, content)
      }

      // Write .broomy/.gitignore for output/
      await ensureOutputGitignore(directory)

      // Write Claude Code skill files
      const commandsDir = `${directory}/.claude/commands`
      await window.fs.mkdir(`${directory}/.claude`)
      await window.fs.mkdir(commandsDir)
      for (const action of SKILL_ACTIONS) {
        const path = skillCommandPath(directory, action.name)
        const exists = await window.fs.exists(path)
        if (!exists) {
          await window.fs.writeFile(path, action.defaultContent)
        }
      }

      // Remove legacy .broomy from .gitignore if requested
      if (hasLegacyGitignore && removeLegacy) {
        await removeLegacyBroomyGitignore(directory)
      }

      onCreated()
      onClose()
    } catch {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-bg-secondary rounded-lg shadow-xl border border-border w-full max-w-md mx-4 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium text-text-primary mb-2">Set up Broomy Actions</h3>
        <p className="text-sm text-text-secondary mb-3">
          <code className="font-mono bg-bg-tertiary px-1 rounded">commands.json</code> defines the action
          buttons shown in source control. Each action can be a shell command or an agent prompt,
          shown based on your git state.
        </p>
        <p className="text-sm text-text-secondary mb-3">
          Creating the default setup will add:
        </p>
        <ul className="text-sm text-text-secondary mb-4 space-y-1 list-disc list-inside">
          <li><code className="font-mono bg-bg-tertiary px-1 rounded">.broomy/commands.json</code> &mdash; action definitions</li>
          <li><code className="font-mono bg-bg-tertiary px-1 rounded">.broomy/prompts/</code> &mdash; editable prompt templates</li>
          <li><code className="font-mono bg-bg-tertiary px-1 rounded">.claude/commands/</code> &mdash; Claude Code skill files</li>
          <li><code className="font-mono bg-bg-tertiary px-1 rounded">.broomy/.gitignore</code> &mdash; ignores generated output</li>
        </ul>

        {hasLegacyGitignore && (
          <div className="mb-4 p-3 rounded bg-yellow-500/10 border border-yellow-500/30">
            <p className="text-sm text-yellow-300 mb-2">
              Your <code className="font-mono">.gitignore</code> currently
              ignores <code className="font-mono">.broomy/</code>. This was previously recommended,
              but config files now live in <code className="font-mono">.broomy/</code> and should be committed.
              Generated files are now in <code className="font-mono">.broomy/output/</code> (ignored
              via <code className="font-mono">.broomy/.gitignore</code>).
            </p>
            <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={removeLegacy}
                onChange={(e) => setRemoveLegacy(e.target.checked)}
                className="accent-accent"
              />
              Remove <code className="font-mono">.broomy/</code> from .gitignore
            </label>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={creating}
            className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create default commands.json'}
          </button>
        </div>
      </div>
    </div>
  )
}
