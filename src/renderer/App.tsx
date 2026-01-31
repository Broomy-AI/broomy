import { useState } from 'react'
import Layout from './components/Layout'
import SessionList from './components/SessionList'
import Terminal from './components/Terminal'
import FilePanel from './components/FilePanel'

export type SessionStatus = 'working' | 'waiting' | 'idle' | 'error'

export interface Session {
  id: string
  name: string
  directory: string
  branch: string
  status: SessionStatus
}

// Demo sessions for initial UI - use /tmp which exists on all systems
const demoSessions: Session[] = [
  { id: '1', name: 'agent-manager', directory: '/tmp', branch: 'main', status: 'working' },
  { id: '2', name: 'backend-api', directory: '/tmp', branch: 'feature/auth', status: 'waiting' },
  { id: '3', name: 'docs-site', directory: '/tmp', branch: 'main', status: 'idle' },
]

function App() {
  const [sessions] = useState<Session[]>(demoSessions)
  const [activeSessionId, setActiveSessionId] = useState<string | null>('1')
  const [showFilePanel, setShowFilePanel] = useState(false)
  const [showUserTerminal, setShowUserTerminal] = useState(false)

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  return (
    <Layout
      showFilePanel={showFilePanel}
      showUserTerminal={showUserTerminal}
      sidebar={
        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={() => console.log('New session')}
        />
      }
      mainTerminal={
        <Terminal
          sessionId={activeSession?.id}
          cwd={activeSession?.directory || process.cwd()}
        />
      }
      filePanel={showFilePanel ? <FilePanel directory={activeSession?.directory} /> : null}
      userTerminal={
        showUserTerminal ? (
          <Terminal
            sessionId={activeSession ? `user-${activeSession.id}` : undefined}
            cwd={activeSession?.directory || process.cwd()}
          />
        ) : null
      }
      onToggleFilePanel={() => setShowFilePanel(!showFilePanel)}
      onToggleUserTerminal={() => setShowUserTerminal(!showUserTerminal)}
    />
  )
}

export default App
