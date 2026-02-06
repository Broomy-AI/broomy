import { describe, it, expect } from 'vitest'
import { computeBranchStatus, type BranchStatusInput } from './branchStatus'

function makeInput(overrides: Partial<BranchStatusInput> = {}): BranchStatusInput {
  return {
    uncommittedFiles: 0,
    ahead: 0,
    hasTrackingBranch: false,
    isOnMainBranch: false,
    currentHeadCommit: 'abc123',
    lastKnownPrState: undefined,
    pushedToMainCommit: undefined,
    ...overrides,
  }
}

describe('computeBranchStatus', () => {
  it('returns in-progress when on main branch', () => {
    expect(computeBranchStatus(makeInput({ isOnMainBranch: true }))).toBe('in-progress')
  })

  it('returns in-progress when on main even with PR state', () => {
    expect(computeBranchStatus(makeInput({
      isOnMainBranch: true,
      lastKnownPrState: 'MERGED',
    }))).toBe('in-progress')
  })

  it('returns in-progress when there are uncommitted files', () => {
    expect(computeBranchStatus(makeInput({
      uncommittedFiles: 3,
      hasTrackingBranch: true,
      lastKnownPrState: 'OPEN',
    }))).toBe('in-progress')
  })

  it('returns in-progress when there are commits ahead', () => {
    expect(computeBranchStatus(makeInput({
      ahead: 2,
      hasTrackingBranch: true,
      lastKnownPrState: 'OPEN',
    }))).toBe('in-progress')
  })

  it('returns in-progress with both uncommitted and ahead', () => {
    expect(computeBranchStatus(makeInput({
      uncommittedFiles: 1,
      ahead: 1,
    }))).toBe('in-progress')
  })

  it('returns merged when pushedToMainCommit matches currentHeadCommit', () => {
    expect(computeBranchStatus(makeInput({
      pushedToMainCommit: 'abc123',
      currentHeadCommit: 'abc123',
    }))).toBe('merged')
  })

  it('returns in-progress when pushedToMainCommit does not match (new changes)', () => {
    // With no tracking branch and no PR state, falls through to default
    expect(computeBranchStatus(makeInput({
      pushedToMainCommit: 'abc123',
      currentHeadCommit: 'def456',
    }))).toBe('in-progress')
  })

  it('returns merged when lastKnownPrState is MERGED', () => {
    expect(computeBranchStatus(makeInput({
      lastKnownPrState: 'MERGED',
      hasTrackingBranch: true,
    }))).toBe('merged')
  })

  it('returns closed when lastKnownPrState is CLOSED', () => {
    expect(computeBranchStatus(makeInput({
      lastKnownPrState: 'CLOSED',
      hasTrackingBranch: true,
    }))).toBe('closed')
  })

  it('returns open when lastKnownPrState is OPEN', () => {
    expect(computeBranchStatus(makeInput({
      lastKnownPrState: 'OPEN',
      hasTrackingBranch: true,
    }))).toBe('open')
  })

  it('returns pushed when has tracking branch but no PR', () => {
    expect(computeBranchStatus(makeInput({
      hasTrackingBranch: true,
      lastKnownPrState: undefined,
    }))).toBe('pushed')
  })

  it('returns pushed when lastKnownPrState is null (no PR)', () => {
    expect(computeBranchStatus(makeInput({
      hasTrackingBranch: true,
      lastKnownPrState: null,
    }))).toBe('pushed')
  })

  it('returns in-progress as default (no tracking, no PR)', () => {
    expect(computeBranchStatus(makeInput())).toBe('in-progress')
  })

  it('prioritizes pushedToMainCommit match over PR state', () => {
    expect(computeBranchStatus(makeInput({
      pushedToMainCommit: 'abc123',
      currentHeadCommit: 'abc123',
      lastKnownPrState: 'OPEN',
    }))).toBe('merged')
  })

  it('ignores pushedToMainCommit when currentHeadCommit is null', () => {
    expect(computeBranchStatus(makeInput({
      pushedToMainCommit: 'abc123',
      currentHeadCommit: null,
      hasTrackingBranch: true,
    }))).toBe('pushed')
  })

  it('uncommitted files override everything except main branch', () => {
    expect(computeBranchStatus(makeInput({
      uncommittedFiles: 1,
      pushedToMainCommit: 'abc123',
      currentHeadCommit: 'abc123',
      lastKnownPrState: 'MERGED',
      hasTrackingBranch: true,
    }))).toBe('in-progress')
  })

  it('ahead commits override PR state', () => {
    expect(computeBranchStatus(makeInput({
      ahead: 1,
      lastKnownPrState: 'OPEN',
      hasTrackingBranch: true,
    }))).toBe('in-progress')
  })
})
