/**
 * Polls `window.pty.getStats()` on a slow timer and exposes the per-session
 * usage stats as a Zustand-friendly hook. Single shared poller so opening the
 * sidebar in many windows doesn't fan out into many ps invocations.
 */
import { useSyncExternalStore } from 'react'
import type { SessionUsageStats } from '../../../preload/index'

type StatsMap = Record<string, SessionUsageStats>

let stats: StatsMap = {}
const listeners = new Set<() => void>()
let pollTimer: ReturnType<typeof setInterval> | null = null
let activeSubscribers = 0
const POLL_INTERVAL_MS = 5000

async function refresh(): Promise<void> {
  try {
    const next = await window.pty.getStats()
    // Reference-equality check on the whole map avoids re-renders when nothing
    // changed; we compare by stringifying because the map is small.
    if (JSON.stringify(next) !== JSON.stringify(stats)) {
      stats = next
      listeners.forEach((l) => l())
    }
  } catch {
    // ignore — stats are best-effort
  }
}

function startPolling(): void {
  if (pollTimer) return
  void refresh()
  pollTimer = setInterval(() => { void refresh() }, POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  activeSubscribers += 1
  if (activeSubscribers === 1) startPolling()
  return () => {
    listeners.delete(listener)
    activeSubscribers -= 1
    if (activeSubscribers === 0) stopPolling()
  }
}

function getSnapshot(): StatsMap {
  return stats
}

/** Returns the latest usage stats for one session, or undefined if none. */
export function useSessionUsageStats(sessionId: string): SessionUsageStats | undefined {
  const map = useSyncExternalStore(subscribe, getSnapshot)
  return map[sessionId]
}

/** Test helper — clears state between tests. */
export function _resetForTesting(): void {
  stats = {}
  listeners.clear()
  activeSubscribers = 0
  stopPolling()
}
