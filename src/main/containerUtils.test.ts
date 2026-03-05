/**
 * Unit tests for containerUtils.ts — shared container utilities.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// Mock child_process before importing the module under test.
// promisify wraps execFile in a Promise; we replicate that contract here.
const mockExecFile = vi.fn()
const mockSpawn = vi.fn()
vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

// Replicate promisify behaviour so that execFileAsync resolves/rejects based
// on the callback the mock invokes.
vi.mock('util', () => ({
  promisify: (fn: Function) => (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      fn(...args, (err: Error | null, result: unknown) => {
        if (err) reject(err)
        else resolve(result)
      })
    }),
}))

vi.mock('os', () => ({ platform: () => 'darwin' }))

import {
  AGENT_INSTALL_COMMANDS,
  AGENT_KNOWN_PATHS,
  isSetupLockHeld,
  acquireSetupLock,
  isDockerAvailable,
  dockerSetupMessage,
  ensureAgentInstalled,
} from './containerUtils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal EventEmitter-based child-process mock. */
function makeChildMock() {
  const emitter = new EventEmitter()
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  return Object.assign(emitter, { stdout, stderr })
}

// ---------------------------------------------------------------------------
// AGENT_INSTALL_COMMANDS
// ---------------------------------------------------------------------------

describe('AGENT_INSTALL_COMMANDS', () => {
  it('exports install commands for known agents', () => {
    expect(AGENT_INSTALL_COMMANDS.claude).toContain('install.sh')
    expect(AGENT_INSTALL_COMMANDS.codex).toContain('@openai/codex')
    expect(AGENT_INSTALL_COMMANDS.gemini).toContain('@google/gemini-cli')
  })
})

// ---------------------------------------------------------------------------
// AGENT_KNOWN_PATHS
// ---------------------------------------------------------------------------

describe('AGENT_KNOWN_PATHS', () => {
  it('exports known install path for claude', () => {
    expect(AGENT_KNOWN_PATHS.claude).toBe('/home/node/.local/bin/claude')
  })
})

// ---------------------------------------------------------------------------
// isSetupLockHeld
// ---------------------------------------------------------------------------

describe('isSetupLockHeld', () => {
  it('returns false when no lock has been acquired', () => {
    expect(isSetupLockHeld('/repo/fresh')).toBe(false)
  })

  it('returns true while a lock is held', async () => {
    const release = await acquireSetupLock('/repo/held')
    expect(isSetupLockHeld('/repo/held')).toBe(true)
    release()
  })

  it('returns false after the lock is released', async () => {
    const release = await acquireSetupLock('/repo/released')
    release()
    expect(isSetupLockHeld('/repo/released')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// acquireSetupLock — serialisation
// ---------------------------------------------------------------------------

describe('acquireSetupLock', () => {
  it('serializes concurrent callers — second waits for first to finish', async () => {
    const order: string[] = []
    const repo = '/repo/serialize'

    const r1 = await acquireSetupLock(repo)
    order.push('first-acquired')

    // Queue a second waiter before releasing the first.
    const p2 = acquireSetupLock(repo).then((r2) => {
      order.push('second-acquired')
      r2()
    })

    // Verify the second caller has NOT yet acquired the lock.
    // Give microtasks a tick to drain.
    await Promise.resolve()
    expect(order).toEqual(['first-acquired'])

    r1()
    await p2

    expect(order).toEqual(['first-acquired', 'second-acquired'])
  })
})

// ---------------------------------------------------------------------------
// isDockerAvailable
// ---------------------------------------------------------------------------

describe('isDockerAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns available: true when docker responds', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], callback: (err: null, result: object) => void) => {
        callback(null, { stdout: '24.0.0\n' })
      },
    )

    const result = await isDockerAvailable()
    expect(result).toEqual({ available: true })
  })

  it('returns { available: false, error: "Docker is not installed" } on ENOENT', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('spawn docker ENOENT'))
      },
    )

    const result = await isDockerAvailable()
    expect(result.available).toBe(false)
    expect(result.error).toBe('Docker is not installed')
    // On darwin the install URL should point at Docker Desktop
    expect(result.installUrl).toContain('docker-desktop')
  })

  it('returns { available: false, error: "Docker is not installed" } on "not found"', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('docker: not found'))
      },
    )

    const result = await isDockerAvailable()
    expect(result.available).toBe(false)
    expect(result.error).toBe('Docker is not installed')
  })

  it('returns { available: false, error: "Docker daemon is not running" } on other errors', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('Cannot connect to the Docker daemon'))
      },
    )

    const result = await isDockerAvailable()
    expect(result.available).toBe(false)
    expect(result.error).toBe('Docker daemon is not running')
    expect(result.installUrl).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// dockerSetupMessage
// ---------------------------------------------------------------------------

describe('dockerSetupMessage', () => {
  it('returns a string containing the status error', () => {
    const msg = dockerSetupMessage({ available: false, error: 'Docker daemon is not running' })
    expect(typeof msg).toBe('string')
    expect(msg).toContain('Docker daemon is not running')
  })

  it('contains install instructions', () => {
    const msg = dockerSetupMessage({ available: false, error: 'Docker is not installed' })
    expect(msg).toContain('docker.com/products/docker-desktop')
    expect(msg).toContain('get.docker.com')
  })

  it('falls back gracefully when error is undefined', () => {
    const msg = dockerSetupMessage({ available: false })
    expect(msg).toContain('Docker is not available')
  })
})

// ---------------------------------------------------------------------------
// ensureAgentInstalled
// ---------------------------------------------------------------------------

describe('ensureAgentInstalled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns success when agent is already installed via known path', async () => {
    // 'claude' uses a known path — docker exec test -x <path> succeeds
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], callback: (err: null, result: object) => void) => {
        callback(null, { stdout: '' })
      },
    )

    const progress: string[] = []
    const result = await ensureAgentInstalled('cid123', 'claude', (l) => progress.push(l))
    expect(result).toEqual({ success: true })
    // Spawn should NOT have been called (already installed)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('returns success when agent is already installed via which', async () => {
    // 'codex' has no known path — docker exec which codex succeeds
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], callback: (err: null, result: object) => void) => {
        callback(null, { stdout: '/usr/local/bin/codex\n' })
      },
    )

    const result = await ensureAgentInstalled('cid123', 'codex', () => {})
    expect(result).toEqual({ success: true })
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('rejects invalid agent command names containing shell metacharacters', async () => {
    const result = await ensureAgentInstalled('cid123', 'bad;cmd', () => {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid agent command name')
  })

  it('installs agent and returns success when exit code is 0', async () => {
    // execFile (which check) throws — agent not installed
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('not found'))
      },
    )

    const child = makeChildMock()
    mockSpawn.mockReturnValue(child)

    const progress: string[] = []
    const promise = ensureAgentInstalled('cid123', 'codex', (l) => progress.push(l))

    // Drain the microtask queue so the async function has reached the spawn()
    // call and registered its listeners before we emit events.
    await Promise.resolve()
    await Promise.resolve()

    // Emit some stdout / stderr lines then close successfully
    child.stdout.emit('data', Buffer.from('Fetching package...\n'))
    child.stderr.emit('data', Buffer.from('warning: something\n'))
    child.emit('close', 0)

    const result = await promise
    expect(result).toEqual({ success: true })
    expect(progress.some((l) => l.includes('Installing codex'))).toBe(true)
    expect(progress.some((l) => l.includes('Fetching package'))).toBe(true)
  })

  it('returns error when install exits with non-zero code', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('not found'))
      },
    )

    const child = makeChildMock()
    mockSpawn.mockReturnValue(child)

    const promise = ensureAgentInstalled('cid123', 'gemini', () => {})

    // Drain microtasks so spawn listeners are registered before emitting.
    await Promise.resolve()
    await Promise.resolve()

    child.emit('close', 1)

    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toContain('gemini install exited with code 1')
  })

  it('returns error when spawn emits an error event', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('not found'))
      },
    )

    const child = makeChildMock()
    // Pre-register a no-op error listener so EventEmitter does not throw
    // when we emit 'error' before ensureAgentInstalled registers its own listener.
    child.on('error', () => {})
    mockSpawn.mockReturnValue(child)

    const promise = ensureAgentInstalled('cid123', 'gemini', () => {})

    // Drain microtasks so spawn listeners are registered before emitting.
    await Promise.resolve()
    await Promise.resolve()

    child.emit('error', new Error('spawn failed'))

    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('spawn failed')
  })

  it('returns success for unknown agents (skips install)', async () => {
    // execFile fails — agent not found by which
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('not found'))
      },
    )

    // 'myagent' has no entry in AGENT_INSTALL_COMMANDS
    const result = await ensureAgentInstalled('cid123', 'myagent', () => {})
    expect(result).toEqual({ success: true })
    // No spawn should have been attempted
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})
