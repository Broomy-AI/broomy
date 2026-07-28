/**
 * xterm.js terminal wrapper that manages a PTY connection and detects agent activity.
 *
 * Creates an xterm.js instance, connects it to a backend PTY via IPC, and handles
 * auto-fit on resize and scroll-following with manual disengage.
 * For agent terminals, it runs time-based activity detection: output within
 * a suppression window after user input is ignored, otherwise new data sets status
 * to "working" and 3 seconds of silence sets it to "idle". Transitions from working
 * to idle (after at least 3 seconds) mark the session as unread. Also detects plan
 * file paths in agent output via a rolling buffer regex match.
 */
import { useRef, useState, useCallback, useEffect } from 'react'
import { useTerminalSetup } from './hooks/useTerminalSetup'
import type { TerminalConfig, ExitInfo } from './hooks/useTerminalSetup'
import { useErrorStore } from '../../store/errors'
import { getAgentInstallUrl } from '../../shared/utils/agentInstallUrls'
import { sendAgentPrompt } from '../../shared/utils/focusHelpers'
import { FILE_PATH_MIME } from '../../../shared/dnd'
import { extractDroppedPaths, formatPathsForShell } from './utils/droppedFilePaths'
import '@xterm/xterm/css/xterm.css'
import './terminal-scroll.css'

interface TerminalProps {
  sessionId?: string
  cwd: string
  command?: string
  env?: Record<string, string>
  isAgentTerminal?: boolean
  isServicesTerminal?: boolean
  agentNotInstalled?: boolean
  isRestored?: boolean
  isolated?: boolean
  repoRootDir?: string
  /** Store session ID — for activation detection without re-rendering. */
  storeSessionId?: string
  /** Tab ID within the session — for activation detection without re-rendering. */
  tabId?: string
}

/** True when a drag carries OS files or an explorer file-path (not a tab reorder, which is text/plain). */
function isFileDrag(dt: DataTransfer): boolean {
  return dt.types.includes('Files') || dt.types.includes(FILE_PATH_MIME)
}

function ExitErrorBanner({ exitInfo, onDismiss }: { exitInfo: ExitInfo; onDismiss: () => void }) {
  const { showErrorDetail } = useErrorStore()

  const handleClick = () => {
    if (exitInfo.detail) {
      showErrorDetail({
        id: 'exit-error',
        message: exitInfo.message,
        displayMessage: exitInfo.message,
        detail: exitInfo.detail,
        scope: 'app',
        dismissed: false,
        timestamp: Date.now(),
      })
    }
  }

  return (
    <div className="mx-2 mt-2 px-3 py-2 rounded bg-danger-base/10 border border-danger-base/30 text-xs text-danger-fg shrink-0 flex items-center justify-between">
      <button
        onClick={handleClick}
        className={`flex-1 text-left ${exitInfo.detail ? 'cursor-pointer hover:text-danger-soft' : 'cursor-default'}`}
        title={exitInfo.detail ? 'Click for details' : undefined}
      >
        {exitInfo.message}
      </button>
      <button className="ml-2 hover:text-danger-soft" onClick={onDismiss} aria-label="Dismiss">
        &times;
      </button>
    </div>
  )
}

function AgentExitBanner({ exitInfo, onRestart }: { exitInfo: ExitInfo; onRestart: () => void }) {
  return (
    <div className="mx-2 mt-2 px-3 py-2 rounded bg-warning-base/10 border border-warning-base/30 text-xs text-warning-soft shrink-0 flex items-center justify-between">
      <span>{exitInfo.message}</span>
      <button
        className="ml-3 px-2 py-0.5 rounded bg-warning-base/20 hover:bg-warning-base/30 font-medium transition-colors"
        onClick={onRestart}
      >
        Restart Agent
      </button>
    </div>
  )
}

export default function Terminal({ sessionId, cwd, command, env, isAgentTerminal = false, isServicesTerminal = false, agentNotInstalled = false, isRestored, isolated, repoRootDir, storeSessionId, tabId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [restartKey, setRestartKey] = useState(0)
  const [resumeDismissed, setResumeDismissed] = useState(false)

  const showResumeBanner = isAgentTerminal && isRestored && !resumeDismissed && !agentNotInstalled

  const handleResume = useCallback(() => {
    if (ptyIdRef.current) {
      void sendAgentPrompt(ptyIdRef.current, '/resume')
    }
    setResumeDismissed(true)
    // Focus the xterm instance after React removes the banner so keyboard
    // input reaches the terminal immediately (e.g. to pick a chat to resume).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        terminalRef.current?.focus()
      })
    })
  }, [])

  const config: TerminalConfig = {
    sessionId,
    cwd,
    command,
    env,
    isAgentTerminal,
    isServicesTerminal,
    restartKey,
    isolated,
    repoRootDir,
    storeSessionId,
    tabId,
  }

  const { terminalRef, ptyIdRef, shellKindRef, isActiveRef, showScrollButton, handleScrollToBottom, exitInfo } = useTerminalSetup(config, containerRef)
  const [exitDismissed, setExitDismissed] = useState(false)

  const handleRestart = useCallback(() => {
    setRestartKey((k) => k + 1)
    setExitDismissed(false)
  }, [])

  // Listen for Agent > Restart Agent menu action
  useEffect(() => {
    if (!isAgentTerminal) return
    const handler = () => {
      if (isActiveRef.current) handleRestart()
    }
    window.addEventListener('agent:restart', handler)
    return () => window.removeEventListener('agent:restart', handler)
  }, [isAgentTerminal, isActiveRef, handleRestart])

  // Select all terminal content when this terminal is the active one
  useEffect(() => {
    const handleSelectAll = () => {
      if (isActiveRef.current && terminalRef.current) {
        terminalRef.current.selectAll()
      }
    }
    window.addEventListener('app:select-all', handleSelectAll)
    return () => window.removeEventListener('app:select-all', handleSelectAll)
  }, [isActiveRef, terminalRef])

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
    try {
      const result = await window.menu.popup(items)
      if (result === 'copy' && terminalRef.current) {
        const text = terminalRef.current.getSelection()
        if (text) void navigator.clipboard.writeText(text)
      } else if (result === 'paste' && ptyIdRef.current) {
        try {
          const text = await navigator.clipboard.readText()
          if (text) void window.pty.write(ptyIdRef.current, text)
        } catch (err) {
          console.warn('[Terminal] Clipboard read failed:', err)
        }
      } else if (result === 'restart-agent') {
        handleRestart()
      }
    } catch (err) {
      console.warn('[Terminal] Context menu failed:', err)
    }
  }, [isAgentTerminal, terminalRef, ptyIdRef])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e.dataTransfer)) return
    // preventDefault first: even when we ultimately write nothing, the webview
    // must never navigate to / open the dropped file (data-loss guard).
    e.preventDefault()
    const paths = extractDroppedPaths(e.dataTransfer)
    // No-op until the shell is known (create not yet resolved, or a restart is
    // in flight) so a path is never mis-quoted — same accepted startup behavior
    // as Paste. Also no-op if nothing survived quoting (e.g. all cmd %/! paths).
    if (!ptyIdRef.current || !shellKindRef.current) return
    const text = formatPathsForShell(paths, shellKindRef.current)
    if (text) void window.pty.write(ptyIdRef.current, text)
  }, [ptyIdRef, shellKindRef])

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Select a session to view terminal
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col" onContextMenu={handleContextMenu} onDragOver={handleDragOver} onDrop={handleDrop}>
      {agentNotInstalled && command && (
        <div className="mx-2 mt-2 px-3 py-2 rounded bg-warning-base/10 border border-warning-base/30 text-xs text-warning-soft shrink-0">
          <span className="font-medium">&ldquo;{command}&rdquo;</span> is not installed.
          {(() => {
            const url = getAgentInstallUrl(command)
            return url ? (
              <>
                {' '}
                <button
                  className="underline hover:text-warning-subtle font-medium"
                  onClick={() => window.shell.openExternal(url)}
                >
                  Install &rarr;
                </button>
              </>
            ) : (
              <span> Install it to use this agent.</span>
            )
          })()}
        </div>
      )}
      {showResumeBanner && (
        <div className="mx-2 mt-2 px-3 py-2 rounded bg-accent/10 border border-accent/30 text-xs text-accent shrink-0 flex items-center justify-between">
          <span>
            Resume your previous conversation?{' '}
            <button className="underline hover:text-accent/80 font-medium" onClick={handleResume}>
              Run /resume &rarr;
            </button>
          </span>
          <button className="ml-2 hover:text-accent/80" onClick={() => setResumeDismissed(true)} aria-label="Dismiss">
            &times;
          </button>
        </div>
      )}
      {exitInfo && !exitDismissed && exitInfo.detail && (
        <ExitErrorBanner exitInfo={exitInfo} onDismiss={() => setExitDismissed(true)} />
      )}
      {exitInfo && isAgentTerminal && !exitInfo.detail && (
        <AgentExitBanner exitInfo={exitInfo} onRestart={handleRestart} />
      )}
      <div className="flex-1 min-h-0 p-2 relative">
        <div ref={containerRef} className="h-full w-full" />
        {showScrollButton && (
        <button
          onClick={handleScrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 text-xs font-medium rounded-full bg-accent text-on-accent hover:bg-accent/80 shadow-lg transition-colors z-10"
        >
          Go to End &#x2193;
        </button>
      )}
      </div>
    </div>
  )
}
