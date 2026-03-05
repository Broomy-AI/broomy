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
import { isWindows, getDefaultShell, resolveWindowsCommand } from '../platform'
import { HandlerContext } from './types'
import { getScenarioData } from './scenarios'
import { isDockerAvailable, dockerSetupMessage, ensureAgentInstalled, acquireSetupLock } from '../containerUtils'
import { isDevcontainerCliAvailable, hasDevcontainerConfig, devcontainerUp, buildDevcontainerExecArgs, devcontainerSetupMessage } from '../devcontainer'

/**
 * On Windows, resolve the base command to its full path so agents installed
 * outside PATH (e.g. %USERPROFILE%\.local\bin) can still be launched.
 */
function resolveInitialCommand(command: string, isE2ETest: boolean): string {
  if (!isWindows || isE2ETest) return command
  const parts = command.trim().split(/\s+/)
  const baseCmd = parts[0]
  const resolved = resolveWindowsCommand(baseCmd)
  if (resolved && resolved !== baseCmd) {
    parts[0] = `"${resolved}"`
    return parts.join(' ')
  }
  return command
}

/** Wire onData/onExit events for a PTY, registering it in the context maps. */
function wirePtyEvents(ctx: HandlerContext, ptyProcess: IPty, id: string, senderWindow: BrowserWindow | null) {
  ctx.ptyProcesses.set(id, ptyProcess)
  if (senderWindow) ctx.ptyOwnerWindows.set(id, senderWindow)

  ptyProcess.onData((data) => {
    const ownerWindow = ctx.ptyOwnerWindows.get(id) || ctx.mainWindow
    if (ownerWindow && !ownerWindow.isDestroyed()) {
      ownerWindow.webContents.send(`pty:data:${id}`, data)
    }
  })

  ptyProcess.onExit(({ exitCode }) => {
    const ownerWindow = ctx.ptyOwnerWindows.get(id) || ctx.mainWindow
    if (ownerWindow && !ownerWindow.isDestroyed()) {
      ownerWindow.webContents.send(`pty:exit:${id}`, exitCode)
    }
    ctx.ptyProcesses.delete(id)
    ctx.ptyOwnerWindows.delete(id)
  })
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

    // Start docker exec PTY using devcontainer's remote user
    const containerHome = remoteUser === 'root' ? '/root' : `/home/${remoteUser}`
    const dockerEnv: Record<string, string> = {}
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
    const dockerArgs = buildDevcontainerExecArgs(containerId, remoteUser, cwd, dockerEnv, command)

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
    ptyProcess.onExit(() => {}) // prevent unhandled-exit crashes

    // Final check: session may have been killed between spawn and wire
    if (!pendingSetups.has(id)) {
      ptyProcess.kill()
      return
    }
    pendingSetups.delete(id)
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
): { shell: string; shellArgs: string[]; initialCommand: string | undefined } {
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
      return { shell, shellArgs: [], initialCommand }
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
    return { shell, shellArgs: [], initialCommand }
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

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('pty:create', (_event, options: { id: string; cwd: string; command?: string; sessionId?: string; env?: Record<string, string>; shell?: string; isolated?: boolean; repoRootDir?: string }) => {
    // Kill any existing PTY with the same ID (e.g. React strict mode double-mount)
    const existing = ctx.ptyProcesses.get(options.id)
    if (existing) {
      existing.kill()
      ctx.ptyProcesses.delete(options.id)
      ctx.ptyOwnerWindows.delete(options.id)
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
    const { shell, shellArgs, initialCommand: resolvedCommand } = resolveShellConfig(ctx, options)
    let initialCommand = resolvedCommand

    // Build environment
    const baseEnv = { ...process.env } as Record<string, string>
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

    const env = { ...baseEnv, ...agentEnv } as Record<string, string>

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

  ipcMain.handle('pty:kill', (_event, id: string) => {
    // Cancel any in-flight async container setup for this ID
    pendingSetups.delete(id)
    const ptyProcess = ctx.ptyProcesses.get(id)
    if (ptyProcess) {
      ptyProcess.kill()
      ctx.ptyProcesses.delete(id)
      ctx.ptyOwnerWindows.delete(id)
    }
  })
}
