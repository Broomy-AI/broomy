import { describe, it, expect } from 'vitest'
import { buildReviewPrompt } from './reviewPromptBuilder'
import type { Session } from '../store/sessions'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: '1',
    name: 'test-session',
    directory: '/tmp/test',
    status: 'idle',
    isUnread: false,
    panelVisibility: {},
    layoutSizes: {
      explorerWidth: 250,
      fileViewerSize: 400,
      userTerminalHeight: 200,
      diffPanelWidth: 400,
    },
    ...overrides,
  } as Session
}

describe('buildReviewPrompt', () => {
  it('generates a basic review prompt with no previous review', () => {
    const session = makeSession({ prNumber: 42, prTitle: 'Add feature' })
    const result = buildReviewPrompt(session, '', [], undefined)

    expect(result).toContain('PR Review Analysis')
    expect(result).toContain('"prNumber": 42')
    expect(result).toContain('"prTitle": "Add feature"')
    expect(result).toContain('git diff origin/main...HEAD')
    expect(result).toContain('.broomy/review.json')
    expect(result).not.toContain('changesSinceLastReview')
  })

  it('uses custom base branch from session', () => {
    const session = makeSession({ prBaseBranch: 'develop' })
    const result = buildReviewPrompt(session, '', [], undefined)

    expect(result).toContain('git diff origin/develop...HEAD')
  })

  it('defaults to main when no prBaseBranch', () => {
    const session = makeSession()
    const result = buildReviewPrompt(session, '', [], undefined)

    expect(result).toContain('git diff origin/main...HEAD')
  })

  it('handles null prNumber and prTitle', () => {
    const session = makeSession()
    const result = buildReviewPrompt(session, '', [], undefined)

    expect(result).toContain('"prNumber": null')
    expect(result).toContain('"prTitle": null')
  })

  it('includes previous requested changes when provided', () => {
    const session = makeSession()
    const changes = [
      { id: '1', description: 'Fix the bug', file: 'src/app.ts', line: 42 },
      { id: '2', description: 'Add tests' },
    ]
    const result = buildReviewPrompt(session, '', changes, { previousHeadCommit: 'abc123' })

    expect(result).toContain('Previous Review Changes')
    expect(result).toContain('1. Fix the bug (src/app.ts:42)')
    expect(result).toContain('2. Add tests')
    expect(result).toContain('comparison.json')
    expect(result).toContain('changesSinceLastReview')
  })

  it('includes changes since last review section with previous commit', () => {
    const session = makeSession()
    const result = buildReviewPrompt(session, '', [], { previousHeadCommit: 'abc123' })

    expect(result).toContain('Changes Since Last Review')
    expect(result).toContain('commit `abc123`')
    expect(result).toContain('git log abc123..HEAD')
    expect(result).toContain('git diff abc123..HEAD --stat')
  })

  it('includes PR comments when provided for re-review', () => {
    const session = makeSession()
    const comments = [
      { body: 'Please fix this', path: 'src/app.ts', line: 10, author: 'reviewer' },
    ]
    const result = buildReviewPrompt(session, '', [], { previousHeadCommit: 'abc123', prComments: comments })

    expect(result).toContain('Reviewer Comments on This PR')
    expect(result).toContain('reviewer: "Please fix this" (src/app.ts:10)')
  })

  it('includes review instructions when provided', () => {
    const session = makeSession()
    const result = buildReviewPrompt(session, 'Focus on security', [], undefined)

    expect(result).toContain('Additional Review Focus')
    expect(result).toContain('Focus on security')
  })

  it('always ends with action section', () => {
    const session = makeSession()
    const result = buildReviewPrompt(session, '', [], undefined)

    expect(result).toContain('## Action')
    expect(result).toContain('analyze the PR now')
  })

  it('handles requested changes with file but no line', () => {
    const session = makeSession()
    const changes = [{ id: '1', description: 'Update types', file: 'src/types.ts' }]
    const result = buildReviewPrompt(session, '', changes, { previousHeadCommit: 'abc123' })

    expect(result).toContain('1. Update types (src/types.ts)')
  })

  it('includes changesSinceLastReview schema when hasPreviousReview is true', () => {
    const session = makeSession()
    // hasPreviousReview is true when previousHeadCommit is set
    const result = buildReviewPrompt(session, '', [], { previousHeadCommit: 'abc123' })

    expect(result).toContain('changesSinceLastReview')
    expect(result).toContain('responsesToComments')
    expect(result).toContain('otherNotableChanges')
  })
})
