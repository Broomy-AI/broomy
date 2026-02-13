import { ipcRenderer } from 'electron'

export type ShellApi = {
  exec: (command: string, cwd: string) => Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>
  openExternal: (url: string) => Promise<void>
}

export type DialogApi = {
  openFolder: () => Promise<string | null>
}

export type AppApi = {
  isDev: () => Promise<boolean>
  homedir: () => Promise<string>
  platform: () => Promise<string>
  tmpdir: () => Promise<string>
}

export const shellApi: ShellApi = {
  exec: (command, cwd) => ipcRenderer.invoke('shell:exec', command, cwd),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
}

export const dialogApi: DialogApi = {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
}

export const appApi: AppApi = {
  isDev: () => ipcRenderer.invoke('app:isDev'),
  homedir: () => ipcRenderer.invoke('app:homedir'),
  platform: () => ipcRenderer.invoke('app:platform'),
  tmpdir: () => ipcRenderer.invoke('app:tmpdir'),
}
