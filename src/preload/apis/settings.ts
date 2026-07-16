/**
 * Global appearance settings.
 *
 * Every key is a FUNCTION, including `getInitial`. The test harness types its mocks
 * as `Mocked<T>` (a map of every key to a `vi.fn()`), which does not typecheck
 * against a plain-value key — so a `readonly initial: Snapshot` property here would
 * break every test file that touches the window mock.
 */
import { ipcRenderer } from 'electron'
import type { Appearance, AppearanceSnapshot } from '../../shared/appearance'

// Fetched synchronously at preload time, so the renderer can set the theme before
// its first paint rather than flashing dark and correcting itself.
const initial = ipcRenderer.sendSync('settings:getSync') as AppearanceSnapshot

export interface SettingsApi {
  getInitial: () => AppearanceSnapshot
  load: () => Promise<AppearanceSnapshot>
  save: (appearance: Appearance) => Promise<{ success: boolean; error?: string }>
  onChanged: (callback: (snapshot: AppearanceSnapshot) => void) => () => void
}

export const settingsApi: SettingsApi = {
  getInitial: () => initial,
  load: () => ipcRenderer.invoke('settings:load'),
  save: (appearance) => ipcRenderer.invoke('settings:save', appearance),
  onChanged: (callback) => {
    const listener = (_event: unknown, snapshot: AppearanceSnapshot) => callback(snapshot)
    ipcRenderer.on('settings:changed', listener)
    return () => {
      ipcRenderer.removeListener('settings:changed', listener)
    }
  },
}
