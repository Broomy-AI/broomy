/**
 * Devcontainer CLI wrapper for container isolation.
 *
 * Uses the `devcontainer` CLI to manage dev containers declaratively.
 * Containers are per-workspace-folder (matching how devcontainers work).
 */
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { HandlerContext } from './handlers/types'
import type { ContainerInfo } from '../preload/apis/types'

const execFileAsync = promisify(execFile)

/** ANSI escape helpers for styled terminal output. */
const ANSI = {
  dim: (text: string) => `\x1b[2m${text}\x1b[22m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[39m`,
}

/** Check if the devcontainer CLI is available. */
export async function isDevcontainerCliAvailable(): Promise<{ available: boolean; error?: string; version?: string }> {
  try {
    const { stdout } = await execFileAsync('devcontainer', ['--version'])
    return { available: true, version: stdout.trim() }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('ENOENT') || message.includes('not found')) {
      return { available: false, error: 'devcontainer CLI is not installed' }
    }
    return { available: false, error: message }
  }
}

/** Check if a .devcontainer config exists in the workspace. */
export function hasDevcontainerConfig(workspaceFolder: string): boolean {
  // Check both standard locations
  if (existsSync(join(workspaceFolder, '.devcontainer', 'devcontainer.json'))) return true
  if (existsSync(join(workspaceFolder, '.devcontainer.json'))) return true
  return false
}

/** Default devcontainer.json content for repos without one. */
export function generateDefaultDevcontainerJson(): { image: string; features: Record<string, object> } {
  return {
    image: 'mcr.microsoft.com/devcontainers/base:ubuntu',
    features: {
      'ghcr.io/devcontainers/features/node:1': {},
      'ghcr.io/devcontainers/features/git:1': {},
      'ghcr.io/devcontainers/features/github-cli:1': {},
    },
  }
}

/** Write a default devcontainer.json to the workspace if one doesn't exist. */
export function writeDefaultDevcontainerConfig(workspaceFolder: string): void {
  const dir = join(workspaceFolder, '.devcontainer')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const configPath = join(dir, 'devcontainer.json')
  const config = generateDefaultDevcontainerJson()
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
}

/**
 * Normalize devcontainer postAttachCommand to a single shell string.
 * The spec allows: string, string[], or { [name]: string | string[] }.
 */
/** Shell-escape a string for embedding in a bash command. */
function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9_./:=@%^+,-]+$/.test(s)) return s
  return `'${s.replace(/'/g, "'\\''")}'`
}

export function normalizePostAttachCommand(
  cmd: unknown,
): string | undefined {
  if (!cmd) return undefined
  if (typeof cmd === 'string') return cmd
  // Array form represents exec-style args — shell-quote each element to preserve spaces
  if (Array.isArray(cmd)) return cmd.map((a: unknown) => shellQuote(String(a))).join(' ')
  if (typeof cmd === 'object') {
    const parts: string[] = []
    for (const value of Object.values(cmd as Record<string, unknown>)) {
      if (typeof value === 'string') parts.push(value)
      else if (Array.isArray(value)) parts.push(value.map((a: unknown) => shellQuote(String(a))).join(' '))
    }
    return parts.length > 0 ? parts.join(' && ') : undefined
  }
  return undefined
}

/** Result from devcontainer up. */
export type DevcontainerUpResult = {
  containerId: string
  remoteUser: string
  remoteWorkspaceFolder: string
  postAttachCommand?: string
}

/**
 * Start a devcontainer for the given workspace folder.
 * Runs `devcontainer up --workspace-folder <dir>` and parses JSON output.
 */
export async function devcontainerUp(
  workspaceFolder: string,
  onProgress: (line: string) => void,
): Promise<{ success: boolean; error?: string; result?: DevcontainerUpResult }> {
  onProgress(`${ANSI.cyan('▸ Starting dev container...')}\r\n`)

  return new Promise((resolve) => {
    const child = spawn('devcontainer', [
      'up',
      '--workspace-folder', workspaceFolder,
      '--skip-post-attach',
      '--include-merged-configuration',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
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
      if (code !== 0) {
        resolve({ success: false, error: `devcontainer up exited with code ${code}` })
        return
      }

      try {
        // devcontainer up outputs JSON on stdout
        const parsed = JSON.parse(stdout.trim()) as {
          outcome: string
          containerId: string
          remoteUser: string
          remoteWorkspaceFolder: string
          mergedConfiguration?: { postAttachCommand?: unknown }
        }
        const postAttachCommand = normalizePostAttachCommand(
          parsed.mergedConfiguration?.postAttachCommand,
        )
        resolve({
          success: true,
          result: {
            containerId: parsed.containerId,
            remoteUser: parsed.remoteUser,
            remoteWorkspaceFolder: parsed.remoteWorkspaceFolder,
            postAttachCommand,
          },
        })
      } catch (parseErr) {
        resolve({ success: false, error: `Failed to parse devcontainer output: ${stdout.substring(0, 200)}` })
      }
    })
  })
}

/**
 * Build docker exec args for a devcontainer.
 * Similar to buildDockerExecArgs but uses the remoteUser from devcontainer up.
 */
export function buildDevcontainerExecArgs(
  containerId: string,
  remoteUser: string,
  cwd: string,
  env: Record<string, string>,
  command?: string,
): string[] {
  const args: string[] = ['exec', '-it', '-u', remoteUser, '-w', cwd]

  for (const [key, value] of Object.entries(env)) {
    args.push('-e', `${key}=${value}`)
  }

  args.push(containerId)

  if (command) {
    args.push('bash', '-l', '-c', command)
  } else {
    args.push('bash', '-l')
  }

  return args
}

/**
 * Returns a friendly terminal error message when devcontainer CLI is unavailable.
 */
export function devcontainerSetupMessage(status: { available: boolean; error?: string }): string {
  return [
    '╭────────────────────────────────────────────────────╮',
    '│  Dev Container CLI required for devcontainer mode   │',
    '│                                                     │',
    `│  ${status.error || 'devcontainer CLI is not available'}`,
    '│                                                     │',
    '│  To install:                                        │',
    '│  npm install -g @devcontainers/cli                  │',
    '│                                                     │',
    '│  Docker Desktop must also be running.               │',
    '│                                                     │',
    '│  Or disable container isolation in repo settings.   │',
    '╰────────────────────────────────────────────────────╯',
    '',
  ].join('\r\n')
}

/**
 * Get container info for the ContainerInfoPanel.
 * Reads from the in-memory docker containers map and checks live status via docker inspect.
 */
export async function getContainerInfo(
  ctx: HandlerContext,
  repoDir: string,
): Promise<ContainerInfo | null> {
  const state = ctx.dockerContainers.get(repoDir)
  if (!state) return null

  let status: ContainerInfo['status'] = 'stopped'
  try {
    const { stdout } = await execFileAsync('docker', [
      'inspect', '--format', '{{.State.Status}}', state.containerId,
    ])
    const dockerStatus = stdout.trim()
    if (dockerStatus === 'running') status = 'running'
    else if (dockerStatus === 'created') status = 'starting'
  } catch {
    // Container gone
    return null
  }

  return {
    containerId: state.containerId.substring(0, 12),
    status,
    image: state.image,
    repoDir: state.repoDir,
  }
}

/**
 * Force-remove a container and clear it from the tracking map.
 */
export async function resetContainer(
  ctx: HandlerContext,
  repoDir: string,
): Promise<void> {
  const state = ctx.dockerContainers.get(repoDir)
  ctx.dockerContainers.delete(repoDir)
  if (state) {
    try {
      await execFileAsync('docker', ['rm', '-f', state.containerId])
    } catch {
      // Already gone — ignore
    }
  }
}

/** Re-export ensureAgentInstalled for devcontainer use */
export { ensureAgentInstalled } from './containerUtils'
