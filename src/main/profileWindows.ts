/** Keep window lookup aligned with the profile currently displayed in each window. */
import type { BrowserWindow } from 'electron'

type WindowMap = Map<string, BrowserWindow>
const owners = new WeakMap<WindowMap, Map<BrowserWindow, string>>()

function ownership(windows: WindowMap): Map<BrowserWindow, string> {
  let tracked = owners.get(windows)
  if (!tracked) {
    tracked = new Map([...windows].map(([id, window]) => [window, id]))
    owners.set(windows, tracked)
  }
  return tracked
}

export function removeProfileWindow(windows: WindowMap, window: BrowserWindow): void {
  const tracked = ownership(windows)
  tracked.delete(window)
  for (const [id, candidate] of windows) {
    if (candidate !== window) continue
    windows.delete(id)
    // Tabs can display a profile already open in another window. Retain a
    // representative for that profile when the most recently registered one closes.
    for (const [other, profileId] of tracked) {
      if (profileId === id && !other.isDestroyed()) {
        windows.set(id, other)
        break
      }
    }
  }
}

export function setWindowProfile(windows: WindowMap, window: BrowserWindow, profileId: string): void {
  removeProfileWindow(windows, window)
  ownership(windows).set(window, profileId)
  windows.set(profileId, window)
}
