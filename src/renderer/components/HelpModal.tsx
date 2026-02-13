import { useState } from 'react'

interface HelpModalProps {
  onClose: () => void
}

type TabId = 'overview' | 'shortcuts' | 'agents'

// Detect if we're on Mac for keyboard shortcut display
const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().includes('MAC')
const modKey = isMac ? 'Cmd' : 'Ctrl'

export default function HelpModal({ onClose }: HelpModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'shortcuts', label: 'Shortcuts' },
    { id: 'agents', label: 'Agents' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-secondary border border-border rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">Help</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'text-accent border-accent'
                  : 'text-text-secondary border-transparent hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-medium text-text-primary mb-3">What is Broomy?</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Broomy is a desktop app for managing multiple AI coding agent sessions across different repositories.
                  Each session runs an AI agent (like Claude Code, Codex, or Gemini CLI) in its own Git worktree,
                  allowing you to work on multiple features or fixes simultaneously.
                </p>
              </section>

              <section>
                <h3 className="text-sm font-medium text-text-primary mb-3">Key Concepts</h3>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="font-medium text-text-primary">Sessions</dt>
                    <dd className="text-text-secondary">Each session represents a development task with its own directory and optional AI agent.</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-text-primary">Worktrees</dt>
                    <dd className="text-text-secondary">Git worktrees let you have multiple branches checked out at once. Broomy auto-creates these for new sessions.</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-text-primary">Agents</dt>
                    <dd className="text-text-secondary">AI coding assistants that run in the terminal. Configure them in Settings.</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-text-primary">Panels</dt>
                    <dd className="text-text-secondary">Toggle different views (Explorer, File Viewer, Terminal) using the toolbar or keyboard shortcuts.</dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3 className="text-sm font-medium text-text-primary mb-3">Quick Start</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-text-secondary">
                  <li>Click "+ New Session" to add a repository</li>
                  <li>Choose an existing folder or clone from GitHub</li>
                  <li>Select an AI agent (or leave empty for no agent)</li>
                  <li>Start coding with AI assistance</li>
                </ol>
              </section>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-medium text-text-primary mb-3">Panel Shortcuts</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Toggle Sessions</span>
                    <kbd className="px-2 py-0.5 rounded bg-bg-tertiary text-text-primary">{modKey}+1</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Toggle Explorer</span>
                    <kbd className="px-2 py-0.5 rounded bg-bg-tertiary text-text-primary">{modKey}+2</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Toggle File Viewer</span>
                    <kbd className="px-2 py-0.5 rounded bg-bg-tertiary text-text-primary">{modKey}+3</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Toggle Agent</span>
                    <kbd className="px-2 py-0.5 rounded bg-bg-tertiary text-text-primary">{modKey}+4</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Toggle Terminal</span>
                    <kbd className="px-2 py-0.5 rounded bg-bg-tertiary text-text-primary">{modKey}+5</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Toggle Guide</span>
                    <kbd className="px-2 py-0.5 rounded bg-bg-tertiary text-text-primary">{modKey}+6</kbd>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-medium text-text-primary mb-3">Navigation</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Cycle Panels Forward</span>
                    <kbd className="px-2 py-0.5 rounded bg-bg-tertiary text-text-primary">Ctrl+Tab</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Cycle Panels Backward</span>
                    <kbd className="px-2 py-0.5 rounded bg-bg-tertiary text-text-primary">Ctrl+Shift+Tab</kbd>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-medium text-text-primary mb-3">Debug</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Copy Terminal + Info</span>
                    <kbd className="px-2 py-0.5 rounded bg-bg-tertiary text-text-primary">{modKey}+Shift+C</kbd>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-medium text-text-primary mb-3">Supported Agents</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-bg-tertiary rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#D97757' }} />
                      <span className="font-medium text-text-primary text-sm">Claude Code</span>
                    </div>
                    <p className="text-xs text-text-secondary">
                      Anthropic's CLI agent. Install with: <code className="bg-bg-secondary px-1 rounded">npm install -g @anthropic-ai/claude-code</code>
                    </p>
                  </div>
                  <div className="p-4 bg-bg-tertiary rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#10A37F' }} />
                      <span className="font-medium text-text-primary text-sm">Codex</span>
                    </div>
                    <p className="text-xs text-text-secondary">
                      OpenAI's CLI agent. Install with: <code className="bg-bg-secondary px-1 rounded">npm install -g @openai/codex</code>
                    </p>
                  </div>
                  <div className="p-4 bg-bg-tertiary rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#4285F4' }} />
                      <span className="font-medium text-text-primary text-sm">Gemini CLI</span>
                    </div>
                    <p className="text-xs text-text-secondary">
                      Google's CLI agent. Install with: <code className="bg-bg-secondary px-1 rounded">npm install -g @google/gemini-cli</code>
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-medium text-text-primary mb-3">Custom Agents</h3>
                <p className="text-sm text-text-secondary">
                  You can add any command-line tool as an agent in Settings. Just provide a name and the command to run.
                  Environment variables can also be configured per-agent.
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
