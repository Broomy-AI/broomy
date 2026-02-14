import type { BrowserWindow } from 'electron'
import type { IPty } from 'node-pty'
import type { FSWatcher } from 'fs'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { normalizePath } from '../platform'

export interface HandlerContext {
  isE2ETest: boolean
  isScreenshotMode: boolean
  isDev: boolean
  isWindows: boolean
  ptyProcesses: Map<string, IPty>
  ptyOwnerWindows: Map<string, BrowserWindow>
  fileWatchers: Map<string, FSWatcher>
  watcherOwnerWindows: Map<string, BrowserWindow>
  profileWindows: Map<string, BrowserWindow>
  mainWindow: BrowserWindow | null
  E2E_MOCK_SHELL: string | undefined
  FAKE_CLAUDE_SCRIPT: string | undefined
}

// Config directory and file constants
export const CONFIG_DIR = join(homedir(), '.broomy')
export const PROFILES_DIR = join(CONFIG_DIR, 'profiles')
export const PROFILES_FILE = join(CONFIG_DIR, 'profiles.json')

export function getConfigFileName(isDev: boolean): string {
  return isDev ? 'config.dev.json' : 'config.json'
}

export function getProfileConfigFile(profileId: string, isDev: boolean): string {
  return join(PROFILES_DIR, profileId, getConfigFileName(isDev))
}

export function getProfileInitScriptsDir(profileId: string): string {
  return join(PROFILES_DIR, profileId, 'init-scripts')
}

// Default agents
export const DEFAULT_AGENTS = [
  { id: 'claude', name: 'Claude Code', command: 'claude', color: '#D97757' },
  { id: 'codex', name: 'Codex', command: 'codex', color: '#10A37F' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', color: '#4285F4' },
]

// Default profiles
export const DEFAULT_PROFILES = {
  profiles: [{ id: 'default', name: 'Default', color: '#3b82f6' }],
  lastProfileId: 'default',
}

// Expand ~ to home directory
export const expandHomePath = (path: string): string => {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2))
  }
  if (path === '~') {
    return homedir()
  }
  return path
}

// E2E mock data
export function getE2EDemoSessions(isScreenshotMode: boolean) {
  return isScreenshotMode ? [
    { id: '1', name: 'backend-api', directory: normalizePath(join(tmpdir(), 'broomy-e2e-backend-api')), agentId: 'claude' },
    { id: '2', name: 'web-dashboard', directory: normalizePath(join(tmpdir(), 'broomy-e2e-web-dashboard')), agentId: 'codex' },
    { id: '3', name: 'mobile-app', directory: normalizePath(join(tmpdir(), 'broomy-e2e-mobile-app')), agentId: 'gemini' },
    { id: '4', name: 'payments-svc', directory: normalizePath(join(tmpdir(), 'broomy-e2e-payments-svc')), agentId: 'claude' },
    { id: '5', name: 'search-engine', directory: normalizePath(join(tmpdir(), 'broomy-e2e-search-engine')), agentId: 'claude' },
    { id: '6', name: 'infra-config', directory: normalizePath(join(tmpdir(), 'broomy-e2e-infra-config')), agentId: 'codex' },
    { id: '7', name: 'docs-site', directory: normalizePath(join(tmpdir(), 'broomy-e2e-docs-site')), agentId: null },
    { id: '8', name: 'data-pipeline', directory: normalizePath(join(tmpdir(), 'broomy-e2e-data-pipeline')), agentId: 'claude' },
  ] : [
    { id: '1', name: 'broomy', directory: normalizePath(join(tmpdir(), 'broomy-e2e-broomy')), agentId: 'claude' },
    { id: '2', name: 'backend-api', directory: normalizePath(join(tmpdir(), 'broomy-e2e-backend-api')), agentId: 'aider' },
    { id: '3', name: 'docs-site', directory: normalizePath(join(tmpdir(), 'broomy-e2e-docs-site')), agentId: null },
  ]
}

export function getE2EDemoRepos() {
  return [
    { id: 'repo-1', name: 'demo-project', remoteUrl: 'git@github.com:user/demo-project.git', rootDir: normalizePath(join(tmpdir(), 'broomy-e2e-repos/demo-project')), defaultBranch: 'main' },
  ]
}

export function getE2EMockBranches(isScreenshotMode: boolean): Record<string, string> {
  return isScreenshotMode ? {
    [normalizePath(join(tmpdir(), 'broomy-e2e-backend-api'))]: 'feature/jwt-auth',
    [normalizePath(join(tmpdir(), 'broomy-e2e-web-dashboard'))]: 'fix/dashboard-perf',
    [normalizePath(join(tmpdir(), 'broomy-e2e-mobile-app'))]: 'feature/push-notifs',
    [normalizePath(join(tmpdir(), 'broomy-e2e-payments-svc'))]: 'feature/stripe-webhooks',
    [normalizePath(join(tmpdir(), 'broomy-e2e-search-engine'))]: 'feature/vector-search',
    [normalizePath(join(tmpdir(), 'broomy-e2e-infra-config'))]: 'fix/k8s-scaling',
    [normalizePath(join(tmpdir(), 'broomy-e2e-docs-site'))]: 'main',
    [normalizePath(join(tmpdir(), 'broomy-e2e-data-pipeline'))]: 'feature/batch-processing',
  } : {
    [normalizePath(join(tmpdir(), 'broomy-e2e-broomy'))]: 'main',
    [normalizePath(join(tmpdir(), 'broomy-e2e-backend-api'))]: 'feature/auth',
    [normalizePath(join(tmpdir(), 'broomy-e2e-docs-site'))]: 'main',
  }
}
