/**
 * Preload API for the Claude Agent SDK integration.
 */
import { ipcRenderer } from 'electron'
import type { AgentSdkMessage, AgentSdkPermissionRequest } from '../../shared/agentSdkTypes'
import type { SdkModelInfo, PermissionMode } from './types'

export type AgentSdkApi = {
  start: (options: { id: string; prompt: string; cwd: string; sdkSessionId?: string; permissionMode?: PermissionMode; env?: Record<string, string>; model?: string; effort?: 'low' | 'medium' | 'high' | 'max' }) => Promise<{ id: string }>
  send: (id: string, prompt: string, options?: { sdkSessionId?: string; cwd?: string; permissionMode?: PermissionMode; env?: Record<string, string>; model?: string; effort?: 'low' | 'medium' | 'high' | 'max' }) => Promise<void>
  inject: (id: string, prompt: string) => Promise<void>
  stop: (id: string) => Promise<void>
  respondToPermission: (id: string, toolUseId: string, allowed: boolean, updatedInput?: Record<string, unknown>) => Promise<void>
  onMessage: (id: string, cb: (msg: AgentSdkMessage) => void) => () => void
  onDone: (id: string, cb: (sdkSessionId: string) => void) => () => void
  onError: (id: string, cb: (error: string) => void) => () => void
  onPermissionRequest: (id: string, cb: (req: AgentSdkPermissionRequest) => void) => () => void
  onHistoryMeta: (id: string, cb: (meta: { total: number; loaded: number }) => void) => () => void
  loadHistory: (sdkSessionId: string, sessionId: string, agentEnv?: Record<string, string>, limit?: number) => Promise<void>
  login: (sessionId: string) => Promise<void>
  status: (sessionId: string, agentEnv?: Record<string, string>) => Promise<void>
  commands: (cwd?: string, agentEnv?: Record<string, string>) => Promise<{ name: string; description: string }[]>
  models: (agentEnv?: Record<string, string>) => Promise<SdkModelInfo[]>
}

export const agentSdkApi: AgentSdkApi = {
  start: (options) => ipcRenderer.invoke('agentSdk:start', options),
  send: (id, prompt, options) => ipcRenderer.invoke('agentSdk:send', id, prompt, options),
  inject: (id, prompt) => ipcRenderer.invoke('agentSdk:inject', id, prompt),
  stop: (id) => ipcRenderer.invoke('agentSdk:stop', id),
  respondToPermission: (id, toolUseId, allowed, updatedInput) => ipcRenderer.invoke('agentSdk:respond', id, toolUseId, allowed, updatedInput),
  onMessage: (id, cb) => {
    const handler = (_event: Electron.IpcRendererEvent, msg: AgentSdkMessage) => cb(msg)
    ipcRenderer.on(`agentSdk:message:${id}`, handler)
    return () => ipcRenderer.removeListener(`agentSdk:message:${id}`, handler)
  },
  onDone: (id, cb) => {
    const handler = (_event: Electron.IpcRendererEvent, sdkSessionId: string) => cb(sdkSessionId)
    ipcRenderer.on(`agentSdk:done:${id}`, handler)
    return () => ipcRenderer.removeListener(`agentSdk:done:${id}`, handler)
  },
  onError: (id, cb) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string) => cb(error)
    ipcRenderer.on(`agentSdk:error:${id}`, handler)
    return () => ipcRenderer.removeListener(`agentSdk:error:${id}`, handler)
  },
  onPermissionRequest: (id, cb) => {
    const handler = (_event: Electron.IpcRendererEvent, req: AgentSdkPermissionRequest) => cb(req)
    ipcRenderer.on(`agentSdk:permission:${id}`, handler)
    return () => ipcRenderer.removeListener(`agentSdk:permission:${id}`, handler)
  },
  loadHistory: (sdkSessionId, sessionId, agentEnv, limit) => ipcRenderer.invoke('agentSdk:loadHistory', sdkSessionId, sessionId, agentEnv, limit),
  onHistoryMeta: (id, cb) => {
    const handler = (_event: Electron.IpcRendererEvent, meta: { total: number; loaded: number }) => cb(meta)
    ipcRenderer.on(`agentSdk:historyMeta:${id}`, handler)
    return () => ipcRenderer.removeListener(`agentSdk:historyMeta:${id}`, handler)
  },
  login: (sessionId) => ipcRenderer.invoke('agentSdk:login', sessionId),
  status: (sessionId, agentEnv) => ipcRenderer.invoke('agentSdk:status', sessionId, agentEnv),
  commands: (cwd, agentEnv) => ipcRenderer.invoke('agentSdk:commands', cwd, agentEnv),
  models: (agentEnv) => ipcRenderer.invoke('agentSdk:models', agentEnv),
}
