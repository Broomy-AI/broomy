import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import {
  CONFIG_DIR,
  PROFILES_DIR,
  PROFILES_FILE,
  getConfigFileName,
  getProfileConfigFile,
  getProfileInitScriptsDir,
  expandHomePath,
  getE2EDemoSessions,
  getE2EDemoRepos,
  getE2EMockBranches,
  DEFAULT_AGENTS,
  DEFAULT_PROFILES,
} from './types'

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

describe('getProfileConfigFile', () => {
  it('returns the full path for a dev config', () => {
    const result = getProfileConfigFile('my-profile', true)
    expect(result).toBe(join(PROFILES_DIR, 'my-profile', 'config.dev.json'))
  })

  it('returns the full path for a production config', () => {
    const result = getProfileConfigFile('my-profile', false)
    expect(result).toBe(join(PROFILES_DIR, 'my-profile', 'config.json'))
  })
})

describe('getProfileInitScriptsDir', () => {
  it('returns the init-scripts directory for a profile', () => {
    const result = getProfileInitScriptsDir('my-profile')
    expect(result).toBe(join(PROFILES_DIR, 'my-profile', 'init-scripts'))
  })
})

describe('DEFAULT_AGENTS', () => {
  it('contains three default agents', () => {
    expect(DEFAULT_AGENTS).toHaveLength(3)
  })

  it('includes claude, codex, and gemini', () => {
    const ids = DEFAULT_AGENTS.map((a) => a.id)
    expect(ids).toEqual(['claude', 'codex', 'gemini'])
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

describe('getE2EDemoSessions', () => {
  it('returns 8 sessions in screenshot mode', () => {
    const sessions = getE2EDemoSessions(true)
    expect(sessions).toHaveLength(8)
  })

  it('returns 3 sessions in non-screenshot mode', () => {
    const sessions = getE2EDemoSessions(false)
    expect(sessions).toHaveLength(3)
  })

  it('each session has id, name, directory, and agentId', () => {
    const sessions = getE2EDemoSessions(false)
    for (const session of sessions) {
      expect(session).toHaveProperty('id')
      expect(session).toHaveProperty('name')
      expect(session).toHaveProperty('directory')
      expect(session).toHaveProperty('agentId')
    }
  })

  it('session directories use tmpdir and are normalized', () => {
    const sessions = getE2EDemoSessions(false)
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

describe('getE2EMockBranches', () => {
  it('returns 8 branch mappings in screenshot mode', () => {
    const branches = getE2EMockBranches(true)
    expect(Object.keys(branches)).toHaveLength(8)
  })

  it('returns 3 branch mappings in non-screenshot mode', () => {
    const branches = getE2EMockBranches(false)
    expect(Object.keys(branches)).toHaveLength(3)
  })

  it('keys are normalized paths (no backslashes)', () => {
    const branches = getE2EMockBranches(false)
    for (const key of Object.keys(branches)) {
      expect(key).not.toContain('\\')
    }
  })

  it('values are branch name strings', () => {
    const branches = getE2EMockBranches(false)
    for (const value of Object.values(branches)) {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })
})
