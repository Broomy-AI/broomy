/**
 * Prompt input for the Agent SDK chat view with slash command autocomplete.
 */
import { useState, useCallback, useRef, useEffect, useMemo, type RefObject } from 'react'
import type { SdkModelInfo } from '../../../preload/apis/types'

// Commands we handle ourselves (not in the SDK)
const LOCAL_COMMANDS = [
  { name: 'login', description: 'Log in to Claude (opens browser)' },
  { name: 'status', description: 'Show session status and account info' },
]

interface CommandInfo {
  name: string
  description: string
}

type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'

const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  default: 'Default',
  acceptEdits: 'Accept edits',
  bypassPermissions: 'Bypass permissions',
  plan: 'Plan only',
  dontAsk: "Don't ask",
}

interface AgentChatInputProps {
  onSubmit: (prompt: string) => void
  onStop: () => void
  isRunning: boolean
  sessionId: string
  availableCommands?: CommandInfo[]
  model?: string
  effort?: string
  availableModels?: SdkModelInfo[]
  onModelChange?: (model: string) => void
  onEffortChange?: (effort: string) => void
  permissionMode?: PermissionMode
  onPermissionModeChange?: (mode: PermissionMode) => void
  textareaRef?: RefObject<HTMLTextAreaElement>
}

export function AgentChatInput({ onSubmit, onStop, isRunning, sessionId, availableCommands, model, effort, availableModels, onModelChange, onEffortChange, permissionMode, onPermissionModeChange, textareaRef: externalRef }: AgentChatInputProps) {
  const [value, setValue] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = externalRef ?? internalRef

  // Auto-focus on mount and session changes
  useEffect(() => {
    if (!isRunning) {
      textareaRef.current?.focus()
    }
  }, [sessionId, isRunning])

  // Merge local + SDK commands, deduplicate by name
  const allCommands = useMemo(() => {
    const seen = new Set<string>()
    const result: CommandInfo[] = []
    for (const c of availableCommands ?? []) {
      if (!seen.has(c.name)) { seen.add(c.name); result.push(c) }
    }
    for (const c of LOCAL_COMMANDS) {
      if (!seen.has(c.name)) { seen.add(c.name); result.push(c) }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [availableCommands])

  // Autocomplete: show when typing "/" at the start
  const showAutocomplete = value.startsWith('/') && !value.includes(' ') && value.length > 0
  const filterText = value.slice(1).toLowerCase()
  const filteredCommands = showAutocomplete
    ? allCommands.filter(c => c.name.toLowerCase().startsWith(filterText))
    : []

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [filterText])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, onSubmit])

  const selectCommand = useCallback((name: string) => {
    const cmd = `/${name}`
    onSubmit(cmd)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showAutocomplete && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        selectCommand(filteredCommands[selectedIndex].name)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setValue('')
        return
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit, showAutocomplete, filteredCommands, selectedIndex, selectCommand])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  // Compute effort levels for the selected model
  const selectedModelInfo = availableModels?.find(m => m.value === model)
  const effortLevels = selectedModelInfo?.supportedEffortLevels ?? []
  const showEffort = (availableModels && availableModels.length > 0) && (selectedModelInfo?.supportsEffort ?? false) && effortLevels.length > 0

  return (
    <div className="border-t border-neutral-700 bg-neutral-900 px-3 py-2">
      {/* Autocomplete dropdown */}
      {showAutocomplete && filteredCommands.length > 0 && (
        <div className="mb-1 max-h-48 overflow-y-auto rounded border border-neutral-600 bg-neutral-800">
          {filteredCommands.map((cmd, i) => (
            <button
              key={`${cmd.name}-${String(i)}`}
              className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs ${
                i === selectedIndex ? 'bg-blue-600/30 text-neutral-100' : 'text-neutral-300 hover:bg-neutral-700/50'
              }`}
              onMouseDown={(e) => { e.preventDefault(); selectCommand(cmd.name) }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="font-mono font-medium text-blue-300">/{cmd.name}</span>
              <span className="truncate text-neutral-500">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? 'Agent is working... (type your next message)' : 'Message or /command'}
          rows={1}
          className="flex-1 resize-none rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
        />
        {isRunning ? (
          <>
            <button
              onClick={handleSubmit}
              disabled={!value.trim()}
              className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600"
            >
              Queue
            </button>
            <button
              onClick={onStop}
              className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
            >
              Stop
            </button>
          </>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600"
          >
            Send
          </button>
        )}
      </div>
      {/* Model / effort toolbar */}
      {availableModels && availableModels.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {/* Model picker */}
          <select
            value={model ?? ''}
            onChange={e => onModelChange?.(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 hover:border-neutral-500 focus:border-blue-500 focus:outline-none"
          >
            {availableModels.map(m => (
              <option key={m.value} value={m.value}>{m.displayName}</option>
            ))}
          </select>

          {/* Effort picker — only shown when the selected model supports effort */}
          {showEffort && (
            <select
              value={effort ?? ''}
              onChange={e => onEffortChange?.(e.target.value)}
              className="rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 hover:border-neutral-500 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Auto effort</option>
              {effortLevels.map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          )}

          {/* Permission mode picker */}
          {onPermissionModeChange && (
            <select
              value={permissionMode ?? 'default'}
              onChange={e => onPermissionModeChange(e.target.value as PermissionMode)}
              className="rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 hover:border-neutral-500 focus:border-blue-500 focus:outline-none"
            >
              {(Object.keys(PERMISSION_MODE_LABELS) as PermissionMode[]).map(mode => (
                <option key={mode} value={mode}>{PERMISSION_MODE_LABELS[mode]}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}
