import { ipcRenderer } from 'electron'
import type { ConfigData, ProfilesData } from './types'

export type ConfigApi = {
  load: (profileId?: string) => Promise<ConfigData>
  save: (config: ConfigData) => Promise<{ success: boolean; error?: string }>
}

export type ProfilesApi = {
  list: () => Promise<ProfilesData>
  save: (data: ProfilesData) => Promise<{ success: boolean; error?: string }>
  openWindow: (profileId: string) => Promise<{ success: boolean; alreadyOpen: boolean }>
  getOpenProfiles: () => Promise<string[]>
}

export type AgentsApi = {
  isInstalled: (command: string) => Promise<boolean>
}

export type ReposApi = {
  getInitScript: (repoId: string, profileId?: string) => Promise<string | null>
  saveInitScript: (repoId: string, script: string, profileId?: string) => Promise<{ success: boolean; error?: string }>
}

export const configApi: ConfigApi = {
  load: (profileId?) => ipcRenderer.invoke('config:load', profileId),
  save: (config) => ipcRenderer.invoke('config:save', config),
}

export const profilesApi: ProfilesApi = {
  list: () => ipcRenderer.invoke('profiles:list'),
  save: (data) => ipcRenderer.invoke('profiles:save', data),
  openWindow: (profileId) => ipcRenderer.invoke('profiles:openWindow', profileId),
  getOpenProfiles: () => ipcRenderer.invoke('profiles:getOpenProfiles'),
}

export const agentsApi: AgentsApi = {
  isInstalled: (command) => ipcRenderer.invoke('agent:isInstalled', command),
}

export const reposApi: ReposApi = {
  getInitScript: (repoId, profileId?) => ipcRenderer.invoke('repos:getInitScript', repoId, profileId),
  saveInitScript: (repoId, script, profileId?) => ipcRenderer.invoke('repos:saveInitScript', repoId, script, profileId),
}
