// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../../../test/react-setup'
import {
  resolveTemplateVars,
  evaluateShowWhen,
  commandsConfigPath,
  ensureOutputGitignore,
  matchesSurface,
  checkLegacyBroomyGitignore,
  removeLegacyBroomyGitignore,
  validateCommandsConfig,
  CURRENT_CONFIG_VERSION,
  migrateConfig,
} from './commandsConfig'
import type { ActionDefinition } from './commandsConfig'
import type { ConditionState, TemplateVars } from './commandsConfig'

beforeEach(() => {
  vi.clearAllMocks()
})

const VARS: TemplateVars = { main: 'main', branch: 'feature/test', directory: '/repo' }

describe('resolveTemplateVars', () => {
  it('replaces {main}, {branch}, {directory}', () => {
    expect(resolveTemplateVars('git push origin HEAD:{main}', VARS)).toBe('git push origin HEAD:main')
    expect(resolveTemplateVars('on {branch}', VARS)).toBe('on feature/test')
    expect(resolveTemplateVars('{directory}/.broomy', VARS)).toBe('/repo/.broomy')
  })

  it('replaces multiple occurrences', () => {
    expect(resolveTemplateVars('{main} and {main}', VARS)).toBe('main and main')
  })

  it('returns unchanged text when no placeholders', () => {
    expect(resolveTemplateVars('git status', VARS)).toBe('git status')
  })
})

describe('evaluateShowWhen', () => {
  const base: ConditionState = {
    'has-changes': false, clean: true, merging: false, conflicts: false,
    'no-tracking': false, ahead: false, behind: false, 'behind-main': false,
    'on-main': false, 'in-progress': true, pushed: true, empty: false,
    open: false, merged: false, closed: false, 'no-pr': true,
    'has-write-access': true, 'allow-approve-and-merge': false, 'checks-passed': false, 'has-issue': false, 'no-devcontainer': false, review: false,
  }

  it('returns true for empty conditions', () => {
    expect(evaluateShowWhen([], base)).toBe(true)
  })

  it('evaluates simple conditions', () => {
    expect(evaluateShowWhen(['clean'], base)).toBe(true)
    expect(evaluateShowWhen(['has-changes'], base)).toBe(false)
  })

  it('evaluates negation', () => {
    expect(evaluateShowWhen(['!merging'], base)).toBe(true)
    expect(evaluateShowWhen(['!clean'], base)).toBe(false)
  })

  it('evaluates OR conditions', () => {
    expect(evaluateShowWhen(['ahead|behind'], base)).toBe(false)
    expect(evaluateShowWhen(['pushed|open'], base)).toBe(true)
  })

  it('evaluates ALL conditions (AND)', () => {
    expect(evaluateShowWhen(['clean', 'pushed'], base)).toBe(true)
    expect(evaluateShowWhen(['clean', 'has-changes'], base)).toBe(false)
  })

  it('evaluates mixed negation and OR', () => {
    expect(evaluateShowWhen(['!merging', 'pushed|open'], base)).toBe(true)
  })
})

describe('commandsConfigPath', () => {
  it('returns the expected path', () => {
    expect(commandsConfigPath('/repo')).toBe('/repo/.broomy/commands.json')
  })
})

describe('matchesSurface', () => {
  const base: ActionDefinition = { id: 'test', label: 'Test', template: '/test' }

  it('defaults to source-control when no surface specified', () => {
    expect(matchesSurface(base, 'source-control')).toBe(true)
    expect(matchesSurface(base, 'review')).toBe(false)
  })

  it('matches string surface', () => {
    expect(matchesSurface({ ...base, surface: 'review' }, 'review')).toBe(true)
    expect(matchesSurface({ ...base, surface: 'review' }, 'source-control')).toBe(false)
  })

  it('matches array surface', () => {
    const action = { ...base, surface: ['source-control', 'review'] }
    expect(matchesSurface(action, 'source-control')).toBe(true)
    expect(matchesSurface(action, 'review')).toBe(true)
    expect(matchesSurface(action, 'other')).toBe(false)
  })
})

describe('checkLegacyBroomyGitignore', () => {
  it('returns false when .gitignore does not exist', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    expect(await checkLegacyBroomyGitignore('/repo')).toBe(false)
  })

  it('returns true when .broomy/ is in .gitignore', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue('node_modules/\n.broomy/\n')
    expect(await checkLegacyBroomyGitignore('/repo')).toBe(true)
  })

  it('returns true for .broomy without trailing slash', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue('.broomy\n')
    expect(await checkLegacyBroomyGitignore('/repo')).toBe(true)
  })

  it('returns true for /.broomy/ with leading slash', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue('/.broomy/\n')
    expect(await checkLegacyBroomyGitignore('/repo')).toBe(true)
  })

  it('returns false when .broomy is not in .gitignore', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue('node_modules/\n')
    expect(await checkLegacyBroomyGitignore('/repo')).toBe(false)
  })

  it('returns false on error', async () => {
    vi.mocked(window.fs.exists).mockRejectedValue(new Error('fail'))
    expect(await checkLegacyBroomyGitignore('/repo')).toBe(false)
  })
})

describe('removeLegacyBroomyGitignore', () => {
  it('does nothing when .gitignore does not exist', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    await removeLegacyBroomyGitignore('/repo')
    expect(window.fs.writeFile).not.toHaveBeenCalled()
  })

  it('removes .broomy/ entries from .gitignore', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue('node_modules/\n.broomy/\ndist/\n')
    await removeLegacyBroomyGitignore('/repo')
    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/repo/.gitignore',
      'node_modules/\ndist/\n'
    )
  })

  it('removes # Broomy review data comment lines', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue('node_modules/\n# Broomy review data\n.broomy/\n')
    await removeLegacyBroomyGitignore('/repo')
    const written = vi.mocked(window.fs.writeFile).mock.calls[0][1]
    expect(written).not.toContain('Broomy review data')
    expect(written).not.toContain('.broomy')
  })

  it('handles errors gracefully', async () => {
    vi.mocked(window.fs.exists).mockRejectedValue(new Error('fail'))
    // Should not throw
    await removeLegacyBroomyGitignore('/repo')
  })
})

describe('ensureOutputGitignore', () => {
  it('creates new .gitignore when none exists', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })

    await ensureOutputGitignore('/repo')

    expect(window.fs.mkdir).toHaveBeenCalledWith('/repo/.broomy')
    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/repo/.broomy/.gitignore',
      '# Broomy generated files\n/output/\n'
    )
  })

  it('appends to existing .gitignore without output entry', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue('# existing\nsome-file\n')
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })

    await ensureOutputGitignore('/repo')

    expect(window.fs.appendFile).toHaveBeenCalledWith(
      '/repo/.broomy/.gitignore',
      '\n/output/\n'
    )
  })

  it('does nothing when output is already in .gitignore', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue('/output/\n')
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })

    await ensureOutputGitignore('/repo')

    expect(window.fs.appendFile).not.toHaveBeenCalled()
    expect(window.fs.writeFile).not.toHaveBeenCalled()
  })

  it('skips creating .broomy/.gitignore when .broomy is in repo .gitignore', async () => {
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path === '/repo/.gitignore') return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path === '/repo/.gitignore') return '# stuff\n.broomy/\n'
      return ''
    })

    await ensureOutputGitignore('/repo')

    expect(window.fs.writeFile).not.toHaveBeenCalled()
    expect(window.fs.appendFile).not.toHaveBeenCalled()
  })

  it('handles errors gracefully', async () => {
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })
    vi.mocked(window.fs.exists).mockRejectedValue(new Error('fail'))

    // Should not throw
    await ensureOutputGitignore('/repo')
  })
})

describe('migrateConfig', () => {
  it('passes v2 configs through unchanged', () => {
    const v2 = {
      version: 2,
      actions: [{ id: 'a', label: 'A', template: '/x' }],
    }
    expect(migrateConfig(v2)).toEqual(v2)
  })

  it('migrates v1 agent prompt to template', () => {
    const v1 = {
      version: 1,
      actions: [{
        id: 'commit',
        label: 'Commit',
        type: 'agent',
        prompt: 'Commit changes',
        showWhen: ['has-changes'],
        style: 'primary',
      }],
    }
    const v2 = migrateConfig(v1)
    expect(v2.version).toBe(2)
    expect(v2.actions[0]).toEqual({
      id: 'commit',
      label: 'Commit',
      template: 'Commit changes',
      showWhen: ['has-changes'],
      style: 'primary',
    })
  })

  it('migrates v1 shell command to template with ! prefix', () => {
    const v1 = {
      version: 1,
      actions: [{ id: 'push', label: 'Push', type: 'shell', command: 'git push' }],
    }
    expect(migrateConfig(v1).actions[0]).toEqual({
      id: 'push',
      label: 'Push',
      template: '!git push',
    })
  })

  it('drops agents overrides silently', () => {
    const v1 = {
      version: 1,
      actions: [{
        id: 'x',
        label: 'X',
        type: 'agent',
        prompt: 'base',
        agents: { claude: { prompt: 'claude prompt' } },
      }],
    }
    const out = migrateConfig(v1).actions[0]
    expect(out.template).toBe('base')
    expect('agents' in out).toBe(false)
  })

  it('preserves surface and switchTab through migration', () => {
    const v1 = {
      version: 1,
      actions: [{
        id: 'r', label: 'R', type: 'agent', prompt: 'p',
        surface: ['source-control', 'review'], switchTab: 'review',
      }],
    }
    const out = migrateConfig(v1).actions[0]
    expect(out.surface).toEqual(['source-control', 'review'])
    expect(out.switchTab).toBe('review')
  })

  it('preserves empty showWhen', () => {
    const v1 = {
      version: 1,
      actions: [{ id: 'a', label: 'A', type: 'agent', prompt: 'p', showWhen: [] }],
    }
    expect(migrateConfig(v1).actions[0].showWhen).toEqual([])
  })
})

import { loadConfigFromPath, mergeConfigs, isVisible, discoverStages } from './commandsConfig'

describe('loadConfigFromPath', () => {
  beforeEach(() => {
    ;(globalThis as any).window = {
      fs: {
        exists: vi.fn(),
        readFile: vi.fn(),
      },
    }
  })

  it('returns null when file missing', async () => {
    ;(window.fs.exists as any).mockResolvedValue(false)
    expect(await loadConfigFromPath('/x')).toBeNull()
  })

  it('returns ok with migrated config for valid v2', async () => {
    ;(window.fs.exists as any).mockResolvedValue(true)
    ;(window.fs.readFile as any).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'a', label: 'A', template: 't' }],
    }))
    const r = await loadConfigFromPath('/x')
    expect(r).toEqual({ ok: true, config: { version: 2, actions: [{ id: 'a', label: 'A', template: 't' }] } })
  })

  it('returns ok after v1 migration', async () => {
    ;(window.fs.exists as any).mockResolvedValue(true)
    ;(window.fs.readFile as any).mockResolvedValue(JSON.stringify({
      version: 1, actions: [{ id: 'a', label: 'A', type: 'agent', prompt: 'p' }],
    }))
    const r = await loadConfigFromPath('/x')
    expect(r).toMatchObject({ ok: true })
    if (r?.ok) {
      expect(r.config.actions[0].template).toBe('p')
    }
  })

  it('returns error for invalid JSON', async () => {
    ;(window.fs.exists as any).mockResolvedValue(true)
    ;(window.fs.readFile as any).mockResolvedValue('{ not json')
    const r = await loadConfigFromPath('/x')
    expect(r?.ok).toBe(false)
  })

  it('returns error for schema-invalid config (post-migration)', async () => {
    ;(window.fs.exists as any).mockResolvedValue(true)
    ;(window.fs.readFile as any).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'a', label: 'A' }], // missing template
    }))
    const r = await loadConfigFromPath('/x')
    expect(r?.ok).toBe(false)
  })
})

describe('mergeConfigs', () => {
  it('returns null when both inputs null', () => {
    expect(mergeConfigs(null, null)).toBeNull()
  })

  it('returns user actions when project null', () => {
    expect(mergeConfigs(
      { version: 2, actions: [{ id: 'a', label: 'A', template: 't' }] },
      null,
    )?.actions.map(a => a.id)).toEqual(['a'])
  })

  it('returns project actions when user null', () => {
    expect(mergeConfigs(
      null,
      { version: 2, actions: [{ id: 'b', label: 'B', template: 't' }] },
    )?.actions.map(a => a.id)).toEqual(['b'])
  })

  it('concatenates user then project, keeping duplicate ids', () => {
    const merged = mergeConfigs(
      { version: 2, actions: [{ id: 'a', label: 'User A', template: 't' }] },
      { version: 2, actions: [{ id: 'a', label: 'Project A', template: 't' }, { id: 'b', label: 'B', template: 't' }] },
    )
    expect(merged?.actions.map(a => a.label)).toEqual(['User A', 'Project A', 'B'])
  })
})

describe('isVisible', () => {
  const baseState = {
    'has-changes': false, 'clean': true, 'merging': false, 'conflicts': false,
    'no-tracking': false, 'ahead': false, 'behind': false, 'behind-main': false,
    'on-main': false, 'in-progress': false, 'pushed': false, 'empty': false,
    'open': false, 'merged': false, 'closed': false, 'no-pr': true,
    'has-write-access': true, 'allow-approve-and-merge': true,
    'checks-passed': true, 'has-issue': false, 'no-devcontainer': false, 'review': false,
  } as any

  it('is true when no filters specified', () => {
    expect(isVisible({ id: 'a', label: 'A', template: 't' }, baseState, 'planning', 'source-control')).toBe(true)
  })

  it('honors showWhen', () => {
    expect(isVisible({ id: 'a', label: 'A', template: 't', showWhen: ['has-changes'] }, baseState, 'planning', 'source-control')).toBe(false)
    expect(isVisible({ id: 'a', label: 'A', template: 't', showWhen: ['clean'] }, baseState, 'planning', 'source-control')).toBe(true)
  })

  it('honors stages list', () => {
    expect(isVisible({ id: 'a', label: 'A', template: 't', stages: ['verifying'] }, baseState, 'planning', 'source-control')).toBe(false)
    expect(isVisible({ id: 'a', label: 'A', template: 't', stages: ['planning', 'verifying'] }, baseState, 'planning', 'source-control')).toBe(true)
  })

  it('honors surface filter', () => {
    expect(isVisible({ id: 'a', label: 'A', template: 't', surface: 'review' }, baseState, 'planning', 'source-control')).toBe(false)
    expect(isVisible({ id: 'a', label: 'A', template: 't', surface: ['review', 'source-control'] }, baseState, 'planning', 'source-control')).toBe(true)
  })
})

describe('discoverStages', () => {
  it('always includes the default stage pinned first', () => {
    expect(discoverStages([], 'planning')).toEqual(['planning'])
  })

  it('unions stages and setStage across actions; sorts non-default alphabetically', () => {
    const stages = discoverStages([
      { id: 'a', label: 'A', template: 't', setStage: 'implementing' },
      { id: 'b', label: 'B', template: 't', stages: ['implementing', 'building'] },
      { id: 'c', label: 'C', template: 't', stages: ['verifying'] },
    ], 'planning')
    expect(stages).toEqual(['planning', 'building', 'implementing', 'verifying'])
  })

  it('includes the current stage even if no command references it', () => {
    expect(discoverStages([], 'mystage')).toEqual(['planning', 'mystage'])
  })

  it('ignores setStage: null', () => {
    expect(discoverStages([
      { id: 'a', label: 'A', template: 't', setStage: null },
    ], 'planning')).toEqual(['planning'])
  })
})

describe('v2 schema', () => {
  it('CURRENT_CONFIG_VERSION is 2', () => {
    expect(CURRENT_CONFIG_VERSION).toBe(2)
  })

  it('accepts a minimal v2 config', () => {
    const config = {
      version: 2,
      actions: [
        { id: 'a', label: 'A', template: '/foo {x}' },
      ],
    }
    expect(validateCommandsConfig(config)).toEqual([])
  })

  it('accepts stages, setStage, args, description', () => {
    const config = {
      version: 2,
      actions: [
        {
          id: 'a',
          label: 'A',
          description: 'hover help',
          template: '/foo {x}',
          showWhen: ['has-changes'],
          stages: ['planning', 'building'],
          setStage: 'verifying',
          args: [{ name: 'x', description: 'd' }],
          style: 'primary',
          surface: 'source-control',
          switchTab: 'review',
        },
      ],
    }
    expect(validateCommandsConfig(config)).toEqual([])
  })

  it('rejects missing template', () => {
    const errs = validateCommandsConfig({
      version: 2,
      actions: [{ id: 'a', label: 'A' }],
    })
    expect(errs.some(e => e.includes('template'))).toBe(true)
  })

  it('rejects non-string setStage when not null', () => {
    const errs = validateCommandsConfig({
      version: 2,
      actions: [{ id: 'a', label: 'A', template: 't', setStage: 42 }],
    })
    expect(errs.some(e => e.includes('setStage'))).toBe(true)
  })

  it('accepts setStage: null', () => {
    expect(validateCommandsConfig({
      version: 2,
      actions: [{ id: 'a', label: 'A', template: 't', setStage: null }],
    })).toEqual([])
  })
})
