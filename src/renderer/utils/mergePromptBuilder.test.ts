import { describe, it, expect } from 'vitest'
import { buildMergePrompt } from './mergePromptBuilder'

describe('buildMergePrompt', () => {
  it('includes the base branch name in the prompt', () => {
    const prompt = buildMergePrompt('main')
    expect(prompt).toContain('merging `main` into the current branch')
  })

  it('references the base branch in the assessment section', () => {
    const prompt = buildMergePrompt('develop')
    expect(prompt).toContain('What develop intended')
  })

  it('includes all five required steps', () => {
    const prompt = buildMergePrompt('main')
    expect(prompt).toContain('## Step 1: Understand the Conflict')
    expect(prompt).toContain('## Step 2: Assess Each Conflict')
    expect(prompt).toContain('## Step 3: Handle Uncertainty')
    expect(prompt).toContain('## Step 4: Resolve Conflicts')
    expect(prompt).toContain('## Step 5: Verify')
  })

  it('instructs the agent to check git status', () => {
    const prompt = buildMergePrompt('main')
    expect(prompt).toContain('git status')
  })

  it('instructs the agent to examine conflict markers', () => {
    const prompt = buildMergePrompt('main')
    expect(prompt).toContain('<<<<<<<')
    expect(prompt).toContain('=======')
    expect(prompt).toContain('>>>>>>>')
  })

  it('instructs the agent to ask rather than guess on ambiguous conflicts', () => {
    const prompt = buildMergePrompt('main')
    expect(prompt).toContain('do NOT guess')
    expect(prompt).toContain('ask the user directly')
  })

  it('instructs verification with lint/typecheck/tests', () => {
    const prompt = buildMergePrompt('main')
    expect(prompt).toContain('lint/typecheck/test')
  })

  it('instructs committing with --no-edit', () => {
    const prompt = buildMergePrompt('main')
    expect(prompt).toContain('git commit --no-edit')
  })

  it('warns against silently discarding changes', () => {
    const prompt = buildMergePrompt('main')
    expect(prompt).toContain('Never silently discard changes')
  })

  it('works with branch names containing special characters', () => {
    const prompt = buildMergePrompt('feature/my-branch')
    expect(prompt).toContain('merging `feature/my-branch` into the current branch')
    expect(prompt).toContain('What feature/my-branch intended')
  })
})
