/**
 * Inline editor for per-repository settings such as default agent, checks, analyses, and walkthrough.
 */
import { useState, useEffect } from 'react'
import type { AgentConfig } from '../store/agents'
import type { ManagedRepo } from '../../preload/index'
import { BUILTIN_ANALYSES } from './review/analyses/analysisDefinitions'

function ExtendedSettings({
  checksEnabled, setChecksEnabled,
  checkCommands, setCheckCommands,
  customChecks, setCustomChecks,
  enabledAnalyses, setEnabledAnalyses,
  walkthroughEnabled, setWalkthroughEnabled,
  walkthroughInstructions, setWalkthroughInstructions,
}: {
  checksEnabled: boolean
  setChecksEnabled: (v: boolean) => void
  checkCommands: Record<string, string>
  setCheckCommands: React.Dispatch<React.SetStateAction<Record<string, string>>>
  customChecks: { id: string; label: string; command: string }[]
  setCustomChecks: React.Dispatch<React.SetStateAction<{ id: string; label: string; command: string }[]>>
  enabledAnalyses: string[]
  setEnabledAnalyses: React.Dispatch<React.SetStateAction<string[]>>
  walkthroughEnabled: boolean
  setWalkthroughEnabled: (v: boolean) => void
  walkthroughInstructions: string
  setWalkthroughInstructions: (v: string) => void
}) {
  return (
    <>
      {/* Checks Settings */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="text-xs font-medium text-text-primary">Automated Checks</div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={checksEnabled} onChange={(e) => setChecksEnabled(e.target.checked)} className="rounded border-border" />
          <span className="text-xs text-text-secondary">Enable automated checks</span>
        </label>
        {checksEnabled && (
          <div className="space-y-1.5 ml-4">
            {['lint', 'typecheck', 'test'].map((id) => (
              <div key={id} className="flex items-center gap-2">
                <span className="text-xs text-text-secondary w-16 capitalize">{id}:</span>
                <input
                  type="text"
                  value={checkCommands[id] ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setCheckCommands((prev) => {
                      if (!val) {
                        const { [id]: _, ...rest } = prev
                        return rest
                      }
                      return { ...prev, [id]: val }
                    })
                  }}
                  placeholder={`npm run ${id}`}
                  className="flex-1 px-2 py-1 bg-bg-secondary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
                />
              </div>
            ))}
            <div className="text-xs text-text-secondary mt-1">Custom checks:</div>
            {customChecks.map((check, i) => (
              <div key={i} className="flex items-center gap-1">
                <input
                  type="text"
                  value={check.label}
                  onChange={(e) => {
                    const next = [...customChecks]
                    next[i] = { ...next[i], label: e.target.value, id: e.target.value.toLowerCase().replace(/\s+/g, '-') }
                    setCustomChecks(next)
                  }}
                  placeholder="Label"
                  className="w-20 px-2 py-1 bg-bg-secondary border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                />
                <input
                  type="text"
                  value={check.command}
                  onChange={(e) => {
                    const next = [...customChecks]
                    next[i] = { ...next[i], command: e.target.value }
                    setCustomChecks(next)
                  }}
                  placeholder="Command"
                  className="flex-1 px-2 py-1 bg-bg-secondary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
                />
                <button onClick={() => setCustomChecks(customChecks.filter((_, j) => j !== i))} className="text-text-secondary hover:text-red-400 text-xs px-1">&times;</button>
              </div>
            ))}
            <button onClick={() => setCustomChecks([...customChecks, { id: '', label: '', command: '' }])} className="text-xs text-accent hover:text-accent/80 transition-colors">+ Add custom check</button>
          </div>
        )}
      </div>

      {/* Analyses Settings */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="text-xs font-medium text-text-primary">Agent Analyses</div>
        {BUILTIN_ANALYSES.map((analysis) => (
          <label key={analysis.id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabledAnalyses.includes(analysis.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  setEnabledAnalyses([...enabledAnalyses, analysis.id])
                } else {
                  setEnabledAnalyses(enabledAnalyses.filter((id) => id !== analysis.id))
                }
              }}
              className="rounded border-border"
            />
            <div>
              <span className="text-xs text-text-secondary">{analysis.label}</span>
              <span className="text-xs text-text-secondary/60 ml-1">- {analysis.description}</span>
            </div>
          </label>
        ))}
      </div>

      {/* Walkthrough Settings */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="text-xs font-medium text-text-primary">Screenshot Walkthrough</div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={walkthroughEnabled} onChange={(e) => setWalkthroughEnabled(e.target.checked)} className="rounded border-border" />
          <span className="text-xs text-text-secondary">Enable walkthrough generation</span>
        </label>
        {walkthroughEnabled && (
          <textarea
            value={walkthroughInstructions}
            onChange={(e) => setWalkthroughInstructions(e.target.value)}
            placeholder="Custom walkthrough instructions (leave empty for default Playwright-based prompt)"
            className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary font-mono focus:outline-none focus:border-accent resize-y min-h-[60px]"
            rows={3}
          />
        )}
      </div>
    </>
  )
}

export function RepoSettingsEditor({
  repo,
  agents,
  onUpdate,
  onClose,
}: {
  repo: ManagedRepo
  agents: AgentConfig[]
  onUpdate: (updates: Partial<Omit<ManagedRepo, 'id'>>) => void
  onClose: () => void
}) {
  const [defaultAgentId, setDefaultAgentId] = useState(repo.defaultAgentId || '')
  const [allowPushToMain, setAllowPushToMain] = useState(repo.allowPushToMain ?? false)
  const [initScript, setInitScript] = useState('')
  const [loadingScript, setLoadingScript] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pushToMainError, setPushToMainError] = useState<{ summary: string; details: string } | null>(null)
  const [showErrorDetails, setShowErrorDetails] = useState(false)
  const [checksEnabled, setChecksEnabled] = useState(repo.checksEnabled ?? false)
  const [checkCommands, setCheckCommands] = useState<Record<string, string>>(repo.checkCommands ?? {})
  const [customChecks, setCustomChecks] = useState<{ id: string; label: string; command: string }[]>(repo.customChecks ?? [])
  const [enabledAnalyses, setEnabledAnalyses] = useState<string[]>(repo.enabledAnalyses ?? [])
  const [walkthroughEnabled, setWalkthroughEnabled] = useState(repo.walkthroughEnabled ?? false)
  const [walkthroughInstructions, setWalkthroughInstructions] = useState(repo.walkthroughInstructions ?? '')

  useEffect(() => {
    async function loadScript() {
      setLoadingScript(true)
      try {
        const script = await window.repos.getInitScript(repo.id)
        setInitScript(script || '')
      } catch {
        setInitScript('')
      }
      setLoadingScript(false)
    }
    void loadScript()
  }, [repo.id])

  const handleSave = async () => {
    setSaving(true)
    try {
      onUpdate({
        defaultAgentId: defaultAgentId || undefined,
        allowPushToMain,
        checksEnabled,
        checkCommands: Object.keys(checkCommands).length > 0 ? checkCommands : undefined,
        customChecks: customChecks.length > 0 ? customChecks : undefined,
        enabledAnalyses: enabledAnalyses.length > 0 ? enabledAnalyses : undefined,
        walkthroughEnabled,
        walkthroughInstructions: walkthroughInstructions || undefined,
      })
      await window.repos.saveInitScript(repo.id, initScript)
      onClose()
    } catch (err) {
      console.error('Failed to save repo settings:', err)
    }
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      {pushToMainError && (
        <div
          className="px-3 py-2 rounded border border-red-500/30 bg-red-500/10 flex items-center gap-2 cursor-pointer hover:bg-red-500/20 transition-colors"
          onClick={() => setShowErrorDetails(true)}
          title="Click to view full error"
        >
          <div className="flex-1 text-xs text-red-400 truncate">{pushToMainError.summary}</div>
          <button onClick={(e) => { e.stopPropagation(); setPushToMainError(null) }} className="text-red-400 hover:text-red-300 text-xs shrink-0 px-1" title="Dismiss">&times;</button>
        </div>
      )}

      {showErrorDetails && pushToMainError && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowErrorDetails(false)}>
          <div className="bg-bg-primary border border-border rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium text-red-400">Error Details</span>
              <button onClick={() => setShowErrorDetails(false)} className="text-text-secondary hover:text-text-primary text-lg">&times;</button>
            </div>
            <div className="px-4 py-3 overflow-auto">
              <pre className="text-xs text-text-primary whitespace-pre-wrap font-mono">{pushToMainError.details}</pre>
            </div>
          </div>
        </div>
      )}

      <div className="text-sm font-medium text-text-primary">{repo.name}</div>
      <div className="text-xs text-text-secondary font-mono">{repo.rootDir}</div>

      <div className="space-y-2">
        <label className="text-xs text-text-secondary">Default Agent</label>
        <select value={defaultAgentId} onChange={(e) => setDefaultAgentId(e.target.value)} className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent">
          <option value="">No default (ask each time)</option>
          {agents.map((agent) => (<option key={agent.id} value={agent.id}>{agent.name}</option>))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allowPushToMain}
            onChange={async (e) => {
              const checked = e.target.checked
              if (checked) {
                setPushToMainError(null)
                try {
                  const hasAccess = await window.gh.hasWriteAccess(repo.rootDir)
                  if (!hasAccess) {
                    setPushToMainError({ summary: 'Write access check failed', details: `The GitHub CLI reported that you do not have write access to this repository.\n\nRepository: ${repo.rootDir}\n\nTo debug, run this command in your terminal:\n  cd "${repo.rootDir}" && gh repo view --json viewerPermission\n\nExpected viewerPermission: ADMIN, MAINTAIN, or WRITE` })
                    return
                  }
                } catch (err) {
                  setPushToMainError({ summary: 'Failed to check write access', details: `An error occurred while checking write access.\n\nRepository: ${repo.rootDir}\n\nError: ${String(err)}\n\nPossible causes:\n- gh CLI is not installed\n- gh CLI is not authenticated (run: gh auth login)\n- Network connectivity issues\n- Repository is not a GitHub repository` })
                  return
                }
              }
              setAllowPushToMain(checked)
              setPushToMainError(null)
            }}
            className="rounded border-border"
          />
          <span className="text-xs text-text-secondary">Allow "Push to main" button</span>
        </label>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-text-secondary">Init Script (runs when session starts)</label>
        {loadingScript ? (
          <div className="text-xs text-text-secondary">Loading...</div>
        ) : (
          <textarea
            value={initScript}
            onChange={(e) => setInitScript(e.target.value)}
            placeholder="# Commands to run when starting a session in this repo&#10;# e.g., source .venv/bin/activate"
            className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary font-mono focus:outline-none focus:border-accent resize-y min-h-[80px]"
            rows={4}
          />
        )}
      </div>

      <ExtendedSettings
        checksEnabled={checksEnabled} setChecksEnabled={setChecksEnabled}
        checkCommands={checkCommands} setCheckCommands={setCheckCommands}
        customChecks={customChecks} setCustomChecks={setCustomChecks}
        enabledAnalyses={enabledAnalyses} setEnabledAnalyses={setEnabledAnalyses}
        walkthroughEnabled={walkthroughEnabled} setWalkthroughEnabled={setWalkthroughEnabled}
        walkthroughInstructions={walkthroughInstructions} setWalkthroughInstructions={setWalkthroughInstructions}
      />

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={onClose} className="px-3 py-1.5 bg-bg-tertiary text-text-secondary text-sm rounded hover:text-text-primary transition-colors">Cancel</button>
      </div>
    </div>
  )
}
