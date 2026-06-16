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
 *
 * PID reuse: descendants tracked over the lifetime of a long-running session
 * can collide with unrelated processes after the original exits. Callers pass
 * `extraPids` as `{pid, startTime}` pairs so we can verify identity against a
 * fresh `ps` snapshot before signalling. PIDs whose startTime has changed are
 * silently skipped — that PID now belongs to someone else.
 */
import { execFile, execFileSync } from 'child_process'
import { isWindows } from './platform'

export type PsSnapshot = readonly { pid: number; ppid: number; pgid: number }[]

/** A (pid, startTime) pair from the descendants tracker. */
export interface ExtraPid {
  pid: number
  /** Empty string means "identity unknown" — treated as unverifiable and skipped. */
  startTime: string
}

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

const PS_ID_LINE_RE = /^(\d+)\s+(.+)$/

/**
 * Snapshot `pid → startTime` so we can verify a tracked extraPid hasn't been
 * reassigned to a different process. `lstart=` produces a stable timestamp the
 * kernel doesn't reuse — comparing it before signalling is the cheapest
 * defence against killing the wrong process after PID rollover.
 */
function snapshotIdentities(): Map<number, string> {
  const out = new Map<number, string>()
  try {
    const stdout = execFileSync('ps', ['-axo', 'pid=,lstart='], { encoding: 'utf-8', timeout: 5000 })
    for (const line of stdout.split('\n')) {
      const m = PS_ID_LINE_RE.exec(line.trim())
      if (!m) continue
      out.set(parseInt(m[1], 10), m[2].trim())
    }
  } catch {
    // Best effort — empty map means "can't verify anything", so callers will
    // skip every extraPid rather than kill blindly. That's the safe default.
  }
  return out
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
 * @param extraPids Historical descendants observed before the shell died.
 *   `collectDescendants` only sees the live tree, so daemons that detached and
 *   reparented to init are invisible once their parent goes away. Pass the
 *   tracker's snapshot so they get SIGKILLed too. Each entry carries an
 *   `lstart` token so we can detect PID reuse and skip recycled PIDs.
 */
export async function treeKill(rootPid: number, graceMs = 1500, extraPids: Iterable<ExtraPid> = []): Promise<void> {
  const validRoot = Number.isInteger(rootPid) && rootPid > 1

  if (isWindows) {
    if (validRoot) {
      await new Promise<void>((resolve) => {
        execFile('taskkill', ['/T', '/F', '/PID', String(rootPid)], { timeout: 5000 }, () => resolve())
      })
    }
    // No reliable lstart equivalent on Windows; taskkill won't crash if the PID
    // is now something unrelated, but it can still kill the wrong process. We
    // accept that risk on Windows — the OOM case the user hit was on macOS, and
    // a Windows-safe identity check would require a separate WMI/PowerShell
    // round trip. Keep it simple here.
    for (const { pid } of extraPids) {
      if (!Number.isInteger(pid) || pid <= 1 || pid === rootPid) continue
      await new Promise<void>((resolve) => {
        execFile('taskkill', ['/F', '/PID', String(pid)], { timeout: 5000 }, () => resolve())
      })
    }
    return
  }

  const targets = new Set<number>()
  if (validRoot) {
    const snapshot = snapshotProcesses()
    for (const pid of collectDescendants(snapshot, rootPid)) targets.add(pid)
  }

  // Verify identity of every extraPid against a fresh ps snapshot. A PID whose
  // startTime has changed has been reassigned by the kernel to an unrelated
  // process — killing it would hit something we don't own (the user's browser,
  // a different terminal, etc.). Skip those rather than risking the wrong kill.
  const extras = [...extraPids]
  if (extras.length > 0) {
    const identities = snapshotIdentities()
    for (const { pid, startTime } of extras) {
      if (!Number.isInteger(pid) || pid <= 1) continue
      const current = identities.get(pid)
      if (!current) {
        // PID is no longer alive — nothing to kill, no risk. Skip silently.
        continue
      }
      // An empty stored startTime means we never recorded one for this PID
      // (added before the first ps tick observed it). Without an identity
      // token we can't tell whether the PID still belongs to us, so we err
      // on the side of safety and skip.
      if (!startTime) continue
      if (current !== startTime) continue
      targets.add(pid)
    }
  }

  if (targets.size === 0) return

  for (const pid of targets) safeSignal(pid, 'SIGTERM')

  await sleep(graceMs)

  for (const pid of targets) {
    if (safeSignal(pid, 0)) safeSignal(pid, 'SIGKILL')
  }
}
