import { ipcRenderer } from 'electron'
import type { FileEntry, SearchResult } from './types'

export type FsApi = {
  readDir: (path: string) => Promise<FileEntry[]>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
  appendFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
  readFileBase64: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
  mkdir: (path: string) => Promise<{ success: boolean; error?: string }>
  rm: (path: string) => Promise<{ success: boolean; error?: string }>
  createFile: (path: string) => Promise<{ success: boolean; error?: string }>
  search: (directory: string, query: string) => Promise<SearchResult[]>
  watch: (id: string, path: string) => Promise<{ success: boolean; error?: string }>
  unwatch: (id: string) => Promise<{ success: boolean }>
  onChange: (id: string, callback: (event: { eventType: string; filename: string | null }) => void) => () => void
}

export const fsApi: FsApi = {
  readDir: (path) => ipcRenderer.invoke('fs:readDir', path),
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
  writeFile: (path, content) => ipcRenderer.invoke('fs:writeFile', path, content),
  appendFile: (path, content) => ipcRenderer.invoke('fs:appendFile', path, content),
  readFileBase64: (path) => ipcRenderer.invoke('fs:readFileBase64', path),
  exists: (path) => ipcRenderer.invoke('fs:exists', path),
  mkdir: (path) => ipcRenderer.invoke('fs:mkdir', path),
  rm: (path) => ipcRenderer.invoke('fs:rm', path),
  createFile: (path) => ipcRenderer.invoke('fs:createFile', path),
  search: (directory, query) => ipcRenderer.invoke('fs:search', directory, query),
  watch: (id, path) => ipcRenderer.invoke('fs:watch', id, path),
  unwatch: (id) => ipcRenderer.invoke('fs:unwatch', id),
  onChange: (id, callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { eventType: string; filename: string | null }) => callback(data)
    ipcRenderer.on(`fs:change:${id}`, handler)
    return () => ipcRenderer.removeListener(`fs:change:${id}`, handler)
  },
}
