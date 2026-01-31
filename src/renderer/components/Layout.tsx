import { ReactNode } from 'react'

interface LayoutProps {
  sidebar: ReactNode
  mainTerminal: ReactNode
  filePanel: ReactNode | null
  settingsPanel: ReactNode | null
  userTerminal: ReactNode
  showFilePanel: boolean
  showUserTerminal: boolean
  showSettings: boolean
  onToggleFilePanel: () => void
  onToggleUserTerminal: () => void
  onToggleSettings: () => void
}

export default function Layout({
  sidebar,
  mainTerminal,
  filePanel,
  settingsPanel,
  userTerminal,
  showFilePanel,
  showUserTerminal,
  showSettings,
  onToggleFilePanel,
  onToggleUserTerminal,
  onToggleSettings,
}: LayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Title bar / toolbar - draggable region */}
      <div
        className="h-10 flex items-center justify-between px-4 bg-bg-secondary border-b border-border"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 pl-16">
          <span className="text-sm font-medium text-text-primary">Agent Manager</span>
        </div>
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={onToggleUserTerminal}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              showUserTerminal
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
          >
            Terminal
          </button>
          <button
            onClick={onToggleFilePanel}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              showFilePanel
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
          >
            Files
          </button>
          <button
            onClick={onToggleSettings}
            className={`p-1.5 rounded transition-colors ${
              showSettings
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
            title="Agent Settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <div className="w-56 flex-shrink-0 border-r border-border bg-bg-secondary overflow-y-auto">
          {sidebar}
        </div>

        {/* Center + Right panels */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Main terminal + File panel row */}
          <div className="flex-1 flex min-h-0">
            {/* Main terminal or Settings panel */}
            {settingsPanel ? (
              <div className="flex-1 min-w-0 bg-bg-secondary overflow-y-auto">
                {settingsPanel}
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0 bg-bg-primary">
                  {mainTerminal}
                </div>

                {/* File panel (togglable) */}
                {filePanel && (
                  <div className="w-80 flex-shrink-0 border-l border-border bg-bg-secondary overflow-y-auto">
                    {filePanel}
                  </div>
                )}
              </>
            )}
          </div>

          {/* User terminal (togglable) - always mounted to preserve state */}
          <div
            className={`h-48 flex-shrink-0 border-t border-border bg-bg-primary ${
              showUserTerminal ? '' : 'hidden'
            }`}
          >
            {userTerminal}
          </div>
        </div>
      </div>
    </div>
  )
}
