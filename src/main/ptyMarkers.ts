/**
 * On-disk PTY ownership markers used to recover from Electron main-process
 * crashes.
 *
 * Each spawned shell drops a file at `~/.broomy/pids/<main-pid>/<pty-id>` whose
 * contents are a JSON blob:
 *
 *   {
 *     "shellPid": N,
 *     "shellStartTime": "<lstart>",
 *     "descendants": [{ "pid": N, "startTime": "<lstart>" }, ...]
 *   }
 *
 * The descendant array is refreshed by the periodic tracker so we can still
 * find detached processes (next dev, MCP servers, jest workers, …) even after
 * the shell that originally spawned them is gone. Each entry carries an
 * `lstart` token so a future Broomy run can detect PID reuse and skip
 * recycled PIDs that no longer belong to us.
 *
 * When Broomy starts up, `sweepOrphanedPtys` looks for marker directories whose
 * owner main-process is no longer alive and tree-kills the recorded PIDs. This
 * catches the case where Electron exits uncleanly (crash, force-quit) without
 * firing the cleanup handlers.
 *
 * Two legacy formats are still accepted on read for backward compatibility:
 *   1. Plain-PID files (oldest) — pre-tracker markers, just a shell PID.
 *   2. JSON with bare-number descendants — pre-startTime markers.
 * Both surface descendants with `startTime: ''`, which treeKill treats as
 * unverifiable and skips. That's the safe behaviour: we'd rather miss a real
 * orphan than kill an unrelated PID-reuse victim.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { treeKill, type ExtraPid } from './treeKill'

export const MARKERS_ROOT = join(homedir(), '.broomy', 'pids')

export interface MarkerData {
  shellPid: number
  shellStartTime: string
  descendants: ExtraPid[]
}

function markerDir(mainPid: number = process.pid): string {
  return join(MARKERS_ROOT, String(mainPid))
}

function markerPath(ptyId: string, mainPid: number = process.pid): string {
  return join(markerDir(mainPid), encodeURIComponent(ptyId))
}

/**
 * Record (or update) a marker for the given PTY. Best-effort — never throws.
 * Pass `descendants` to persist the latest known descendant list (with start
 * times); omit it on the initial call when only the shell PID is known.
 */
export function recordPtyMarker(
  ptyId: string,
  shellPid: number,
  shellStartTime = '',
  descendants: readonly ExtraPid[] = [],
): void {
  try {
    mkdirSync(markerDir(), { recursive: true })
    const data: MarkerData = {
      shellPid,
      shellStartTime,
      descendants: descendants.map((d) => ({ pid: d.pid, startTime: d.startTime })),
    }
    writeFileSync(markerPath(ptyId), JSON.stringify(data), 'utf-8')
  } catch {
    // Marker is a recovery hint, not a correctness requirement
  }
}

/** Remove a marker once a PTY has been killed cleanly. */
export function removePtyMarker(ptyId: string): void {
  try {
    rmSync(markerPath(ptyId), { force: true })
  } catch {
    // Already gone
  }
}

/** Remove this main process's entire marker directory (called at clean exit). */
export function clearOwnMarkers(): void {
  try {
    rmSync(markerDir(), { recursive: true, force: true })
  } catch {
    // ignore
  }
}

/**
 * Coerce a single descendants[] entry from parsed JSON into a verified
 * {pid, startTime} pair, or null if the entry is malformed.
 *
 * Accepts two shapes for backward compatibility:
 *   - bare number (mid-format JSON markers that predate startTime tracking)
 *   - {pid, startTime} object (current format)
 *
 * Bare numbers get startTime='', which treeKill treats as unverifiable and
 * skips — the safe degradation when we can't tell whether a PID has been
 * reused.
 */
function parseDescendantEntry(entry: unknown): ExtraPid | null {
  if (typeof entry === 'number') return { pid: entry, startTime: '' }
  if (!entry || typeof entry !== 'object') return null
  const obj = entry as { pid?: unknown; startTime?: unknown }
  if (typeof obj.pid !== 'number') return null
  return { pid: obj.pid, startTime: typeof obj.startTime === 'string' ? obj.startTime : '' }
}

/** Parse marker file contents. Accepts new JSON format, JSON without start times, and legacy plain PID. */
export function parseMarker(contents: string): MarkerData | null {
  const trimmed = contents.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        shellPid?: unknown
        shellStartTime?: unknown
        descendants?: unknown
      }
      if (typeof parsed.shellPid !== 'number') return null
      const shellStartTime = typeof parsed.shellStartTime === 'string' ? parsed.shellStartTime : ''
      const descendants: ExtraPid[] = []
      if (Array.isArray(parsed.descendants)) {
        for (const entry of parsed.descendants) {
          const parsedEntry = parseDescendantEntry(entry)
          if (parsedEntry) descendants.push(parsedEntry)
        }
      }
      return { shellPid: parsed.shellPid, shellStartTime, descendants }
    } catch {
      return null
    }
  }
  const pid = parseInt(trimmed, 10)
  if (!Number.isInteger(pid) || pid <= 1) return null
  return { shellPid: pid, shellStartTime: '', descendants: [] }
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Find marker directories whose owning main-process is dead, tree-kill every
 * recorded PID inside, and remove the directory. Safe to call at startup
 * before any new PTYs are created. Returns the number of orphan trees swept.
 */
export async function sweepOrphanedPtys(): Promise<number> {
  let entries: string[]
  try {
    entries = readdirSync(MARKERS_ROOT)
  } catch {
    return 0
  }
  let swept = 0
  for (const entry of entries) {
    const ownerPid = Number(entry)
    if (!Number.isInteger(ownerPid)) continue
    if (ownerPid === process.pid) continue
    if (isPidAlive(ownerPid)) continue

    const dir = join(MARKERS_ROOT, entry)
    let markerFiles: string[] = []
    try { markerFiles = readdirSync(dir) } catch { /* ignore */ }
    const killOps: Promise<void>[] = []
    for (const file of markerFiles) {
      let data: MarkerData | null = null
      try {
        data = parseMarker(readFileSync(join(dir, file), 'utf-8'))
      } catch {
        // Marker unreadable — skip
      }
      if (!data) continue
      // The tracker always puts the shell PID into the historical descendant
      // list before persisting, so data.descendants already covers the shell.
      // treeKill verifies each startTime before signalling, so PIDs that have
      // rolled over to unrelated processes get skipped.
      //
      // We pass NaN as the root so treeKill skips its live-tree walk: by the
      // time we sweep the shell is dead, and walking what would now be a
      // recycled PID's "descendants" is exactly the dangerous behaviour we're
      // defending against.
      killOps.push(treeKill(NaN, undefined, data.descendants))
      swept += 1
    }
    await Promise.all(killOps)
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  return swept
}
