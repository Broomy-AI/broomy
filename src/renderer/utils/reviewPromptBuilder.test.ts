import { describe, it, expect } from 'vitest'
import { buildReviewPrompt, buildMarkdownReviewPrompt } from './reviewPromptBuilder'
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
    expect(result).toContain('.broomy/output/review.json')
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

  it('generates re-review prompt when previousHeadCommit is set', () => {
    const session = makeSession()
    const result = buildReviewPrompt(session, '', [], { previousHeadCommit: 'abc123' })

    expect(result).toContain('PR Re-Review')
    expect(result).toContain('commit `abc123`')
    expect(result).toContain('git log abc123..HEAD')
    expect(result).toContain('git diff abc123..HEAD --stat')
    expect(result).toContain('changesSinceLastReview')
    expect(result).toContain('changePatterns')
    expect(result).not.toContain('otherNotableChanges')
    expect(result).not.toContain('comparison.json')
  })

  it('generates re-review prompt when previousRequestedChanges exist', () => {
    const session = makeSession()
    const changes = [
      { id: '1', description: 'Fix the bug', file: 'src/app.ts', line: 42 },
      { id: '2', description: 'Add tests' },
    ]
    const result = buildReviewPrompt(session, '', changes, { previousHeadCommit: 'abc123' })

    expect(result).toContain('PR Re-Review')
    expect(result).toContain('Your Previously Requested Changes')
    expect(result).toContain('1. Fix the bug (src/app.ts:42)')
    expect(result).toContain('2. Add tests')
    expect(result).not.toContain('comparison.json')
  })

  it('filters user comments from other reviewer comments', () => {
    const session = makeSession()
    const comments = [
      { body: 'My comment', path: 'src/app.ts', line: 10, author: 'me' },
      { body: 'Their comment', path: 'src/utils.ts', line: 20, author: 'reviewer' },
    ]
    const result = buildReviewPrompt(session, '', [], {
      previousHeadCommit: 'abc123',
      prComments: comments,
      currentUser: 'me',
    })

    expect(result).toContain('Your PR Comments')
    expect(result).toContain('"My comment" (src/app.ts:10)')
    expect(result).toContain('Other Reviewer Comments')
    expect(result).toContain('reviewer: "Their comment" (src/utils.ts:20)')
  })

  it('shows all comments as other when no currentUser', () => {
    const session = makeSession()
    const comments = [
      { body: 'A comment', path: 'src/app.ts', line: 10, author: 'reviewer' },
    ]
    const result = buildReviewPrompt(session, '', [], {
      previousHeadCommit: 'abc123',
      prComments: comments,
    })

    expect(result).not.toContain('Your PR Comments')
    expect(result).toContain('reviewer: "A comment"')
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

  it('re-review action mentions changes since last review', () => {
    const session = makeSession()
    const result = buildReviewPrompt(session, '', [], { previousHeadCommit: 'abc123' })

    expect(result).toContain('changes since the last review')
  })

  it('handles requested changes with file but no line', () => {
    const session = makeSession()
    const changes = [{ id: '1', description: 'Update types', file: 'src/types.ts' }]
    const result = buildReviewPrompt(session, '', changes, { previousHeadCommit: 'abc123' })

    expect(result).toContain('1. Update types (src/types.ts)')
  })

  it('includes changesSinceLastReview schema with status field in re-review', () => {
    const session = makeSession()
    const result = buildReviewPrompt(session, '', [], { previousHeadCommit: 'abc123' })

    expect(result).toContain('changesSinceLastReview')
    expect(result).toContain('responsesToComments')
    expect(result).toContain('"status": "addressed|not-addressed|partially-addressed"')
    expect(result).toContain('changePatterns')
  })

  it('includes PR description in first-time review', () => {
    const session = makeSession()
    const result = buildReviewPrompt(session, '', [], { prDescription: 'This is the PR' })

    expect(result).toContain('PR Description (by the author)')
    expect(result).toContain('This is the PR')
  })

  it('includes PR description in re-review', () => {
    const session = makeSession()
    const result = buildReviewPrompt(session, '', [], {
      previousHeadCommit: 'abc123',
      prDescription: 'This is the PR',
    })

    expect(result).toContain('PR Description (by the author)')
    expect(result).toContain('This is the PR')
  })

  it('first-time review does not contain re-review sections', () => {
    const session = makeSession()
    const result = buildReviewPrompt(session, '', [], undefined)

    expect(result).not.toContain('PR Re-Review')
    expect(result).not.toContain('Responses to Your Comments')
    expect(result).not.toContain('Changes Since Last Review')
  })
})

describe('buildMarkdownReviewPrompt', () => {
  it('generates a markdown review prompt', () => {
    const session = makeSession()
    const result = buildMarkdownReviewPrompt(session, '', undefined)

    expect(result).toContain('PR Review')
    expect(result).toContain('.broomy/output/review.md')
    expect(result).toContain('## Heading')
    expect(result).toContain('- [ ]')
    expect(result).toContain('- [x]')
    expect(result).toContain('<!-- include:')
  })

  it('uses custom base branch', () => {
    const session = makeSession({ prBaseBranch: 'develop' })
    const result = buildMarkdownReviewPrompt(session, '', undefined)

    expect(result).toContain('git diff origin/develop...HEAD')
  })

  it('includes PR description when provided', () => {
    const session = makeSession()
    const result = buildMarkdownReviewPrompt(session, '', { prDescription: 'This is the PR' })

    expect(result).toContain('PR Description (by the author)')
    expect(result).toContain('This is the PR')
  })

  it('includes review instructions when provided', () => {
    const session = makeSession()
    const result = buildMarkdownReviewPrompt(session, 'Focus on security', undefined)

    expect(result).toContain('Additional Review Focus')
    expect(result).toContain('Focus on security')
  })

  it('includes re-review section when previousHeadCommit is set', () => {
    const session = makeSession()
    const result = buildMarkdownReviewPrompt(session, '', { previousHeadCommit: 'abc123' })

    expect(result).toContain('Changes Since Last Review')
    expect(result).toContain('abc123')
    expect(result).toContain('git diff abc123..HEAD --stat')
  })

  it('does not include re-review section for first review', () => {
    const session = makeSession()
    const result = buildMarkdownReviewPrompt(session, '', undefined)

    expect(result).not.toContain('Changes Since Last Review')
  })

  it('always ends with action section', () => {
    const session = makeSession()
    const result = buildMarkdownReviewPrompt(session, '', undefined)

    expect(result).toContain('## Action')
    expect(result).toContain('.broomy/output/review.md')
  })

  it('instructs to use PR diff URLs when prUrl is available', () => {
    const session = makeSession({ prUrl: 'https://github.com/org/repo/pull/42' })
    const result = buildMarkdownReviewPrompt(session, '', undefined)

    expect(result).toContain('MUST point to the PR diff view')
    expect(result).toContain('https://github.com/org/repo/pull/42/files')
    expect(result).toContain('shasum -a 256')
  })

  it('uses generic diff URL guidance when prUrl is not available', () => {
    const session = makeSession()
    const result = buildMarkdownReviewPrompt(session, '', undefined)

    expect(result).toContain('MUST point to the PR diff view')
    expect(result).toContain('pull/N/files')
  })
})
