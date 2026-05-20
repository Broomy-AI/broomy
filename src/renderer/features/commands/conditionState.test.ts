import { describe, it, expect } from 'vitest'
import { computeConditionState, type ConditionStateInput } from './conditionState'
import { evaluateShowWhen } from './commandsConfig'

// merge-pr showWhen conditions (inlined from the legacy defaultCommands.json)
const MERGE_PR_SHOW_WHEN = ['clean', 'open', 'checks-passed', 'has-write-access', 'allow-approve-and-merge', '!review']

function makeInput(overrides: Partial<ConditionStateInput> = {}): ConditionStateInput {
  return {
    gitStatus: [],
    syncStatus: null,
    branchStatus: undefined,
    prState: undefined,
    prNumber: undefined,
    hasWriteAccess: false,
    allowApproveAndMerge: false,
    checksStatus: 'none',
    behindMainCount: 0,
    issueNumber: undefined,
    noDevcontainer: false,
    isReview: false,
    ...overrides,
  }
}

describe('computeConditionState', () => {
  it('sets clean when no git changes', () => {
    const state = computeConditionState(makeInput({ gitStatus: [] }))
    expect(state.clean).toBe(true)
    expect(state['has-changes']).toBe(false)
  })

  it('sets has-changes when git files present', () => {
    const state = computeConditionState(makeInput({
      gitStatus: [{ path: 'a.ts', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' }],
    }))
    expect(state.clean).toBe(false)
    expect(state['has-changes']).toBe(true)
  })

  it('sets open when branchStatus is open', () => {
    const state = computeConditionState(makeInput({ branchStatus: 'open' }))
    expect(state.open).toBe(true)
  })

  it('sets checks-passed when checksStatus is passed', () => {
    const state = computeConditionState(makeInput({ checksStatus: 'passed' }))
    expect(state['checks-passed']).toBe(true)
  })

  it('sets checks-passed when checksStatus is none (no CI)', () => {
    const state = computeConditionState(makeInput({ checksStatus: 'none' }))
    expect(state['checks-passed']).toBe(true)
  })

  it('does not set checks-passed when checksStatus is pending', () => {
    const state = computeConditionState(makeInput({ checksStatus: 'pending' }))
    expect(state['checks-passed']).toBe(false)
  })

  it('does not set checks-passed when checksStatus is failed', () => {
    const state = computeConditionState(makeInput({ checksStatus: 'failed' }))
    expect(state['checks-passed']).toBe(false)
  })

  it('sets allow-approve-and-merge from input', () => {
    expect(computeConditionState(makeInput({ allowApproveAndMerge: true }))['allow-approve-and-merge']).toBe(true)
    expect(computeConditionState(makeInput({ allowApproveAndMerge: false }))['allow-approve-and-merge']).toBe(false)
  })

  it('sets no-pr when prNumber is missing', () => {
    expect(computeConditionState(makeInput({ prNumber: undefined }))['no-pr']).toBe(true)
  })

  it('sets no-pr when prState is MERGED even with prNumber', () => {
    expect(computeConditionState(makeInput({ prNumber: 42, prState: 'MERGED' }))['no-pr']).toBe(true)
  })

  it('clears no-pr when prNumber present and state is OPEN', () => {
    expect(computeConditionState(makeInput({ prNumber: 42, prState: 'OPEN' }))['no-pr']).toBe(false)
  })
})

describe('merge-pr action visibility', () => {
  it('merge-pr is visible when PR is open, clean, checks passed, write access, and merge allowed', () => {
    const state = computeConditionState(makeInput({
      gitStatus: [],
      branchStatus: 'open',
      checksStatus: 'passed',
      hasWriteAccess: true,
      allowApproveAndMerge: true,
      isReview: false,
    }))
    expect(evaluateShowWhen(MERGE_PR_SHOW_WHEN, state)).toBe(true)
  })

  it('merge-pr is visible when PR is open and no CI checks exist', () => {
    const state = computeConditionState(makeInput({
      gitStatus: [],
      branchStatus: 'open',
      checksStatus: 'none',
      hasWriteAccess: true,
      allowApproveAndMerge: true,
      isReview: false,
    }))
    expect(evaluateShowWhen(MERGE_PR_SHOW_WHEN, state)).toBe(true)
  })

  it('merge-pr is hidden when checks are pending', () => {
    const state = computeConditionState(makeInput({
      gitStatus: [],
      branchStatus: 'open',
      checksStatus: 'pending',
      hasWriteAccess: true,
      allowApproveAndMerge: true,
    }))
    expect(evaluateShowWhen(MERGE_PR_SHOW_WHEN, state)).toBe(false)
  })

  it('merge-pr is hidden when checks failed', () => {
    const state = computeConditionState(makeInput({
      gitStatus: [],
      branchStatus: 'open',
      checksStatus: 'failed',
      hasWriteAccess: true,
      allowApproveAndMerge: true,
    }))
    expect(evaluateShowWhen(MERGE_PR_SHOW_WHEN, state)).toBe(false)
  })

  it('merge-pr is hidden when branch is not open', () => {
    const state = computeConditionState(makeInput({
      gitStatus: [],
      branchStatus: 'pushed',
      checksStatus: 'passed',
      hasWriteAccess: true,
      allowApproveAndMerge: true,
    }))
    expect(evaluateShowWhen(MERGE_PR_SHOW_WHEN, state)).toBe(false)
  })

  it('merge-pr is hidden when there are uncommitted changes', () => {
    const state = computeConditionState(makeInput({
      gitStatus: [{ path: 'a.ts', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' }],
      branchStatus: 'open',
      checksStatus: 'passed',
      hasWriteAccess: true,
      allowApproveAndMerge: true,
    }))
    expect(evaluateShowWhen(MERGE_PR_SHOW_WHEN, state)).toBe(false)
  })

  it('merge-pr is hidden when user has no write access', () => {
    const state = computeConditionState(makeInput({
      gitStatus: [],
      branchStatus: 'open',
      checksStatus: 'passed',
      hasWriteAccess: false,
      allowApproveAndMerge: true,
    }))
    expect(evaluateShowWhen(MERGE_PR_SHOW_WHEN, state)).toBe(false)
  })

  it('merge-pr is hidden when allowApproveAndMerge is false', () => {
    const state = computeConditionState(makeInput({
      gitStatus: [],
      branchStatus: 'open',
      checksStatus: 'passed',
      hasWriteAccess: true,
      allowApproveAndMerge: false,
    }))
    expect(evaluateShowWhen(MERGE_PR_SHOW_WHEN, state)).toBe(false)
  })

  it('merge-pr is hidden when in review mode', () => {
    const state = computeConditionState(makeInput({
      gitStatus: [],
      branchStatus: 'open',
      checksStatus: 'passed',
      hasWriteAccess: true,
      allowApproveAndMerge: true,
      isReview: true,
    }))
    expect(evaluateShowWhen(MERGE_PR_SHOW_WHEN, state)).toBe(false)
  })
})
