/**
 * Shared types, constants, and helpers used across all IPC handler modules.
 */
import type { BrowserWindow } from 'electron'
import type { IPty } from 'node-pty'
import type { FSWatcher } from 'fs'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { normalizePath } from '../platform'

/**
 * E2E test scenarios control which mock data is loaded.
 *
 * - default: 3 sessions with issue data, used by most feature tests.
 * - marketing: 8 sessions with rich git status and file trees.
 *    ⚠️  This scenario generates the screenshots used on the Broomy marketing
 *    website. Edit its mock data with care — changes affect published content.
 */
export enum E2EScenario {
  Default = 'default',
  /** ⚠️ Used for the Broomy marketing website. Edit mock data with care. */
  Marketing = 'marketing',
}

export type DockerContainerState = {
  containerId: string
  repoDir: string
  image: string
}

export interface HandlerContext {
  isE2ETest: boolean
  e2eScenario: E2EScenario
  /** When true, E2E handlers fall through to real fs/git for session directories. */
  e2eRealRepos: boolean
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
  dockerContainers: Map<string, DockerContainerState>
}

// Config directory and file constants
export const CONFIG_DIR = join(homedir(), '.broomy')
export const PROFILES_DIR = join(CONFIG_DIR, 'profiles')
export const PROFILES_FILE = join(CONFIG_DIR, 'profiles.json')

export function getConfigFileName(isDev: boolean): string {
  return isDev ? 'config.dev.json' : 'config.json'
}

/** Validate that a profile ID is safe for use in file paths (no traversal). */
export function validateProfileId(profileId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(profileId)) {
    throw new Error(`Invalid profile ID: ${profileId}`)
  }
}

export function getProfileConfigFile(profileId: string, isDev: boolean): string {
  validateProfileId(profileId)
  return join(PROFILES_DIR, profileId, getConfigFileName(isDev))
}

export function getProfileInitScriptsDir(profileId: string): string {
  validateProfileId(profileId)
  return join(PROFILES_DIR, profileId, 'init-scripts')
}

// Default agents
export const DEFAULT_AGENTS = [
  { id: 'claude', name: 'Claude Code', command: 'claude', color: '#D97757', skipApprovalFlag: '--dangerously-skip-permissions' },
  { id: 'codex', name: 'Codex', command: 'codex', color: '#10A37F', skipApprovalFlag: '--approval-mode full-auto' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', color: '#4285F4' },
  { id: 'copilot', name: 'GitHub Copilot', command: 'copilot', color: '#6E40C9' },
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

// E2E mock data — scenario-specific data is in scenarios.ts
// Only non-scenario-specific data remains here.
export function getE2EDemoRepos() {
  return [
    { id: 'repo-1', name: 'demo-project', remoteUrl: 'git@github.com:user/demo-project.git', rootDir: normalizePath(join(tmpdir(), 'broomy-e2e-repos/demo-project')), defaultBranch: 'main' },
  ]
}
