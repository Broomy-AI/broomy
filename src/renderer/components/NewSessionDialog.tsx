import { useAgentStore, type AgentConfig } from '../store/agents'

interface NewSessionDialogProps {
  folderPath: string
  onSelect: (agentId: string | null) => void
  onCancel: () => void
}

export default function NewSessionDialog({
  folderPath,
  onSelect,
  onCancel,
}: NewSessionDialogProps) {
  const { agents } = useAgentStore()

  const folderName = folderPath.split('/').pop() || folderPath

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-secondary rounded-lg shadow-xl border border-border w-full max-w-md mx-4">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">New Session</h2>
          <p className="text-sm text-text-secondary mt-1">
            Select an agent for <span className="font-mono text-text-primary">{folderName}</span>
          </p>
        </div>

        {/* Agent list */}
        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              className="w-full flex items-center gap-3 p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-left"
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: agent.color || '#4a9eff' }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-text-primary">
                  {agent.name}
                </div>
                <div className="text-xs text-text-secondary font-mono truncate">
                  {agent.command}
                </div>
              </div>
            </button>
          ))}

          {/* Shell only option */}
          <button
            onClick={() => onSelect(null)}
            className="w-full flex items-center gap-3 p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-left"
          >
            <div className="w-3 h-3 rounded-full flex-shrink-0 bg-text-secondary" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-text-primary">
                Shell Only
              </div>
              <div className="text-xs text-text-secondary">
                No agent, just a terminal
              </div>
            </div>
          </button>

          {agents.length === 0 && (
            <div className="text-center text-text-secondary text-sm py-4">
              No agents configured.
              <br />
              Add agents in Settings.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
