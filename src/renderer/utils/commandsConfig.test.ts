// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../../test/react-setup'
import {
  resolveTemplateVars,
  evaluateShowWhen,
  commandsConfigPath,
  loadCommandsConfig,
  detectAgentType,
  getAgentTypes,
  getDefaultCommandsConfig,
  ensureOutputGitignore,
  matchesSurface,
  checkLegacyBroomyGitignore,
  removeLegacyBroomyGitignore,
  validateCommandsConfig,
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

describe('loadCommandsConfig', () => {
  it('returns null when file does not exist', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    const result = await loadCommandsConfig('/repo')
    expect(result).toBeNull()
  })

  it('loads valid config', async () => {
    const config = { version: 1, actions: [{ id: 'test', label: 'Test', type: 'agent', showWhen: [] }] }
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify(config))

    const result = await loadCommandsConfig('/repo')
    expect(result).toEqual({ ok: true, config })
  })

  it('returns error for invalid config (missing version)', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({ actions: [] }))

    const result = await loadCommandsConfig('/repo')
    expect(result).not.toBeNull()
    expect(result!.ok).toBe(false)
    if (!result!.ok) expect(result!.error).toContain('"version"')
  })

  it('returns error for invalid config (missing actions array)', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({ version: 1 }))

    const result = await loadCommandsConfig('/repo')
    expect(result).not.toBeNull()
    expect(result!.ok).toBe(false)
    if (!result!.ok) expect(result!.error).toContain('"actions"')
  })

  it('returns error for invalid JSON', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue('not valid json {{{')

    const result = await loadCommandsConfig('/repo')
    expect(result).not.toBeNull()
    expect(result!.ok).toBe(false)
    if (!result!.ok) expect(result!.error).toContain('Invalid JSON')
  })

  it('strips agent overrides with no prompt (legacy skill-only entries)', async () => {
    const config = {
      version: 1,
      actions: [
        {
          id: 'commit', label: 'Commit', type: 'agent', showWhen: [],
          prompt: 'default prompt',
          agents: { claude: { skill: 'broomy-action-commit' }, aider: { prompt: 'aider prompt' } },
        },
      ],
    }
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify(config))

    const result = await loadCommandsConfig('/repo')
    expect(result!.ok).toBe(true)
    if (result!.ok) {
      // claude override (skill-only, no prompt) should be stripped
      expect(result!.config.actions[0].agents).toEqual({ aider: { prompt: 'aider prompt' } })
    }
  })

  it('removes agents field entirely when all overrides are skill-only', async () => {
    const config = {
      version: 1,
      actions: [
        {
          id: 'commit', label: 'Commit', type: 'agent', showWhen: [],
          agents: { claude: { skill: 'broomy-action-commit' } },
        },
      ],
    }
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify(config))

    const result = await loadCommandsConfig('/repo')
    expect(result!.ok).toBe(true)
    if (result!.ok) {
      expect(result!.config.actions[0].agents).toBeUndefined()
    }
  })

  it('returns null on read error', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockRejectedValue(new Error('read error'))

    const result = await loadCommandsConfig('/repo')
    expect(result).toBeNull()
  })
})

describe('detectAgentType', () => {
  it('detects claude', () => {
    expect(detectAgentType('claude')).toBe('claude')
    expect(detectAgentType('/usr/bin/claude --flag')).toBe('claude')
  })

  it('detects aider', () => {
    expect(detectAgentType('aider')).toBe('aider')
  })

  it('detects cursor', () => {
    expect(detectAgentType('cursor')).toBe('cursor')
  })

  it('detects codex', () => {
    expect(detectAgentType('codex')).toBe('codex')
    expect(detectAgentType('/usr/local/bin/codex --flag')).toBe('codex')
  })

  it('detects gemini', () => {
    expect(detectAgentType('gemini')).toBe('gemini')
  })

  it('returns null for unknown agent', () => {
    expect(detectAgentType('unknown-agent')).toBeNull()
    expect(detectAgentType('vim')).toBeNull()
  })
})

describe('getAgentTypes', () => {
  it('returns unique sorted agent types', () => {
    const agents = [
      { command: 'claude' },
      { command: 'aider --model gpt-4' },
      { command: 'claude --flag' },
    ]
    expect(getAgentTypes(agents)).toEqual(['aider', 'claude'])
  })

  it('returns empty array when no recognized agents', () => {
    expect(getAgentTypes([{ command: 'vim' }])).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(getAgentTypes([])).toEqual([])
  })

  it('includes codex and gemini', () => {
    const agents = [
      { command: 'codex' },
      { command: 'gemini' },
      { command: 'claude' },
    ]
    expect(getAgentTypes(agents)).toEqual(['claude', 'codex', 'gemini'])
  })
})

describe('getDefaultCommandsConfig', () => {
  it('returns a valid config with actions', () => {
    const config = getDefaultCommandsConfig()
    expect(config.version).toBe(1)
    expect(config.actions.length).toBeGreaterThan(0)
    expect(config.actions.every(a => a.id && a.label && a.type)).toBe(true)
  })
})

describe('validateCommandsConfig', () => {
  it('returns empty array for valid config', () => {
    expect(validateCommandsConfig({
      version: 1,
      actions: [{ id: 'test', label: 'Test', type: 'agent', showWhen: [] }],
    })).toEqual([])
  })

  it('catches missing version', () => {
    const errors = validateCommandsConfig({ actions: [] })
    expect(errors.some(e => e.includes('"version"'))).toBe(true)
  })

  it('catches missing actions', () => {
    const errors = validateCommandsConfig({ version: 1 })
    expect(errors.some(e => e.includes('"actions"'))).toBe(true)
  })

  it('catches non-object config', () => {
    expect(validateCommandsConfig('string').length).toBeGreaterThan(0)
    expect(validateCommandsConfig(null).length).toBeGreaterThan(0)
    expect(validateCommandsConfig([]).length).toBeGreaterThan(0)
  })

  it('catches invalid action type', () => {
    const errors = validateCommandsConfig({
      version: 1,
      actions: [{ id: 'test', label: 'Test', type: 'invalid', showWhen: [] }],
    })
    expect(errors.some(e => e.includes('"type"'))).toBe(true)
  })

  it('catches invalid style', () => {
    const errors = validateCommandsConfig({
      version: 1,
      actions: [{ id: 'test', label: 'Test', type: 'agent', showWhen: [], style: 'nope' }],
    })
    expect(errors.some(e => e.includes('"style"'))).toBe(true)
  })

  it('catches invalid surface type', () => {
    const errors = validateCommandsConfig({
      version: 1,
      actions: [{ id: 'test', label: 'Test', type: 'agent', showWhen: [], surface: 123 }],
    })
    expect(errors.some(e => e.includes('"surface"'))).toBe(true)
  })

  it('accepts valid surface as string or array', () => {
    expect(validateCommandsConfig({
      version: 1,
      actions: [{ id: 'test', label: 'Test', type: 'agent', showWhen: [], surface: 'review' }],
    })).toEqual([])
    expect(validateCommandsConfig({
      version: 1,
      actions: [{ id: 'test', label: 'Test', type: 'agent', showWhen: [], surface: ['source-control', 'review'] }],
    })).toEqual([])
  })

  it('catches missing action id', () => {
    const errors = validateCommandsConfig({
      version: 1,
      actions: [{ label: 'Test', type: 'agent', showWhen: [] }],
    })
    expect(errors.some(e => e.includes('"id"'))).toBe(true)
  })

  it('catches non-array showWhen', () => {
    const errors = validateCommandsConfig({
      version: 1,
      actions: [{ id: 'test', label: 'Test', type: 'agent', showWhen: 'oops' }],
    })
    expect(errors.some(e => e.includes('"showWhen"'))).toBe(true)
  })
})

describe('matchesSurface', () => {
  const base: ActionDefinition = { id: 'test', label: 'Test', type: 'agent', showWhen: [] }

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
