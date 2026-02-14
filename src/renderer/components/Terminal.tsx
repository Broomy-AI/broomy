/**
 * xterm.js terminal wrapper that manages a PTY connection and detects agent activity.
 *
 * Creates an xterm.js instance, connects it to a backend PTY via IPC, and handles
 * auto-fit on resize, scroll-following with manual disengage, and viewport desync
 * repair. For agent terminals, it runs time-based activity detection: output within
 * a suppression window after user input is ignored, otherwise new data sets status
 * to "working" and 1 second of silence sets it to "idle". Transitions from working
 * to idle (after at least 3 seconds) mark the session as unread. Also detects plan
 * file paths in agent output via a rolling buffer regex match.
 */
import { useRef, useState, useCallback } from 'react'
import { useTerminalSetup } from '../hooks/useTerminalSetup'
import type { TerminalConfig } from '../hooks/useTerminalSetup'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  sessionId?: string
  cwd: string
  command?: string
  env?: Record<string, string>
  isAgentTerminal?: boolean
  isActive?: boolean
}

export default function Terminal({ sessionId, cwd, command, env, isAgentTerminal = false, isActive = false }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [restartKey, setRestartKey] = useState(0)

  const config: TerminalConfig = {
    sessionId,
    cwd,
    command,
    env,
    isAgentTerminal,
    isActive,
    restartKey,
  }

  const { terminalRef, ptyIdRef, showScrollButton, handleScrollToBottom } = useTerminalSetup(config, containerRef)

  const handleContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    const hasSelection = terminalRef.current?.hasSelection() ?? false
    const items = [
      { id: 'copy', label: 'Copy', enabled: hasSelection },
      { id: 'paste', label: 'Paste' },
      ...(isAgentTerminal ? [
        { id: 'sep', label: '', type: 'separator' as const },
        { id: 'restart-agent', label: 'Restart Agent' },
      ] : []),
    ]
    const result = await window.menu.popup(items)
    if (result === 'copy' && terminalRef.current) {
      const text = terminalRef.current.getSelection()
      if (text) void navigator.clipboard.writeText(text)
    } else if (result === 'paste' && ptyIdRef.current) {
      const text = await navigator.clipboard.readText()
      if (text) void window.pty.write(ptyIdRef.current, text)
    } else if (result === 'restart-agent') {
      setRestartKey((k) => k + 1)
    }
  }, [isAgentTerminal, terminalRef, ptyIdRef])

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Select a session to view terminal
      </div>
    )
  }

  return (
    <div className="h-full w-full p-2 relative" onContextMenu={handleContextMenu}>
      <div ref={containerRef} className="h-full w-full" />
      {showScrollButton && (
        <button
          onClick={handleScrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 text-xs font-medium rounded-full bg-accent text-white hover:bg-accent/80 shadow-lg transition-colors z-10"
        >
          Go to End &#x2193;
        </button>
      )}
    </div>
  )
}
