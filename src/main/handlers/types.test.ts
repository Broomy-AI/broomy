import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { homedir } from 'os'
import {
  CONFIG_DIR,
  PROFILES_DIR,
  PROFILES_FILE,
  getConfigFileName,
  getProfileConfigFile,
  getProfileInitScriptsDir,
  validateProfileId,
  expandHomePath,
  getE2EDemoRepos,
  E2EScenario,
  DEFAULT_AGENTS,
  DEFAULT_PROFILES,
} from './types'
import { getScenarioData } from './scenarios'

describe('types constants', () => {
  it('CONFIG_DIR points to ~/.broomy', () => {
    expect(CONFIG_DIR).toBe(join(homedir(), '.broomy'))
  })

  it('PROFILES_DIR points to ~/.broomy/profiles', () => {
    expect(PROFILES_DIR).toBe(join(CONFIG_DIR, 'profiles'))
  })

  it('PROFILES_FILE points to ~/.broomy/profiles.json', () => {
    expect(PROFILES_FILE).toBe(join(CONFIG_DIR, 'profiles.json'))
  })
})

describe('getConfigFileName', () => {
  it('returns config.dev.json when isDev is true', () => {
    expect(getConfigFileName(true)).toBe('config.dev.json')
  })

  it('returns config.json when isDev is false', () => {
    expect(getConfigFileName(false)).toBe('config.json')
  })
})

describe('validateProfileId', () => {
  it('accepts alphanumeric IDs with hyphens and underscores', () => {
    expect(() => validateProfileId('default')).not.toThrow()
    expect(() => validateProfileId('my-profile')).not.toThrow()
    expect(() => validateProfileId('profile_2')).not.toThrow()
    expect(() => validateProfileId('ABC-123')).not.toThrow()
  })

  it('rejects path traversal attempts', () => {
    expect(() => validateProfileId('../../../etc')).toThrow('Invalid profile ID')
    expect(() => validateProfileId('../../passwd')).toThrow('Invalid profile ID')
  })

  it('rejects IDs with slashes', () => {
    expect(() => validateProfileId('foo/bar')).toThrow('Invalid profile ID')
    expect(() => validateProfileId('foo\\bar')).toThrow('Invalid profile ID')
  })

  it('rejects IDs with dots', () => {
    expect(() => validateProfileId('.')).toThrow('Invalid profile ID')
    expect(() => validateProfileId('..')).toThrow('Invalid profile ID')
    expect(() => validateProfileId('profile.name')).toThrow('Invalid profile ID')
  })

  it('rejects empty strings', () => {
    expect(() => validateProfileId('')).toThrow('Invalid profile ID')
  })

  it('rejects IDs with spaces', () => {
    expect(() => validateProfileId('my profile')).toThrow('Invalid profile ID')
  })
})

describe('getProfileConfigFile', () => {
  it('returns the full path for a dev config', () => {
    const result = getProfileConfigFile('my-profile', true)
    expect(result).toBe(join(PROFILES_DIR, 'my-profile', 'config.dev.json'))
  })

  it('returns the full path for a production config', () => {
    const result = getProfileConfigFile('my-profile', false)
    expect(result).toBe(join(PROFILES_DIR, 'my-profile', 'config.json'))
  })

  it('throws on invalid profile IDs', () => {
    expect(() => getProfileConfigFile('../evil', false)).toThrow('Invalid profile ID')
  })
})

describe('getProfileInitScriptsDir', () => {
  it('returns the init-scripts directory for a profile', () => {
    const result = getProfileInitScriptsDir('my-profile')
    expect(result).toBe(join(PROFILES_DIR, 'my-profile', 'init-scripts'))
  })

  it('throws on invalid profile IDs', () => {
    expect(() => getProfileInitScriptsDir('../evil')).toThrow('Invalid profile ID')
  })
})

describe('DEFAULT_AGENTS', () => {
  it('contains five default agents', () => {
    expect(DEFAULT_AGENTS).toHaveLength(5)
  })

  it('includes claude, codex, gemini, copilot, and junie', () => {
    const ids = DEFAULT_AGENTS.map((a) => a.id)
    expect(ids).toEqual(['claude', 'codex', 'gemini', 'copilot', 'junie'])
  })

  it('each agent has id, name, command, and color', () => {
    for (const agent of DEFAULT_AGENTS) {
      expect(agent).toHaveProperty('id')
      expect(agent).toHaveProperty('name')
      expect(agent).toHaveProperty('command')
      expect(agent).toHaveProperty('color')
    }
  })
})

describe('DEFAULT_PROFILES', () => {
  it('has a default profile', () => {
    expect(DEFAULT_PROFILES.profiles).toHaveLength(1)
    expect(DEFAULT_PROFILES.profiles[0].id).toBe('default')
    expect(DEFAULT_PROFILES.profiles[0].name).toBe('Default')
  })

  it('has lastProfileId set to default', () => {
    expect(DEFAULT_PROFILES.lastProfileId).toBe('default')
  })
})

describe('expandHomePath', () => {
  it('expands ~ to home directory', () => {
    expect(expandHomePath('~')).toBe(homedir())
  })

  it('expands ~/ prefix to home directory', () => {
    expect(expandHomePath('~/Documents')).toBe(join(homedir(), 'Documents'))
  })

  it('expands ~/nested/path', () => {
    expect(expandHomePath('~/a/b/c')).toBe(join(homedir(), 'a/b/c'))
  })

  it('does not expand paths that do not start with ~', () => {
    expect(expandHomePath('/absolute/path')).toBe('/absolute/path')
  })

  it('does not expand ~ in the middle of a path', () => {
    expect(expandHomePath('/some/~/path')).toBe('/some/~/path')
  })

  it('does not expand ~user style paths', () => {
    expect(expandHomePath('~user/foo')).toBe('~user/foo')
  })
})

describe('getScenarioData sessions', () => {
  it('returns 8 sessions in marketing scenario', () => {
    const sessions = getScenarioData(E2EScenario.Marketing).sessions
    expect(sessions).toHaveLength(8)
  })

  it('returns 3 sessions in default scenario', () => {
    const sessions = getScenarioData(E2EScenario.Default).sessions
    expect(sessions).toHaveLength(3)
  })

  it('each session has id, name, directory, and agentId', () => {
    const sessions = getScenarioData(E2EScenario.Default).sessions
    for (const session of sessions) {
      expect(session).toHaveProperty('id')
      expect(session).toHaveProperty('name')
      expect(session).toHaveProperty('directory')
      expect(session).toHaveProperty('agentId')
    }
  })

  it('session directories use tmpdir and are normalized', () => {
    const sessions = getScenarioData(E2EScenario.Default).sessions
    for (const session of sessions) {
      // Should not contain backslashes (normalized)
      expect(session.directory).not.toContain('\\')
    }
  })
})

describe('getE2EDemoRepos', () => {
  it('returns one demo repo', () => {
    const repos = getE2EDemoRepos()
    expect(repos).toHaveLength(1)
    expect(repos[0].name).toBe('demo-project')
    expect(repos[0].defaultBranch).toBe('main')
  })

  it('repo rootDir is normalized', () => {
    const repos = getE2EDemoRepos()
    expect(repos[0].rootDir).not.toContain('\\')
  })
})

describe('getScenarioData branches', () => {
  it('returns 8 branch mappings in marketing scenario', () => {
    const branches = getScenarioData(E2EScenario.Marketing).branches
    expect(Object.keys(branches)).toHaveLength(8)
  })

  it('returns 3 branch mappings in default scenario', () => {
    const branches = getScenarioData(E2EScenario.Default).branches
    expect(Object.keys(branches)).toHaveLength(3)
  })

  it('keys are normalized paths (no backslashes)', () => {
    const branches = getScenarioData(E2EScenario.Default).branches
    for (const key of Object.keys(branches)) {
      expect(key).not.toContain('\\')
    }
  })

  it('values are branch name strings', () => {
    const branches = getScenarioData(E2EScenario.Default).branches
    for (const value of Object.values(branches)) {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })
})
