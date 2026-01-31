import { useEffect } from 'react'
import Layout from './components/Layout'
import SessionList from './components/SessionList'
import Terminal from './components/Terminal'
import FilePanel from './components/FilePanel'
import AgentSettings from './components/AgentSettings'
import NewSessionDialog from './components/NewSessionDialog'
import { useSessionStore, type Session, type SessionStatus } from './store/sessions'
import { useAgentStore } from './store/agents'

// Re-export types for backwards compatibility
export type { Session, SessionStatus }

function App() {
  const {
    sessions,
    activeSessionId,
    isLoading,
    loadSessions,
    addSession,
    removeSession,
    setActiveSession,
    refreshAllBranches,
  } = useSessionStore()

  const { agents, loadAgents } = useAgentStore()

  const [showFilePanel, setShowFilePanel] = React.useState(false)
  const [showUserTerminal, setShowUserTerminal] = React.useState(false)
  const [showSettings, setShowSettings] = React.useState(false)
  const [pendingFolderPath, setPendingFolderPath] = React.useState<string | null>(null)

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  // Load sessions and agents on mount
  useEffect(() => {
    loadSessions()
    loadAgents()
  }, [loadSessions, loadAgents])

  // Poll for branch changes every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (sessions.length > 0) {
        refreshAllBranches()
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [sessions.length, refreshAllBranches])

  const handleNewSession = async () => {
    const folderPath = await window.dialog.openFolder()
    if (folderPath) {
      // Show agent selection dialog
      setPendingFolderPath(folderPath)
    }
  }

  const handleAgentSelect = async (agentId: string | null) => {
    if (pendingFolderPath) {
      try {
        await addSession(pendingFolderPath, agentId)
      } catch (error) {
        console.error('Failed to add session:', error)
      }
      setPendingFolderPath(null)
    }
  }

  const handleCancelNewSession = () => {
    setPendingFolderPath(null)
  }

  // Helper to get agent command for a session
  const getAgentCommand = (session: Session) => {
    if (!session.agentId) return undefined
    const agent = agents.find((a) => a.id === session.agentId)
    return agent?.command
  }

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-bg-primary flex items-center justify-center">
        <div className="text-text-secondary">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <Layout
        showFilePanel={showFilePanel}
        showUserTerminal={showUserTerminal}
        showSettings={showSettings}
        sidebar={
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSession}
            onNewSession={handleNewSession}
            onDeleteSession={removeSession}
          />
        }
        mainTerminal={
          <div className="h-full w-full relative">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`absolute inset-0 ${session.id === activeSessionId ? '' : 'hidden'}`}
              >
                <Terminal
                  sessionId={session.id}
                  cwd={session.directory}
                  command={getAgentCommand(session)}
                />
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="h-full w-full flex items-center justify-center text-text-secondary">
                <div className="text-center">
                  <p>No sessions yet.</p>
                  <p className="text-sm mt-2">Click "+ New Session" to add a git repository.</p>
                </div>
              </div>
            )}
          </div>
        }
        filePanel={showFilePanel ? <FilePanel directory={activeSession?.directory} /> : null}
        settingsPanel={showSettings ? <AgentSettings onClose={() => setShowSettings(false)} /> : null}
        userTerminal={
          <div className="h-full w-full relative">
            {sessions.map((session) => (
              <div
                key={`user-${session.id}`}
                className={`absolute inset-0 ${session.id === activeSessionId ? '' : 'hidden'}`}
              >
                <Terminal sessionId={`user-${session.id}`} cwd={session.directory} />
              </div>
            ))}
          </div>
        }
        onToggleFilePanel={() => setShowFilePanel(!showFilePanel)}
        onToggleUserTerminal={() => setShowUserTerminal(!showUserTerminal)}
        onToggleSettings={() => setShowSettings(!showSettings)}
      />

      {/* New Session Dialog */}
      {pendingFolderPath && (
        <NewSessionDialog
          folderPath={pendingFolderPath}
          onSelect={handleAgentSelect}
          onCancel={handleCancelNewSession}
        />
      )}
    </>
  )
}

// Need to import React for useState
import React from 'react'

export default App
