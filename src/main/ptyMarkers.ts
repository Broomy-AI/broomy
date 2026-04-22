/**
 * On-disk PTY ownership markers used to recover from Electron main-process
 * crashes.
 *
 * Each spawned shell drops a file at `~/.broomy/pids/<main-pid>/<pty-id>` whose
 * contents are the shell PID. When Broomy starts up, `sweepOrphanedPtys` looks
 * for marker directories whose owner main-process is no longer alive and
 * tree-kills the recorded shells. This catches the case where Electron exits
 * uncleanly (crash, force-quit) without firing the cleanup handlers.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { treeKill } from './treeKill'

export const MARKERS_ROOT = join(homedir(), '.broomy', 'pids')

function markerDir(mainPid: number = process.pid): string {
  return join(MARKERS_ROOT, String(mainPid))
}

function markerPath(ptyId: string, mainPid: number = process.pid): string {
  return join(markerDir(mainPid), encodeURIComponent(ptyId))
}

/** Record that this main process owns a PTY shell. Best-effort — never throws. */
export function recordPtyMarker(ptyId: string, shellPid: number): void {
  try {
    mkdirSync(markerDir(), { recursive: true })
    writeFileSync(markerPath(ptyId), String(shellPid), 'utf-8')
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
 * shell PID inside, and remove the directory. Safe to call at startup before
 * any new PTYs are created. Returns the number of orphan trees swept.
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
    const pids: number[] = []
    for (const file of markerFiles) {
      try {
        const pid = parseInt(readFileSync(join(dir, file), 'utf-8').trim(), 10)
        if (Number.isInteger(pid) && pid > 1) pids.push(pid)
      } catch {
        // Marker unreadable — skip
      }
    }
    await Promise.all(pids.map((pid) => treeKill(pid)))
    swept += pids.length
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  return swept
}
