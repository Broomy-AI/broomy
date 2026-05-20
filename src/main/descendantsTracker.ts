/**
 * Periodically snapshots the descendant process tree of each active PTY shell.
 *
 * Why: node-pty's `kill()` only delivers SIGHUP to the shell, and `treeKill`
 * only sees the live tree at the moment of the kill. Long-running daemons that
 * detach via `setpgid()` and then get reparented to init (`next dev`, `expo`,
 * MCP servers, jest workers) become invisible to a snapshot-based search the
 * moment their parent dies. By recording descendants over time we can:
 *
 *  1. Kill historical descendants explicitly when a PTY is torn down or
 *     exits naturally, even if they have already detached.
 *  2. Recover them after a Broomy crash via {@link sweepOrphanedPtys}, which
 *     reads the marker file written by {@link recordPtyMarker}.
 *  3. Report per-session memory/CPU usage by summing live descendants.
 *
 * PID reuse defense: every recorded descendant carries the process's
 * `lstart` timestamp from `ps`. PIDs are recycled by the kernel after the
 * original process exits, so a bare-PID kill list is unsafe over the
 * lifetime of a long-running session. Callers compare the stored start time
 * to a fresh snapshot before signalling — a mismatch means the PID has been
 * reassigned to an unrelated process and must be skipped.
 */
import { execFileSync } from 'child_process'
import type { IPty } from 'node-pty'
import { collectDescendants } from './treeKill'
import { recordPtyMarker } from './ptyMarkers'

/** How often to refresh the descendant snapshot. */
const TRACK_INTERVAL_MS = 5_000

/** A (pid, startTime) pair — startTime gates kills against PID reuse. */
export interface TrackedPid {
  pid: number
  /** Raw `lstart` string from ps, used as an opaque identity token. */
  startTime: string
}

/** Per-PTY snapshot of descendants and the most recent stat sample. */
interface PtyTrackEntry {
  shellPid: number
  /** startTime captured the first time we saw the shell PID in `ps`. */
  shellStartTime: string
  /** Every descendant ever observed, keyed by PID, with its first-seen startTime. */
  historical: Map<number, string>
  /** Last observed live descendants (used for stats; excludes already-exited PIDs). */
  liveDescendants: number[]
  /** Total RSS (KB) summed across live descendants, including the shell. */
  rssKb: number
  /** Total CPU% summed across live descendants, including the shell. Per `ps`, this is lifetime average. */
  cpuPct: number
}

/** Live PTY → tracking entry. Keyed by the ID used in `pty.ts`. */
const tracked = new Map<string, PtyTrackEntry>()

/** ps row with the extra columns we need for stats + identity. */
interface PsStatRow {
  pid: number
  ppid: number
  pgid: number
  rssKb: number
  cpuPct: number
  /** `lstart` string from ps — stable per-process identifier across PID reuse. */
  startTime: string
}

// ps -axo with lstart= emits: "<pid> <ppid> <pgid> <rss> <cpu> <Day Mon DD HH:MM:SS YYYY>"
// lstart's day/date fields contain spaces, so we capture everything after %cpu as the start time.
const PS_STAT_LINE_RE = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/

/** Parse `ps -axo pid=,ppid=,pgid=,rss=,%cpu=,lstart=` output. */
export function parsePsStatSnapshot(stdout: string): readonly PsStatRow[] {
  const rows: PsStatRow[] = []
  for (const line of stdout.split('\n')) {
    const m = PS_STAT_LINE_RE.exec(line.trim())
    if (!m) continue
    rows.push({
      pid: parseInt(m[1], 10),
      ppid: parseInt(m[2], 10),
      pgid: parseInt(m[3], 10),
      rssKb: parseInt(m[4], 10),
      cpuPct: parseFloat(m[5]),
      startTime: m[6].trim(),
    })
  }
  return rows
}

/** Capture a `ps` snapshot with stat + identity columns. Returns empty array on failure. */
function snapshotProcessesWithStats(): readonly PsStatRow[] {
  try {
    const stdout = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid=,rss=,%cpu=,lstart='], { encoding: 'utf-8', timeout: 5000 })
    return parsePsStatSnapshot(stdout)
  } catch {
    return []
  }
}

/** Start tracking a PTY's descendants. Called from `pty:create`. */
export function trackPty(id: string, shellPid: number): void {
  // shellStartTime is filled in on the first tick that sees this pid in ps.
  // Until then, treat it as unknown ('') — verifyPid will skip empty entries
  // so we never accidentally kill based on a placeholder.
  tracked.set(id, {
    shellPid,
    shellStartTime: '',
    historical: new Map<number, string>([[shellPid, '']]),
    liveDescendants: [shellPid],
    rssKb: 0,
    cpuPct: 0,
  })
}

/** Stop tracking a PTY (called when it is killed or exits). */
export function untrackPty(id: string): void {
  tracked.delete(id)
}

/**
 * Historical descendants known for this PTY, including the shell itself.
 * Returns {pid, startTime} pairs so callers can verify identity before killing.
 */
export function getHistoricalDescendants(id: string): readonly TrackedPid[] {
  const entry = tracked.get(id)
  if (!entry) return []
  const out: TrackedPid[] = []
  for (const [pid, startTime] of entry.historical) {
    out.push({ pid, startTime })
  }
  return out
}

export interface PtyStats {
  /** PTY shell PID. */
  shellPid: number
  /** Total RSS in MB across the live tree (rounded). */
  rssMb: number
  /** Total CPU% across the live tree. */
  cpuPct: number
  /** Number of live descendants (including the shell). */
  liveCount: number
}

/** Snapshot of usage stats for every tracked PTY. */
export function getAllStats(): Record<string, PtyStats> {
  const out: Record<string, PtyStats> = {}
  for (const [id, entry] of tracked) {
    out[id] = {
      shellPid: entry.shellPid,
      rssMb: Math.round(entry.rssKb / 1024),
      cpuPct: Math.round(entry.cpuPct * 10) / 10,
      liveCount: entry.liveDescendants.length,
    }
  }
  return out
}

/**
 * Walk every active PTY and refresh its descendant snapshot. Persists the
 * updated tree into the on-disk marker so a future Broomy run can reap orphans
 * left behind by a crash.
 */
function tick(): void {
  if (tracked.size === 0) return
  const snapshot = snapshotProcessesWithStats()
  if (snapshot.length === 0) return

  // Build a simple ppid/pgid view for descendant walking
  const simpleSnapshot = snapshot.map((r) => ({ pid: r.pid, ppid: r.ppid, pgid: r.pgid }))
  const statByPid = new Map<number, PsStatRow>()
  for (const row of snapshot) statByPid.set(row.pid, row)

  for (const [id, entry] of tracked) {
    // Backfill the shell's startTime the first time we observe it in ps.
    if (!entry.shellStartTime) {
      const row = statByPid.get(entry.shellPid)
      if (row) {
        entry.shellStartTime = row.startTime
        entry.historical.set(entry.shellPid, row.startTime)
      }
    }

    const live = collectDescendants(simpleSnapshot, entry.shellPid)
    for (const pid of live) {
      // Only record startTime the first time we see a PID. If we update on
      // every tick we'd silently overwrite a recycled PID's identity with
      // the new process's startTime — defeating the whole point.
      if (!entry.historical.has(pid)) {
        const row = statByPid.get(pid)
        entry.historical.set(pid, row?.startTime ?? '')
      }
    }
    entry.liveDescendants = [...live]

    let rss = 0
    let cpu = 0
    for (const pid of live) {
      const row = statByPid.get(pid)
      if (row) {
        rss += row.rssKb
        cpu += row.cpuPct
      }
    }
    entry.rssKb = rss
    entry.cpuPct = cpu

    // Persist updated descendant list so a future Broomy run can reap orphans
    const descendants: TrackedPid[] = []
    for (const [pid, startTime] of entry.historical) descendants.push({ pid, startTime })
    recordPtyMarker(id, entry.shellPid, entry.shellStartTime, descendants)
  }
}

let timer: ReturnType<typeof setInterval> | null = null

/** Begin the periodic tracking task. Safe to call multiple times. */
export function startTracker(): void {
  if (timer) return
  timer = setInterval(tick, TRACK_INTERVAL_MS)
}

/** Stop the periodic tracking task. Used in tests and at app shutdown. */
export function stopTracker(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** Test helper — clears state so successive tests don't leak. */
export function _resetForTesting(): void {
  stopTracker()
  tracked.clear()
}

/** Test helper — forces a tracking pass without waiting for the interval. */
export function _tickForTesting(): void {
  tick()
}

/** Replaces `pty.kill` path's lookup helper — used by main when killing IPty. */
export function ptyTrackedIds(): IterableIterator<string> {
  return tracked.keys()
}

/** Convenience used in tests — exposes type alias for ergonomic mocking. */
export type { IPty }
