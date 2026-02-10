import { useState, useEffect } from 'react'
import { useAgentStore } from '../../store/agents'

export function AgentPickerView({
  directory,
  repoId,
  repoName,
  onBack,
  onComplete,
}: {
  directory: string
  repoId?: string
  repoName?: string
  onBack: () => void
  onComplete: (directory: string, agentId: string | null, extra?: { repoId?: string; name?: string }) => void
}) {
  const { agents } = useAgentStore()
  const folderName = repoName || directory.split('/').pop() || directory
  const [installedStatus, setInstalledStatus] = useState<Record<string, boolean>>({})
  const [warningAgentId, setWarningAgentId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function checkInstalled() {
      const status: Record<string, boolean> = {}
      await Promise.all(
        agents.map(async (agent) => {
          try {
            status[agent.id] = await window.agents.isInstalled(agent.command)
          } catch {
            status[agent.id] = false
          }
        })
      )
      if (!cancelled) setInstalledStatus(status)
    }
    checkInstalled()
    return () => { cancelled = true }
  }, [agents])

  const handleAgentClick = (agentId: string) => {
    const isInstalled = installedStatus[agentId] !== false
    if (!isInstalled && warningAgentId !== agentId) {
      setWarningAgentId(agentId)
      return
    }
    onComplete(directory, agentId, repoId ? { repoId, name: repoName } : undefined)
  }

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-medium text-text-primary">Select Agent</h2>
          <p className="text-xs text-text-secondary font-mono">{folderName}</p>
        </div>
      </div>

      <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
        {agents.map((agent) => {
          const isInstalled = installedStatus[agent.id] !== false
          const showWarning = warningAgentId === agent.id
          return (
            <div key={agent.id}>
              <button
                onClick={() => handleAgentClick(agent.id)}
                className="w-full flex items-center gap-3 p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-left"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: agent.color || '#4a9eff' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-text-primary flex items-center gap-2">
                    {agent.name}
                    {!isInstalled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-normal">
                        not installed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-secondary font-mono truncate">{agent.command}</div>
                </div>
              </button>
              {showWarning && (
                <div className="mt-1 ml-6 p-2 rounded bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-300">
                  <span className="font-medium">{agent.command}</span> was not found on your PATH.
                  Install it first, or click again to proceed anyway.
                </div>
              )}
            </div>
          )
        })}

        <button
          onClick={() => onComplete(directory, null, repoId ? { repoId, name: repoName } : undefined)}
          className="w-full flex items-center gap-3 p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-left"
        >
          <div className="w-3 h-3 rounded-full flex-shrink-0 bg-text-secondary" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-text-primary">Shell Only</div>
            <div className="text-xs text-text-secondary">No agent, just a terminal</div>
          </div>
        </button>

        {agents.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-4">
            No agents configured. Add agents in Settings.
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border flex justify-end">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </>
  )
}
