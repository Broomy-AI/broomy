import { describe, it, expect } from 'vitest'
import { buildCreatePrPrompt } from './prPromptBuilder'

describe('buildCreatePrPrompt', () => {
  it('includes the base branch in diff commands', () => {
    const prompt = buildCreatePrPrompt('main')
    expect(prompt).toContain('git diff origin/main...HEAD')
    expect(prompt).toContain('git log origin/main..HEAD --oneline')
  })

  it('uses custom base branch', () => {
    const prompt = buildCreatePrPrompt('develop')
    expect(prompt).toContain('git diff origin/develop...HEAD')
    expect(prompt).toContain('git log origin/develop..HEAD --oneline')
  })

  it('includes PR template check paths', () => {
    const prompt = buildCreatePrPrompt('main')
    expect(prompt).toContain('.github/PULL_REQUEST_TEMPLATE.md')
    expect(prompt).toContain('.github/pull_request_template.md')
    expect(prompt).toContain('docs/pull_request_template.md')
  })

  it('includes default PR body sections', () => {
    const prompt = buildCreatePrPrompt('main')
    expect(prompt).toContain('Background and Motivation')
    expect(prompt).toContain('Design Decisions')
    expect(prompt).toContain('Proposed Changes')
    expect(prompt).toContain('Testing')
  })

  it('instructs agent to write pr-result.json', () => {
    const prompt = buildCreatePrPrompt('main')
    expect(prompt).toContain('.broomy/pr-result.json')
  })

  it('instructs agent to use gh pr create', () => {
    const prompt = buildCreatePrPrompt('main')
    expect(prompt).toContain('gh pr create')
  })
})
