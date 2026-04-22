/**
 * Tree-kill helper for PTY shells.
 *
 * node-pty's `IPty.kill()` only sends SIGHUP to the shell. Daemons that detach
 * from the controlling terminal (firebase emulators, expo dev server, jest
 * workers, anything using `setsid` or `detached: true`) ignore that signal and
 * survive as orphans adopted by init. Over time these accumulate and exhaust
 * memory.
 *
 * `treeKill` collects every descendant of the shell PID (by walking parent-pid
 * chains AND by union-ing in the shell's process group), sends SIGTERM, then
 * SIGKILLs any stragglers after a grace period.
 */
import { execFile, execFileSync } from 'child_process'
import { isWindows } from './platform'

export type PsSnapshot = readonly { pid: number; ppid: number; pgid: number }[]

const PS_LINE_RE = /^(\d+)\s+(\d+)\s+(\d+)$/

/** Parse `ps -axo pid=,ppid=,pgid=` output into a structured snapshot. */
export function parsePsSnapshot(stdout: string): PsSnapshot {
  const rows: { pid: number; ppid: number; pgid: number }[] = []
  for (const line of stdout.split('\n')) {
    const m = PS_LINE_RE.exec(line.trim())
    if (!m) continue
    rows.push({ pid: parseInt(m[1], 10), ppid: parseInt(m[2], 10), pgid: parseInt(m[3], 10) })
  }
  return rows
}

/**
 * Given a process snapshot and a root PID, return the set of PIDs to kill:
 * the root itself, every descendant by parent-pid chain, and every process
 * sharing the root's process group. The PGID union catches daemons that have
 * been reparented to init but still belong to the original shell's group.
 */
export function collectDescendants(snapshot: PsSnapshot, rootPid: number): Set<number> {
  const childrenOf = new Map<number, number[]>()
  for (const row of snapshot) {
    const arr = childrenOf.get(row.ppid) || []
    arr.push(row.pid)
    childrenOf.set(row.ppid, arr)
  }
  const result = new Set<number>([rootPid])
  const stack = [rootPid]
  while (stack.length) {
    const p = stack.pop()!
    for (const child of childrenOf.get(p) || []) {
      if (!result.has(child)) {
        result.add(child)
        stack.push(child)
      }
    }
  }
  for (const row of snapshot) {
    if (row.pgid === rootPid) result.add(row.pid)
  }
  return result
}

/** Capture a process snapshot via `ps`. Returns empty array on failure. */
function snapshotProcesses(): PsSnapshot {
  try {
    const stdout = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid='], { encoding: 'utf-8', timeout: 5000 })
    return parsePsSnapshot(stdout)
  } catch {
    return []
  }
}

function safeSignal(pid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(pid, signal)
    return true
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Kill a PTY shell and every descendant. Resolves once stragglers have been
 * SIGKILLed (Unix) or after taskkill returns (Windows). Always resolves —
 * never throws — so callers can treat cleanup as best-effort.
 *
 * @param rootPid PID of the shell spawned by node-pty
 * @param graceMs Time to wait between SIGTERM and SIGKILL (default 1500ms)
 */
export async function treeKill(rootPid: number, graceMs = 1500): Promise<void> {
  if (!Number.isInteger(rootPid) || rootPid <= 1) return

  if (isWindows) {
    await new Promise<void>((resolve) => {
      execFile('taskkill', ['/T', '/F', '/PID', String(rootPid)], { timeout: 5000 }, () => resolve())
    })
    return
  }

  const snapshot = snapshotProcesses()
  const targets = collectDescendants(snapshot, rootPid)
  for (const pid of targets) safeSignal(pid, 'SIGTERM')

  await sleep(graceMs)

  for (const pid of targets) {
    if (safeSignal(pid, 0)) safeSignal(pid, 'SIGKILL')
  }
}
