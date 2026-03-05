import { describe, it, expect } from 'vitest'
import { skillCommandPath, SKILL_ACTIONS } from './skillActions'

describe('skillCommandPath', () => {
  it('returns the correct path for a given action', () => {
    expect(skillCommandPath('/repo', 'commit')).toBe('/repo/.claude/commands/broomy-action-commit.md')
  })

  it('handles different action names', () => {
    expect(skillCommandPath('/my/repo', 'push-to-main')).toBe('/my/repo/.claude/commands/broomy-action-push-to-main.md')
    expect(skillCommandPath('/my/repo', 'create-pr')).toBe('/my/repo/.claude/commands/broomy-action-create-pr.md')
    expect(skillCommandPath('/my/repo', 'resolve-conflicts')).toBe('/my/repo/.claude/commands/broomy-action-resolve-conflicts.md')
    expect(skillCommandPath('/my/repo', 'review')).toBe('/my/repo/.claude/commands/broomy-action-review.md')
    expect(skillCommandPath('/my/repo', 'plan-issue')).toBe('/my/repo/.claude/commands/broomy-action-plan-issue.md')
  })
})

describe('SKILL_ACTIONS', () => {
  it('has 7 actions', () => {
    expect(SKILL_ACTIONS).toHaveLength(7)
  })

  it('each action has name, label, and defaultContent', () => {
    for (const action of SKILL_ACTIONS) {
      expect(action.name).toBeTruthy()
      expect(action.label).toBeTruthy()
      expect(action.defaultContent).toBeTruthy()
    }
  })

  it('includes all expected action names', () => {
    const names = SKILL_ACTIONS.map(a => a.name)
    expect(names).toEqual(['commit', 'push-to-main', 'create-pr', 'resolve-conflicts', 'review', 'review-md', 'plan-issue'])
  })
})
