import { useState, useImperativeHandle, forwardRef } from 'react'

// Suggested env vars for different commands
const ENV_SUGGESTIONS: Record<string, { key: string; description: string }[]> = {
  claude: [
    { key: 'CLAUDE_CONFIG_DIR', description: 'Config directory (default: ~/.claude)' },
  ],
}

export interface EnvVarEditorRef {
  getPendingEnv: () => Record<string, string>
}

export const EnvVarEditor = forwardRef<
  EnvVarEditorRef,
  {
    env: Record<string, string>
    onChange: (env: Record<string, string>) => void
    command: string
  }
>(function EnvVarEditor({ env, onChange, command }, ref) {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  useImperativeHandle(ref, () => ({
    getPendingEnv: () => {
      if (newKey.trim()) {
        return { ...env, [newKey.trim()]: newValue }
      }
      return env
    },
  }))

  const entries = Object.entries(env)
  const suggestions = ENV_SUGGESTIONS[command] || []
  const unusedSuggestions = suggestions.filter(s => !(s.key in env))

  const handleAdd = () => {
    if (!newKey.trim()) return
    onChange({ ...env, [newKey.trim()]: newValue })
    setNewKey('')
    setNewValue('')
  }

  const handleRemove = (key: string) => {
    const { [key]: _, ...newEnv } = env
    onChange(newEnv)
  }

  const handleChange = (key: string, value: string) => {
    onChange({ ...env, [key]: value })
  }

  const handleAddSuggestion = (key: string) => {
    setNewKey(key)
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-text-secondary">Environment Variables</div>

      {/* Existing env vars */}
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <input
            type="text"
            value={key}
            disabled
            className="w-1/3 px-2 py-1.5 bg-bg-tertiary border border-border rounded text-xs text-text-secondary font-mono"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => handleChange(key, e.target.value)}
            className="flex-1 px-2 py-1.5 bg-bg-secondary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
            placeholder="Value"
          />
          <button
            onClick={() => handleRemove(key)}
            className="p-1.5 text-text-secondary hover:text-status-error transition-colors"
            title="Remove"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}

      {/* Add new env var */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="w-1/3 px-2 py-1.5 bg-bg-secondary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
          placeholder="KEY"
        />
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className="flex-1 px-2 py-1.5 bg-bg-secondary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
          placeholder="value"
        />
        <button
          onClick={handleAdd}
          disabled={!newKey.trim()}
          className="px-2 py-1.5 bg-bg-tertiary text-text-secondary text-xs rounded hover:text-text-primary disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </div>

      {/* Suggestions */}
      {unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {unusedSuggestions.map(suggestion => (
            <button
              key={suggestion.key}
              onClick={() => handleAddSuggestion(suggestion.key)}
              className="px-2 py-0.5 text-xs bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors"
              title={suggestion.description}
            >
              + {suggestion.key}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
