/**
 * IPC handlers for pseudo-terminal (PTY) lifecycle management.
 *
 * Creates, resizes, writes to, and destroys PTY processes using node-pty.
 * In E2E mode, spawns a fake shell script for deterministic test output.
 */
import { BrowserWindow, IpcMain } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { isWindows, getDefaultShell, resolveCommand, enhancedPath } from '../platform'
import { HandlerContext } from './types'
import { getScenarioData } from './scenarios'
import { isDockerAvailable, dockerSetupMessage, ensureAgentInstalled, acquireSetupLock } from '../containerUtils'
import { isDevcontainerCliAvailable, hasDevcontainerConfig, devcontainerUp, buildDevcontainerExecArgs, devcontainerSetupMessage } from '../devcontainer'
import { treeKill, parsePsSnapshot, collectDescendants, type ExtraPid } from '../treeKill'
import { recordPtyMarker, removePtyMarker } from '../ptyMarkers'
import { trackPty, untrackPty, getHistoricalDescendants, getAllStats } from '../descendantsTracker'
import { execFileSync } from 'child_process'

/**
 * Resolve the base command to its full path so agents installed outside
 * PATH (e.g. ~/.local/bin, %USERPROFILE%\.local\bin) can still be launched.
 */
function resolveInitialCommand(command: string, isE2ETest: boolean): string {
  if (isE2ETest) return command
  const parts = command.trim().split(/\s+/)
  const baseCmd = parts[0]
  const resolved = resolveCommand(baseCmd)
  if (resolved && resolved !== baseCmd) {
    parts[0] = isWindows ? `"${resolved}"` : resolved
    return parts.join(' ')
  }
  return command
}

/** Disposables for each PTY's onData/onExit listeners, keyed by PTY id. */
const ptyDisposables = new Map<string, { dispose: () => void }[]>()

/** Dispose all PTY listeners for PTYs owned by the given window. */
export function disposePtyListenersForWindow(ownerWindows: Map<string, BrowserWindow>, window: BrowserWindow) {
  for (const [id, owner] of ownerWindows) {
    if (owner === window) {
      disposePtyListeners(id)
    }
  }
}

/** Dispose all PTY listeners. */
export function disposeAllPtyListeners() {
  for (const [id] of ptyDisposables) {
    disposePtyListeners(id)
  }
}

/** Dispose all event listeners for a PTY and remove from the disposables map. */
function disposePtyListeners(id: string) {
  const disposables = ptyDisposables.get(id)
  if (disposables) {
    for (const d of disposables) d.dispose()
    ptyDisposables.delete(id)
  }
}

/** Wire onData/onExit events for a PTY, registering it in the context maps. */
function wirePtyEvents(ctx: HandlerContext, ptyProcess: IPty, id: string, senderWindow: BrowserWindow | null) {
  ctx.ptyProcesses.set(id, ptyProcess)
  if (senderWindow) ctx.ptyOwnerWindows.set(id, senderWindow)
  // Drop a marker so a future Broomy startup can sweep this shell if we crash.
  // The periodic tracker will overwrite this with the descendant list (and
  // backfilled startTime) as it discovers children.
  recordPtyMarker(id, ptyProcess.pid)
  trackPty(id, ptyProcess.pid)

  const dataDisposable = ptyProcess.onData((data) => {
    try {
      const ownerWindow = ctx.ptyOwnerWindows.get(id) || ctx.mainWindow
      if (ownerWindow && !ownerWindow.isDestroyed()) {
        ownerWindow.webContents.send(`pty:data:${id}`, data)
      }
    } catch {
      // Swallow errors to prevent native crash from NAPI callback propagation
    }
  })

  const exitDisposable = ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    try {
      const ownerWindow = ctx.ptyOwnerWindows.get(id) || ctx.mainWindow
      if (ownerWindow && !ownerWindow.isDestroyed()) {
        ownerWindow.webContents.send(`pty:exit:${id}`, exitCode)
      }
    } catch {
      // Swallow errors to prevent native crash from NAPI callback propagation
    }
    // The shell exited on its own — claude crashed, user typed `exit`, etc.
    // Any descendants that detached (MCP servers, dev servers, jest workers)
    // are now orphans of init and would survive forever unless we sweep them.
    // Pass the historical descendant list so detached daemons are reached.
    const historical = getHistoricalDescendants(id)
    if (historical.length > 0) {
      void treeKill(ptyProcess.pid, undefined, historical)
    }
    disposePtyListeners(id)
    ctx.ptyProcesses.delete(id)
    ctx.ptyOwnerWindows.delete(id)
    untrackPty(id)
    removePtyMarker(id)
  })

  ptyDisposables.set(id, [dataDisposable, exitDisposable])
}

/**
 * Send ANSI error text directly to the terminal, then signal exit.
 * No bash process needed — avoids shell prompt artifacts.
 */
function displayTerminalError(id: string, message: string, senderWindow: BrowserWindow | null) {
  const send = (channel: string, data: unknown) => {
    if (senderWindow && !senderWindow.isDestroyed()) {
      senderWindow.webContents.send(channel, data)
    }
  }

  setTimeout(() => {
    send(`pty:data:${id}`, `\x1b[31m${message}\x1b[0m\r\n`)
    setTimeout(() => {
      send(`pty:exit:${id}`, 1)
    }, 50)
  }, 150)
}

/**
 * Extract the base agent command from a full command string.
 * e.g. "claude --dangerously-skip-permissions" → "claude"
 */
function extractAgentCommand(command: string): string {
  return command.trim().split(/\s+/)[0]
}

/**
 * Handle devcontainer isolation PTY creation with two-phase flow.
 * Uses devcontainer CLI to start/reuse a dev container, then docker exec for interactive PTY.
 *
 * When no .devcontainer/devcontainer.json is found, degrades gracefully:
 * sends a warning to the terminal and emits pty:devcontainer-missing so the
 * UI can show a banner, then returns 'fallthrough' to let the caller use the
 * standard non-isolated PTY path instead.
 */
function createDevcontainerPty(
  ctx: HandlerContext,
  options: { id: string; cwd: string; command?: string; sessionId: string; env?: Record<string, string>; repoRootDir?: string },
  senderWindow: BrowserWindow | null,
): { id: string } | 'fallthrough' | null {
  const { id, cwd, command } = options
  // Devcontainer workspace folder = the worktree directory (cwd), not repoRootDir.
  // Each worktree may have a different .devcontainer/devcontainer.json, so each
  // gets its own container. Docker layer caching handles image reuse across worktrees
  // when configs are identical.
  const workspaceFolder = cwd

  // Check for devcontainer config synchronously — if missing, degrade gracefully
  // to the standard non-isolated PTY path
  if (!hasDevcontainerConfig(workspaceFolder)) {
    // Notify renderer so it can show a warning banner
    if (senderWindow && !senderWindow.isDestroyed()) {
      senderWindow.webContents.send('pty:devcontainer-missing', { sessionId: options.sessionId })
    }
    return 'fallthrough'
  }

  const sendToTerminal = (text: string) => {
    if (senderWindow && !senderWindow.isDestroyed()) {
      senderWindow.webContents.send(`pty:data:${id}`, text)
    }
  }

  pendingSetups.add(id)
  const asyncSetup = async () => {
    sendToTerminal('\x1b[2m── Starting dev container ──\x1b[22m\r\n')

    // Check devcontainer CLI availability
    const status = await isDevcontainerCliAvailable()
    if (!status.available) {
      displayTerminalError(id, devcontainerSetupMessage(status), senderWindow)
      return
    }

    // Check Docker availability (devcontainer CLI needs Docker)
    const dockerStatus = await isDockerAvailable()
    if (!dockerStatus.available) {
      displayTerminalError(id, dockerSetupMessage(dockerStatus), senderWindow)
      return
    }

    // Acquire per-repo lock
    const releaseLock = await acquireSetupLock(workspaceFolder)
    let containerId: string
    let remoteUser: string
    let remoteWorkspaceFolder: string
    let postAttachCommand: string | undefined
    try {
      // Run devcontainer up
      const result = await devcontainerUp(workspaceFolder, sendToTerminal)
      if (!result.success || !result.result) {
        displayTerminalError(id,
          `Dev container failed to start: ${result.error || 'Unknown error'}`,
          senderWindow)
        return
      }
      containerId = result.result.containerId
      remoteUser = result.result.remoteUser
      remoteWorkspaceFolder = result.result.remoteWorkspaceFolder
      postAttachCommand = result.result.postAttachCommand

      // Store container info for DockerInfoPanel
      ctx.dockerContainers.set(workspaceFolder, {
        containerId,
        repoDir: workspaceFolder,
        image: 'devcontainer',
      })

      // Install agent if a command was specified
      if (command) {
        const agentCmd = extractAgentCommand(command)
        const installResult = await ensureAgentInstalled(containerId, agentCmd, sendToTerminal)
        if (!installResult.success) {
          displayTerminalError(id,
            `Failed to install ${agentCmd}: ${installResult.error || 'Unknown error'}`,
            senderWindow)
          return
        }
      }
    } finally {
      releaseLock()
    }

    // Check if session was killed during async setup
    if (!pendingSetups.has(id)) return

    sendToTerminal('\x1b[2m── Dev container ready ──\x1b[22m\r\n\r\n')

    // Notify renderer about devcontainer readiness (for Services tab)
    if (postAttachCommand && senderWindow && !senderWindow.isDestroyed()) {
      senderWindow.webContents.send('pty:devcontainer-ready', {
        sessionId: options.sessionId,
        postAttachCommand,
        containerId,
        remoteUser,
      })
    }

    // Start docker exec PTY using devcontainer's remote user.
    // Default CLAUDE_CODE_NO_FLICKER=1 first so per-session env can override
    // it (see standard PTY path for rationale).
    const containerHome = remoteUser === 'root' ? '/root' : `/home/${remoteUser}`
    const dockerEnv: Record<string, string> = { CLAUDE_CODE_NO_FLICKER: '1' }
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        if (value.startsWith('~/')) {
          dockerEnv[key] = `${containerHome}/${value.slice(2)}`
        } else if (value === '~') {
          dockerEnv[key] = containerHome
        } else {
          dockerEnv[key] = value
        }
      }
    }
    const dockerArgs = buildDevcontainerExecArgs(containerId, remoteUser, remoteWorkspaceFolder, dockerEnv, command)

    let ptyProcess: IPty
    try {
      ptyProcess = pty.spawn('docker', dockerArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
      })
    } catch (err) {
      displayTerminalError(id, `Failed to spawn Docker process: ${err instanceof Error ? err.message : String(err)}`, senderWindow)
      return
    }
    const earlyExitDisposable = ptyProcess.onExit(() => {}) // prevent unhandled-exit crashes

    // Final check: session may have been killed between spawn and wire.
    // wirePtyEvents hasn't run yet so no marker exists — just kill the docker
    // exec process tree.
    if (!pendingSetups.has(id)) {
      earlyExitDisposable.dispose()
      void treeKill(ptyProcess.pid)
      return
    }
    pendingSetups.delete(id)
    earlyExitDisposable.dispose()
    wirePtyEvents(ctx, ptyProcess, id, senderWindow)
  }

  asyncSetup().catch((err: unknown) => {
    pendingSetups.delete(id)
    displayTerminalError(id, `Unexpected error: ${err instanceof Error ? err.message : String(err)}`, senderWindow)
  })

  return { id }
}

/** Resolve shell, args, and initial command for the standard (non-isolated) PTY path. */
function resolveShellConfig(
  ctx: HandlerContext,
  options: { command?: string; sessionId?: string; shell?: string },
): { shell: string; shellArgs: string[]; initialCommand: string | undefined; extraEnv?: Record<string, string> } {
  let initialCommand: string | undefined = options.command

  if (ctx.isE2ETest) {
    if (isWindows) {
      const shell = process.env.ComSpec || 'cmd.exe'
      if (options.command) {
        const fakeClaude = join(__dirname, '../../scripts/fake-claude.ps1')
        initialCommand = `powershell -ExecutionPolicy Bypass -File "${fakeClaude}"`
      } else {
        initialCommand = 'echo E2E_TEST_SHELL_READY'
      }
      return { shell, shellArgs: [], initialCommand, extraEnv: options.command ? { BROOMY_ORIGINAL_COMMAND: options.command } : undefined }
    }
    const shell = '/bin/bash'
    if (options.command) {
      const scenarioScript = getScenarioData(ctx.e2eScenario).agentScript(options.sessionId || '')
      const fakeClaude = scenarioScript
        ? join(__dirname, `../../scripts/${scenarioScript}`)
        : ctx.FAKE_CLAUDE_SCRIPT || join(__dirname, '../../scripts/fake-claude.sh')
      initialCommand = `bash "${fakeClaude}"`
    } else {
      initialCommand = 'echo "E2E_TEST_SHELL_READY"; PS1="test-shell$ "'
    }
    return { shell, shellArgs: [], initialCommand, extraEnv: options.command ? { BROOMY_ORIGINAL_COMMAND: options.command } : undefined }
  }

  if (ctx.E2E_MOCK_SHELL) {
    const shell = isWindows ? (process.env.ComSpec || 'cmd.exe') : '/bin/bash'
    const shellArgs = isWindows ? ['/c', ctx.E2E_MOCK_SHELL] : [ctx.E2E_MOCK_SHELL]
    return { shell, shellArgs, initialCommand }
  }

  const shell = options.shell || getDefaultShell()
  let shellArgs: string[] = []
  if (initialCommand && !isWindows) {
    shellArgs = ['-l', '-i', '-c', initialCommand]
    initialCommand = undefined
  }
  return { shell, shellArgs, initialCommand }
}

/** Track in-flight async PTY setups so pty:kill can cancel them. */
const pendingSetups = new Set<string>()

/** Map PTY ID prefix → session ID (renderer-derived) for stats aggregation. */
function sessionIdFromPtyId(ptyId: string): string | null {
  // Conventions used by the renderer (TabbedTerminal + useTerminalSetup):
  //   `${sessionId}-${ts}`                         (agent terminal)
  //   `user-${sessionId}-${tabId}-${ts}`           (user tab)
  //   `services-${sessionId}-${ts}`                (services terminal)
  if (ptyId.startsWith('user-')) {
    const rest = ptyId.slice('user-'.length)
    const tabIdx = rest.indexOf('-tab-')
    if (tabIdx > 0) return rest.slice(0, tabIdx)
  }
  if (ptyId.startsWith('services-')) {
    const rest = ptyId.slice('services-'.length)
    const dash = rest.lastIndexOf('-')
    return dash > 0 ? rest.slice(0, dash) : rest
  }
  const dash = ptyId.lastIndexOf('-')
  return dash > 0 ? ptyId.slice(0, dash) : ptyId
}

/** Per-session usage stats returned to the renderer for the sidebar. */
export interface SessionUsageStats {
  rssMb: number
  cpuPct: number
  ptyCount: number
}

/** Build a sessionId → usage stats map from the tracker. */
function ptyStatsForRenderer(): Record<string, SessionUsageStats> {
  const perPty = getAllStats()
  const out: Record<string, SessionUsageStats> = {}
  for (const [ptyId, stats] of Object.entries(perPty)) {
    const sessionId = sessionIdFromPtyId(ptyId)
    if (!sessionId) continue
    const acc = out[sessionId] ?? { rssMb: 0, cpuPct: 0, ptyCount: 0 }
    acc.rssMb += stats.rssMb
    acc.cpuPct += stats.cpuPct
    acc.ptyCount += 1
    out[sessionId] = acc
  }
  // Round once at the end to avoid drift across additions
  for (const sessionId of Object.keys(out)) {
    out[sessionId].rssMb = Math.round(out[sessionId].rssMb)
    out[sessionId].cpuPct = Math.round(out[sessionId].cpuPct * 10) / 10
  }
  return out
}

/**
 * Find every PID we've ever seen as a descendant of an active PTY that is no
 * longer reachable from its shell's live tree, and SIGKILL it. Catches
 * detached daemons (next dev, MCP servers, expo, jest workers, …) whose
 * parent has exited or who called `setpgid()` + got reparented to init.
 *
 * Each candidate carries the `startTime` we observed when first tracked, so
 * treeKill can verify identity and skip PIDs that have rolled over to
 * unrelated processes.
 */
async function killOrphans(ctx: HandlerContext): Promise<number> {
  // Snapshot the process table once so we can ask "is this PID still in any
  // tracked PTY's live tree?" without re-running ps for every check.
  let snapshot: ReturnType<typeof parsePsSnapshot> = []
  try {
    const stdout = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid='], { encoding: 'utf-8', timeout: 5000 })
    snapshot = parsePsSnapshot(stdout)
  } catch {
    return 0
  }
  const livePids = new Set(snapshot.map((r) => r.pid))

  // Union: every PID currently reachable from any tracked shell.
  const reachable = new Set<number>()
  for (const id of ctx.ptyProcesses.keys()) {
    const ptyProcess = ctx.ptyProcesses.get(id)
    if (!ptyProcess) continue
    for (const pid of collectDescendants(snapshot, ptyProcess.pid)) {
      reachable.add(pid)
    }
  }

  // Candidates: known historical descendants that are alive but unreachable.
  // Dedupe by PID — a PID could appear in multiple PTYs' histories.
  const orphans = new Map<number, ExtraPid>()
  for (const id of ctx.ptyProcesses.keys()) {
    for (const entry of getHistoricalDescendants(id)) {
      if (entry.pid <= 1) continue
      if (!livePids.has(entry.pid)) continue
      if (reachable.has(entry.pid)) continue
      if (!orphans.has(entry.pid)) orphans.set(entry.pid, entry)
    }
  }

  if (orphans.size === 0) return 0
  await treeKill(NaN, undefined, [...orphans.values()])
  return orphans.size
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('pty:create', async (_event, options: { id: string; cwd: string; command?: string; sessionId?: string; env?: Record<string, string>; shell?: string; isolated?: boolean; repoRootDir?: string }) => {
    // Kill any existing PTY with the same ID (e.g. React strict mode double-mount)
    const existing = ctx.ptyProcesses.get(options.id)
    if (existing) {
      disposePtyListeners(options.id)
      ctx.ptyProcesses.delete(options.id)
      ctx.ptyOwnerWindows.delete(options.id)
      const historical = getHistoricalDescendants(options.id)
      await treeKill(existing.pid, undefined, historical)
      untrackPty(options.id)
      removePtyMarker(options.id)
    }

    const senderWindow = BrowserWindow.fromWebContents(_event.sender)

    // Container isolation path (devcontainer only).
    // When no devcontainer.json exists, createDevcontainerPty returns 'fallthrough'
    // and we degrade gracefully to the standard non-isolated PTY path.
    const allowRealDocker = ctx.isE2ETest && process.env.E2E_REAL_DOCKER === 'true'
    if (options.isolated && (!ctx.isE2ETest || allowRealDocker) && options.sessionId) {
      const result = createDevcontainerPty(ctx, { ...options, sessionId: options.sessionId }, senderWindow)
      if (result !== 'fallthrough') return result
      // Fall through to standard PTY when no devcontainer config
    }

    // Standard (non-isolated) path
    const { shell, shellArgs, initialCommand: resolvedCommand, extraEnv } = resolveShellConfig(ctx, options)
    let initialCommand = resolvedCommand

    // Build environment — extend PATH with common bin dirs so agents in
    // ~/.local/bin, /opt/homebrew/bin, etc. are reachable even if the
    // login shell profile doesn't add them or resolveShellEnv() failed.
    //
    // CLAUDE_CODE_NO_FLICKER=1 opts Claude Code into alt-screen rendering,
    // which avoids the duplicate-content / scroll-yank bugs that arise when
    // its synchronized full-screen redraws are written to the main buffer.
    // See xtermjs/xterm.js#5784 and #5801. Per-session env (agentEnv) is
    // merged after this, so users can override with CLAUDE_CODE_NO_FLICKER=0.
    const baseEnv = {
      ...process.env,
      PATH: enhancedPath(process.env.PATH),
      CLAUDE_CODE_NO_FLICKER: '1',
    } as Record<string, string>
    delete baseEnv.CLAUDE_CONFIG_DIR

    const expandHome = (value: string) => {
      if (value.startsWith('~/')) return join(homedir(), value.slice(2))
      if (value === '~') return homedir()
      return value
    }

    const agentEnv: Record<string, string> = {}
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        const expanded = expandHome(value)
        if (key === 'CLAUDE_CONFIG_DIR' && expanded === join(homedir(), '.claude')) continue
        agentEnv[key] = expanded
      }
    }

    const env = { ...baseEnv, ...agentEnv, ...extraEnv } as Record<string, string>

    let ptyProcess: IPty
    try {
      ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: options.cwd,
        env,
      })
    } catch (err) {
      displayTerminalError(options.id, `Failed to start terminal: ${err instanceof Error ? err.message : String(err)}`, senderWindow)
      return { id: options.id }
    }

    wirePtyEvents(ctx, ptyProcess, options.id, senderWindow)


    if (initialCommand) {
      initialCommand = resolveInitialCommand(initialCommand, ctx.isE2ETest)
      setTimeout(() => {
        if (ctx.ptyProcesses.has(options.id)) {
          ptyProcess.write(`${initialCommand}\r`)
        }
      }, 100)
    }

    return { id: options.id }
  })

  ipcMain.handle('pty:write', (_event, id: string, data: string) => {
    const ptyProcess = ctx.ptyProcesses.get(id)
    if (ptyProcess) {
      ptyProcess.write(data)
    }
  })

  ipcMain.handle('pty:resize', (_event, id: string, cols: number, rows: number) => {
    const ptyProcess = ctx.ptyProcesses.get(id)
    if (ptyProcess) {
      ptyProcess.resize(cols, rows)
    }
  })

  ipcMain.handle('pty:kill', async (_event, id: string) => {
    // Cancel any in-flight async container setup for this ID
    pendingSetups.delete(id)
    const ptyProcess = ctx.ptyProcesses.get(id)
    if (ptyProcess) {
      disposePtyListeners(id)
      ctx.ptyProcesses.delete(id)
      ctx.ptyOwnerWindows.delete(id)
      const historical = getHistoricalDescendants(id)
      await treeKill(ptyProcess.pid, undefined, historical)
      untrackPty(id)
      removePtyMarker(id)
    }
  })

  /**
   * Kill every PTY associated with a session (agent shell + user tabs + services).
   * Used as a defensive backstop from the renderer's archive/remove session
   * actions so we don't rely solely on React-driven unmount cleanup.
   *
   * Matches by ID prefix because the renderer composes PTY IDs as
   *   `${sessionId}-…`, `user-${sessionId}-…`, `services-${sessionId}-…`
   * (see TabbedTerminal / useTerminalSetup).
   */
  ipcMain.handle('pty:killForSession', async (_event, sessionId: string) => {
    if (!sessionId) return 0
    const prefixes = [`${sessionId}-`, `user-${sessionId}-`, `services-${sessionId}-`]
    const matches: string[] = []
    for (const id of ctx.ptyProcesses.keys()) {
      if (prefixes.some((p) => id.startsWith(p))) matches.push(id)
    }
    // Also cancel any container setups still in flight for this session
    for (const id of pendingSetups) {
      if (prefixes.some((p) => id.startsWith(p))) pendingSetups.delete(id)
    }
    const killOps: Promise<void>[] = []
    for (const id of matches) {
      const proc = ctx.ptyProcesses.get(id)
      if (!proc) continue
      disposePtyListeners(id)
      ctx.ptyProcesses.delete(id)
      ctx.ptyOwnerWindows.delete(id)
      const historical = getHistoricalDescendants(id)
      killOps.push(treeKill(proc.pid, undefined, historical).then(() => {
        untrackPty(id)
        removePtyMarker(id)
      }))
    }
    await Promise.all(killOps)
    return matches.length
  })

  /**
   * Snapshot of memory/CPU per tracked PTY. The renderer aggregates these by
   * session ID for the sidebar usage display.
   */
  ipcMain.handle('pty:getStats', () => {
    return ptyStatsForRenderer()
  })

  /**
   * Sweep "orphan" processes: any PID recorded in the historical-descendant
   * list of a tracked PTY that is no longer reachable from the live process
   * tree of its shell. These are detached daemons left behind by `claude`,
   * `next dev`, jest workers, etc. Returns the number of PIDs SIGKILLed.
   */
  ipcMain.handle('pty:killOrphans', async () => {
    return killOrphans(ctx)
  })
}
