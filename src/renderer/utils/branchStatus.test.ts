import { describe, it, expect } from 'vitest'
import { computeBranchStatus, type BranchStatusInput } from './branchStatus'

function makeInput(overrides: Partial<BranchStatusInput> = {}): BranchStatusInput {
  return {
    uncommittedFiles: 0,
    ahead: 0,
    hasTrackingBranch: false,
    isOnMainBranch: false,
    isMergedToMain: false,
    lastKnownPrState: undefined,
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

  it('returns merged when isMergedToMain is true', () => {
    expect(computeBranchStatus(makeInput({
      isMergedToMain: true,
    }))).toBe('merged')
  })

  it('returns merged when isMergedToMain is true with tracking branch', () => {
    expect(computeBranchStatus(makeInput({
      isMergedToMain: true,
      hasTrackingBranch: true,
    }))).toBe('merged')
  })

  it('prioritizes isMergedToMain over PR state OPEN', () => {
    expect(computeBranchStatus(makeInput({
      isMergedToMain: true,
      lastKnownPrState: 'OPEN',
      hasTrackingBranch: true,
    }))).toBe('merged')
  })

  it('returns in-progress when isMergedToMain but has uncommitted files', () => {
    expect(computeBranchStatus(makeInput({
      isMergedToMain: true,
      uncommittedFiles: 1,
    }))).toBe('in-progress')
  })

  it('returns in-progress when isMergedToMain but has commits ahead', () => {
    expect(computeBranchStatus(makeInput({
      isMergedToMain: true,
      ahead: 1,
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

  it('uncommitted files override everything except main branch', () => {
    expect(computeBranchStatus(makeInput({
      uncommittedFiles: 1,
      isMergedToMain: true,
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
