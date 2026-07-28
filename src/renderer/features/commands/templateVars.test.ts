import { describe, it, expect } from 'vitest'
import { TEMPLATE_VARS, RESERVED_CONTEXT_VARS, buildTemplateVars, buildTemplateEnv, isAvailableAt } from './templateVars'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'

const repo = { id: 'r1', name: 'broomy', remoteUrl: '', rootDir: '/repos/broomy', defaultBranch: 'main' } as ManagedRepo
const session = {
  id: 's1', name: 'Fix login', directory: '/repos/broomy/wt/fix-login', branch: 'fix/login',
  stage: 'coding', prNumber: 42, prTitle: 'Fix login', prUrl: 'https://gh/pr/42',
  issueNumber: 7, issueTitle: 'Login broken', issueUrl: 'https://gh/i/7',
} as Session

describe('registry', () => {
  it('has unique names and env names', () => {
    expect(new Set(TEMPLATE_VARS.map(v => v.name)).size).toBe(TEMPLATE_VARS.length)
    expect(new Set(TEMPLATE_VARS.map(v => v.envName)).size).toBe(TEMPLATE_VARS.length)
  })

  it('uses valid identifiers and BROOMY_-prefixed env names', () => {
    for (const v of TEMPLATE_VARS) {
      expect(v.name).toMatch(/^[A-Za-z_][\w]*$/)
      expect(v.envName).toMatch(/^BROOMY_[A-Z0-9_]+$/)
      expect(v.description.length).toBeGreaterThan(0)
    }
  })

  it('reserves every registry name', () => {
    expect(RESERVED_CONTEXT_VARS).toEqual(new Set(TEMPLATE_VARS.map(v => v.name)))
  })

  it('marks PR and session variables unavailable at init, and others available', () => {
    const prTitle = TEMPLATE_VARS.find(v => v.name === 'prTitle')!
    const branch = TEMPLATE_VARS.find(v => v.name === 'branch')!
    expect(isAvailableAt(prTitle, 'init')).toBe(false)
    expect(isAvailableAt(prTitle, 'agent')).toBe(true)
    expect(isAvailableAt(branch, 'init')).toBe(true)
  })
})

describe('buildTemplateVars', () => {
  it('resolves every variable from a full session', () => {
    const vars = buildTemplateVars({ session, repo, directory: session.directory, branchBaseName: 'main' })
    expect(vars).toEqual({
      directory: '/repos/broomy/wt/fix-login',
      folderName: 'fix-login',
      repoRoot: '/repos/broomy',
      repoName: 'broomy',
      branch: 'fix/login',
      main: 'main',
      prNumber: '42',
      prTitle: 'Fix login',
      prUrl: 'https://gh/pr/42',
      issueNumber: '7',
      issueTitle: 'Login broken',
      issueUrl: 'https://gh/i/7',
      sessionName: 'Fix login',
      stage: 'coding',
    })
  })

  it('returns a key for every registry entry even with no data', () => {
    const vars = buildTemplateVars({ directory: '' })
    expect(Object.keys(vars).sort()).toEqual(TEMPLATE_VARS.map(v => v.name).sort())
    expect(Object.values(vars).every(v => v === '' || v === 'main')).toBe(true)
  })

  it('prefers syncStatus branch over the session branch', () => {
    const vars = buildTemplateVars({
      session, repo, directory: session.directory,
      syncStatus: { current: 'other/branch' } as never,
    })
    expect(vars.branch).toBe('other/branch')
  })

  it('takes issue values from the loose issue input when there is no session', () => {
    const vars = buildTemplateVars({
      repo, directory: '/repos/broomy/wt/new',
      issue: { number: 9, title: 'New thing', url: 'https://gh/i/9' },
    })
    expect(vars.issueNumber).toBe('9')
    expect(vars.issueTitle).toBe('New thing')
    expect(vars.sessionName).toBe('')
  })

  it('strips trailing slashes when deriving the folder name', () => {
    expect(buildTemplateVars({ directory: '/repos/broomy/wt/fix-login/' }).folderName).toBe('fix-login')
    expect(buildTemplateVars({ directory: 'bare' }).folderName).toBe('bare')
  })

  it('falls back through branchBaseName, prBaseBranch, and the repo default for main', () => {
    expect(buildTemplateVars({ directory: '', branchBaseName: 'develop' }).main).toBe('develop')
    expect(buildTemplateVars({ directory: '', session: { prBaseBranch: 'release' } as Session }).main).toBe('release')
    expect(buildTemplateVars({ directory: '', repo: { ...repo, defaultBranch: 'trunk' } }).main).toBe('trunk')
    expect(buildTemplateVars({ directory: '' }).main).toBe('main')
  })
})

describe('buildTemplateEnv', () => {
  it('maps every variable to its BROOMY_ name for the command surface', () => {
    const env = buildTemplateEnv({ session, repo, directory: session.directory }, 'command')
    expect(env.BROOMY_BRANCH).toBe('fix/login')
    expect(env.BROOMY_PR_NUMBER).toBe('42')
    expect(Object.keys(env)).toHaveLength(TEMPLATE_VARS.length)
  })

  it('omits variables unavailable at the init surface', () => {
    const env = buildTemplateEnv({ session, repo, directory: session.directory }, 'init')
    expect(env.BROOMY_PR_NUMBER).toBeUndefined()
    expect(env.BROOMY_PR_TITLE).toBeUndefined()
    expect(env.BROOMY_PR_URL).toBeUndefined()
    expect(env.BROOMY_SESSION_NAME).toBeUndefined()
    expect(env.BROOMY_STAGE).toBeUndefined()
    expect(env.BROOMY_BRANCH).toBe('fix/login')
    expect(env.BROOMY_ISSUE_TITLE).toBe('Login broken')
  })

  it('exports empty strings rather than omitting keys with no value', () => {
    const env = buildTemplateEnv({ directory: '/x' }, 'agent')
    expect(env.BROOMY_PR_NUMBER).toBe('')
  })
})

describe('robustness', () => {
  it('does not throw when directory is absent', () => {
    const vars = buildTemplateVars({} as never)
    expect(vars.directory).toBe('')
    expect(vars.folderName).toBe('')
  })
})
