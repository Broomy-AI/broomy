import { describe, it, expect } from 'vitest'
import '../../test/setup'
import { computeBranchStatus } from '../features/git/branchStatus'
import type { BranchStatusInput } from '../features/git/branchStatus'

function makeInput(overrides: Partial<BranchStatusInput> = {}): BranchStatusInput {
  return {
    uncommittedFiles: 0,
    ahead: 0,
    hasTrackingBranch: false,
    isOnMainBranch: false,
    isMergedToMain: false,
    hasHadCommits: false,
    lastKnownPrState: undefined,
    ...overrides,
  }
}

describe('Git branch status integration', () => {
  it('uncommitted files → in-progress', () => {
    expect(computeBranchStatus(makeInput({ uncommittedFiles: 3 }))).toBe('in-progress')
  })

  it('commits ahead of remote → in-progress', () => {
    expect(computeBranchStatus(makeInput({ ahead: 2 }))).toBe('in-progress')
  })

  it('on main branch → always in-progress', () => {
    expect(computeBranchStatus(makeInput({
      isOnMainBranch: true,
      hasTrackingBranch: true,
      lastKnownPrState: 'MERGED',
    }))).toBe('in-progress')
  })

  it('has tracking branch, no PR, no changes → pushed', () => {
    expect(computeBranchStatus(makeInput({ hasTrackingBranch: true }))).toBe('pushed')
  })

  it('PR state OPEN → open', () => {
    expect(computeBranchStatus(makeInput({
      hasTrackingBranch: true,
      lastKnownPrState: 'OPEN',
    }))).toBe('open')
  })

  it('PR state MERGED → merged', () => {
    expect(computeBranchStatus(makeInput({
      hasTrackingBranch: true,
      lastKnownPrState: 'MERGED',
    }))).toBe('merged')
  })

  it('PR state CLOSED → closed', () => {
    expect(computeBranchStatus(makeInput({
      hasTrackingBranch: true,
      lastKnownPrState: 'CLOSED',
    }))).toBe('closed')
  })

  it('git-native merge detection overrides no-PR state', () => {
    expect(computeBranchStatus(makeInput({
      hasTrackingBranch: true,
      isMergedToMain: true,
      hasHadCommits: true,
    }))).toBe('merged')
  })

  it('isMergedToMain without hasHadCommits reports empty (fresh branch)', () => {
    expect(computeBranchStatus(makeInput({
      hasTrackingBranch: true,
      isMergedToMain: true,
      hasHadCommits: false,
    }))).toBe('empty')
  })

  it('no tracking branch, no changes → in-progress', () => {
    expect(computeBranchStatus(makeInput())).toBe('in-progress')
  })

  it('open PR wins over local in-progress changes', () => {
    // Users want to see the PR badge while iterating locally — the PR is the
    // shared artifact they care about, not the private in-progress state.
    expect(computeBranchStatus(makeInput({
      uncommittedFiles: 1,
      hasTrackingBranch: true,
      lastKnownPrState: 'OPEN',
    }))).toBe('open')
  })

  // ── Lifecycle sequence tests ──────────────────────────────────────────

  describe('lifecycle: full happy path (empty → in-progress → pushed → open → merged)', () => {
    it('walks through the complete branch lifecycle', () => {
      // 1. Branch just created and pushed to remote, no work done yet
      //    isMergedToMain=true because 0 commits ahead of main
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        isMergedToMain: true,
      }))).toBe('empty')

      // 2. Agent starts making changes (uncommitted files)
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        uncommittedFiles: 3,
      }))).toBe('in-progress')

      // 3. Changes committed but not yet pushed (ahead > 0)
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        ahead: 2,
        hasHadCommits: true,
        isMergedToMain: false,
      }))).toBe('in-progress')

      // 4. Pushed to remote, no PR yet
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        hasHadCommits: true,
        isMergedToMain: false,
      }))).toBe('pushed')

      // 5. PR created
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        hasHadCommits: true,
        lastKnownPrState: 'OPEN',
      }))).toBe('open')

      // 6. PR merged — detected via PR state
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        hasHadCommits: true,
        lastKnownPrState: 'MERGED',
      }))).toBe('merged')
    })
  })

  describe('lifecycle: squash merge without PR', () => {
    it('empty → in-progress → pushed → merged (via git-native detection)', () => {
      // 1. Fresh branch
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        isMergedToMain: true,
      }))).toBe('empty')

      // 2. Work in progress
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        uncommittedFiles: 1,
      }))).toBe('in-progress')

      // 3. Pushed
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        hasHadCommits: true,
        isMergedToMain: false,
      }))).toBe('pushed')

      // 4. Squash-merged into main (no PR). isMergedInto detects content match.
      //    hasHadCommits is still true from session state.
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        hasHadCommits: true,
        isMergedToMain: true,
      }))).toBe('merged')
    })
  })

  describe('lifecycle: PR closed without merging', () => {
    it('pushed → open → closed', () => {
      const base = { hasTrackingBranch: true, hasHadCommits: true } as const

      expect(computeBranchStatus(makeInput(base))).toBe('pushed')
      expect(computeBranchStatus(makeInput({ ...base, lastKnownPrState: 'OPEN' }))).toBe('open')
      expect(computeBranchStatus(makeInput({ ...base, lastKnownPrState: 'CLOSED' }))).toBe('closed')
    })
  })

  describe('lifecycle: resume work after merge', () => {
    it('merged → in-progress when new commits are made', () => {
      // Branch was merged
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        hasHadCommits: true,
        isMergedToMain: true,
      }))).toBe('merged')

      // User makes new changes on the merged branch
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        hasHadCommits: true,
        isMergedToMain: true,
        uncommittedFiles: 2,
      }))).toBe('in-progress')

      // User commits and pushes — now ahead of remote again
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        hasHadCommits: true,
        isMergedToMain: false,
        ahead: 1,
      }))).toBe('in-progress')
    })
  })

  describe('lifecycle: resume work after PR closed', () => {
    it('closed → in-progress when new commits are made', () => {
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        hasHadCommits: true,
        lastKnownPrState: 'CLOSED',
      }))).toBe('closed')

      // New work overrides the closed state
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        hasHadCommits: true,
        lastKnownPrState: 'CLOSED',
        uncommittedFiles: 1,
      }))).toBe('in-progress')
    })
  })

  describe('lifecycle: fresh branch gets first commit', () => {
    it('empty → in-progress', () => {
      // Fresh branch pushed to remote
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        isMergedToMain: true,
      }))).toBe('empty')

      // First uncommitted change
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        isMergedToMain: true,
        uncommittedFiles: 1,
      }))).toBe('in-progress')
    })
  })

  describe('lifecycle: local-only branch (no remote tracking)', () => {
    it('stays in-progress until pushed', () => {
      // Local branch, no tracking
      expect(computeBranchStatus(makeInput())).toBe('in-progress')

      // With uncommitted changes
      expect(computeBranchStatus(makeInput({
        uncommittedFiles: 1,
      }))).toBe('in-progress')

      // With commits but no tracking
      expect(computeBranchStatus(makeInput({
        hasHadCommits: true,
        ahead: 1,
      }))).toBe('in-progress')

      // After push establishes tracking — becomes pushed
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        hasHadCommits: true,
        isMergedToMain: false,
      }))).toBe('pushed')
    })
  })

  describe('lifecycle: merged branch after fetch (git state matches fresh)', () => {
    it('hasHadCommits distinguishes merged from empty after fetch', () => {
      // After merge + fetch, git sees 0 commits ahead (merge-base = HEAD).
      // Without hasHadCommits, this looks identical to a fresh branch.
      // hasHadCommits=true (sticky session state) is what makes this "merged".
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        isMergedToMain: true,
        hasHadCommits: true,
      }))).toBe('merged')

      // Same git state but hasHadCommits=false → empty (fresh branch)
      expect(computeBranchStatus(makeInput({
        hasTrackingBranch: true,
        isMergedToMain: true,
        hasHadCommits: false,
      }))).toBe('empty')
    })
  })
})
