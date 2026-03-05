// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../../test/react-setup'
import {
  resolveTemplateVars,
  evaluateShowWhen,
  commandsConfigPath,
  loadCommandsConfig,
  detectAgentType,
  getDefaultCommandsConfig,
  getDefaultPromptFiles,
  ensureOutputGitignore,
} from './commandsConfig'
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
    'has-write-access': true, 'allow-push-to-main': false, 'has-issue': false, 'no-devcontainer': false,
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
    expect(result).toEqual(config)
  })

  it('returns null for invalid config (missing version)', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({ actions: [] }))

    const result = await loadCommandsConfig('/repo')
    expect(result).toBeNull()
  })

  it('returns null for invalid config (missing actions array)', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({ version: 1 }))

    const result = await loadCommandsConfig('/repo')
    expect(result).toBeNull()
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

  it('returns null for unknown agent', () => {
    expect(detectAgentType('unknown-agent')).toBeNull()
    expect(detectAgentType('vim')).toBeNull()
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

describe('getDefaultPromptFiles', () => {
  it('returns prompt files keyed by filename', () => {
    const files = getDefaultPromptFiles()
    expect(files['commit.md']).toContain('Commit')
    expect(files['push-to-main.md']).toContain('Push')
    expect(files['resolve-conflicts.md']).toContain('Resolve')
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
