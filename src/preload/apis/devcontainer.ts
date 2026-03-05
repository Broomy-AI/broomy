/**
 * Preload API for devcontainer CLI status, config management, and container lifecycle.
 */
import { ipcRenderer } from 'electron'
import type { DevcontainerStatus, ContainerInfo } from './types'

export type DevcontainerApi = {
  status: () => Promise<DevcontainerStatus>
  hasConfig: (workspaceFolder: string) => Promise<boolean>
  generateDefaultConfig: (workspaceFolder: string) => Promise<void>
  containerInfo: (repoDir: string) => Promise<ContainerInfo | null>
  resetContainer: (repoDir: string) => Promise<void>
}

export const devcontainerApi: DevcontainerApi = {
  status: () => ipcRenderer.invoke('devcontainer:status'),
  hasConfig: (workspaceFolder) => ipcRenderer.invoke('devcontainer:hasConfig', workspaceFolder),
  generateDefaultConfig: (workspaceFolder) => ipcRenderer.invoke('devcontainer:generateDefaultConfig', workspaceFolder),
  containerInfo: (repoDir) => ipcRenderer.invoke('devcontainer:containerInfo', repoDir),
  resetContainer: (repoDir) => ipcRenderer.invoke('devcontainer:resetContainer', repoDir),
}
