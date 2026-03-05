/**
 * Shared container utilities used by both devcontainer.ts and pty.ts.
 *
 * Extracted from docker.ts to allow deletion of the lightweight Docker
 * isolation path while preserving the shared functionality.
 */
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { platform } from 'os'
import type { DockerStatus } from '../preload/apis/types'

const execFileAsync = promisify(execFile)

/** ANSI escape helpers for styled terminal output. */
const ANSI = {
  dim: (text: string) => `\x1b[2m${text}\x1b[22m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[39m`,
}

/** Mapping from agent command to install command. */
export const AGENT_INSTALL_COMMANDS: Record<string, string> = {
  claude: 'curl -fsSL https://claude.ai/install.sh | bash',
  codex: 'npm install -g @openai/codex',
  gemini: 'npm install -g @google/gemini-cli',
}

/** Known install paths for agents that install outside the default PATH. */
export const AGENT_KNOWN_PATHS: Record<string, string> = {
  claude: '/home/node/.local/bin/claude',
}

/**
 * Per-repo setup lock. Prevents concurrent container creation, setup, and
 * agent install for the same repo — the second caller waits for the first
 * to finish, then gets the already-running container.
 */
const setupLocks = new Map<string, Promise<void>>()

/** Track which repos have an active (unresolved) lock. */
const activeLocks = new Set<string>()

/** Check if a setup lock is currently held for a repo. */
export function isSetupLockHeld(repoDir: string): boolean {
  return activeLocks.has(repoDir)
}

/** Acquire a per-repo lock. Returns a release function. */
export function acquireSetupLock(repoDir: string): Promise<() => void> {
  const prev = setupLocks.get(repoDir) ?? Promise.resolve()
  let release: () => void
  const next = new Promise<void>((resolve) => { release = resolve })
  setupLocks.set(repoDir, next)
  activeLocks.add(repoDir)
  return prev.then(() => {
    // Return a release function that resolves the lock and cleans up
    return () => {
      activeLocks.delete(repoDir)
      // Clean up the map entry if no new waiter has queued behind us
      if (setupLocks.get(repoDir) === next) {
        setupLocks.delete(repoDir)
      }
      release!()
    }
  })
}

export async function isDockerAvailable(): Promise<DockerStatus> {
  try {
    await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'])
    return { available: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Docker CLI not found
    if (message.includes('ENOENT') || message.includes('not found')) {
      const installUrl = platform() === 'darwin'
        ? 'https://docker.com/products/docker-desktop'
        : 'https://docs.docker.com/engine/install/'
      return { available: false, error: 'Docker is not installed', installUrl }
    }

    // Daemon not running
    const installUrl = platform() === 'darwin'
      ? 'https://docker.com/products/docker-desktop'
      : 'https://docs.docker.com/engine/install/'
    return { available: false, error: 'Docker daemon is not running', installUrl }
  }
}

/**
 * Returns a friendly terminal error box when Docker is unavailable.
 */
export function dockerSetupMessage(status: DockerStatus): string {
  const macInstall = '  • macOS: Download Docker Desktop from\n    https://docker.com/products/docker-desktop'
  const linuxInstall = '  • Linux: curl -fsSL https://get.docker.com | sh'

  return [
    '╭────────────────────────────────────────────────────╮',
    '│  Docker is required for container isolation         │',
    '│                                                     │',
    `│  ${status.error || 'Docker is not available'}`,
    '│                                                     │',
    '│  To install:                                        │',
    `│  ${macInstall}`,
    `│  ${linuxInstall}`,
    '│                                                     │',
    '│  After installing, start Docker and restart         │',
    '│  this session.                                      │',
    '│                                                     │',
    '│  Or disable container isolation in repo settings.   │',
    '╰────────────────────────────────────────────────────╯',
    '',
  ].join('\r\n')
}

/**
 * Check if an agent command is installed in the container; if not, install it.
 */
export async function ensureAgentInstalled(
  containerId: string,
  agentCommand: string,
  onProgress: (line: string) => void,
): Promise<{ success: boolean; error?: string }> {
  // Some agents install per-user (e.g. Claude's install script goes to ~/.claude/local/).
  // Check and install as the 'node' user so the agent is available when we exec as 'node'.
  const needsUserInstall = agentCommand === 'claude'
  const userArgs = needsUserInstall ? ['-u', 'node', '-e', 'HOME=/home/node'] : []

  onProgress(`${ANSI.dim('  Checking agent installation...')}\r\n`)

  // Validate agentCommand to prevent shell injection (it's passed to bash -c)
  if (!/^[a-zA-Z0-9._\-/]+$/.test(agentCommand)) {
    return { success: false, error: `Invalid agent command name: ${agentCommand}` }
  }

  const knownPath = AGENT_KNOWN_PATHS[agentCommand]
  try {
    if (knownPath) {
      await execFileAsync('docker', ['exec', ...userArgs, containerId, 'test', '-x', knownPath])
    } else {
      // Use 'which' as a direct command instead of via bash -c to avoid injection
      await execFileAsync('docker', ['exec', ...userArgs, containerId, 'which', agentCommand])
    }
    return { success: true }
  } catch {
    // Not installed — continue to install
  }

  const installCmd = AGENT_INSTALL_COMMANDS[agentCommand]
  if (!installCmd) {
    // Unknown agent — skip install, let docker exec fail naturally if command not found
    return { success: true }
  }

  onProgress(`${ANSI.cyan(`▸ Installing ${agentCommand}...`)}\r\n`)

  return new Promise((resolve) => {
    const child = spawn('docker', [
      'exec', ...userArgs, containerId, 'bash', '-c', installCmd,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    child.stdout.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line) onProgress(`${ANSI.dim(`  ${line}`)}\r\n`)
      }
    })

    child.stderr.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line) onProgress(`${ANSI.dim(`  ${line}`)}\r\n`)
      }
    })

    child.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: `${agentCommand} install exited with code ${code}` })
      }
    })
  })
}
