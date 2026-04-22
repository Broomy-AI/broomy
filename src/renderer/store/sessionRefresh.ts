/**
 * Single atomic refresh action for a session's git + PR status.
 *
 * This is the ONLY writer of `branchStatus`, `statusChip`, `hasFeedback`,
 * `checksStatus`, `hasHadCommits`, `lastKnownPrState`, `lastKnownPrNumber`,
 * `lastKnownPrUrl`, and `gitStatus` on a session. It fetches all inputs,
 * computes derived state, and writes everything in one `set()` call so
 * intermediate renders never see partial/inconsistent data.
 *
 * Triggers:
 *  - Session becomes active / polling tick (includePr: false — cheap)
 *  - Refresh button, agent-finished, source-control tab mount (includePr: true)
 */
import type { GitStatusResult } from '../../preload/index'
import type { Session, BranchStatus, PrState } from './sessions'
import { computeBranchStatus, computeStatusChip } from '../features/git/branchStatus'
import { normalizeGitStatus } from '../features/git/gitStatusNormalizer'
import { useRepoStore } from './repos'
import { debouncedSave } from './sessionPersistence'

type StoreGet = () => { sessions: Session[] }
type StoreSet = (partial: { sessions: Session[] }) => void

type RefreshOpts = { includePr?: boolean }

type GitFetchResult = {
  gitStatus: GitStatusResult
  observedBranch: string | undefined
  isOnMain: boolean
  merged: boolean
  hasBranchCommitsFromGit: boolean
}

type PrFetchResult = {
  state: PrState
  number?: number
  url?: string
  hasFeedback: boolean
  checksStatus: 'passed' | 'failed' | 'pending' | 'none'
}

async function fetchGit(directory: string, repoId: string | undefined): Promise<GitFetchResult | null> {
  try {
    const raw = await window.git.status(directory)
    const gitStatus = normalizeGitStatus(raw)
    const observedBranch = gitStatus.current || undefined
    const isOnMain = observedBranch === 'main' || observedBranch === 'master'
    if (isOnMain || !observedBranch) {
      return { gitStatus, observedBranch, isOnMain, merged: false, hasBranchCommitsFromGit: false }
    }
    const repo = useRepoStore.getState().repos.find(r => r.id === repoId)
    const defaultBranch = repo?.defaultBranch || 'main'
    const [merged, hasBranchCommitsFromGit] = await Promise.all([
      window.git.isMergedInto(directory, defaultBranch),
      window.git.hasBranchCommits(directory, defaultBranch),
    ])
    return { gitStatus, observedBranch, isOnMain, merged, hasBranchCommitsFromGit }
  } catch {
    return null
  }
}

async function fetchPr(directory: string): Promise<PrFetchResult | undefined> {
  try {
    const prResult = await window.gh.prStatus(directory)
    if (!prResult) {
      return { state: null, hasFeedback: false, checksStatus: 'none' }
    }
    if (prResult.state !== 'OPEN') {
      return {
        state: prResult.state,
        number: prResult.number,
        url: prResult.url,
        hasFeedback: false,
        checksStatus: 'none',
      }
    }
    const [checks, feedback] = await Promise.all([
      window.gh.prChecksStatus(directory).catch(() => 'none' as const),
      window.gh.prFeedbackStatus(directory, prResult.number).catch(() => false),
    ])
    return {
      state: prResult.state,
      number: prResult.number,
      url: prResult.url,
      hasFeedback: feedback,
      checksStatus: checks,
    }
  } catch {
    return undefined
  }
}

type DerivedFields = {
  branch: string
  gitStatus: GitStatusResult
  branchStatus: BranchStatus
  statusChip: ReturnType<typeof computeStatusChip>
  hasHadCommits: boolean
  lastKnownPrState: PrState | undefined
  lastKnownPrNumber: number | undefined
  lastKnownPrUrl: string | undefined
  hasFeedback: boolean
  checksStatus: 'passed' | 'failed' | 'pending' | 'none'
}

function deriveFields(current: Session, git: GitFetchResult, pr: PrFetchResult | undefined): DerivedFields {
  // Apply branch switch first — a branch change clears PR/commit state.
  let branch = current.branch
  let hasHadCommits = current.hasHadCommits ?? false
  let lastKnownPrState = current.lastKnownPrState
  let lastKnownPrNumber = current.lastKnownPrNumber
  let lastKnownPrUrl = current.lastKnownPrUrl
  let hasFeedback = current.hasFeedback
  let checksStatus = current.checksStatus

  if (git.observedBranch && git.observedBranch !== current.branch) {
    branch = git.observedBranch
    hasHadCommits = false
    lastKnownPrState = undefined
    lastKnownPrNumber = undefined
    lastKnownPrUrl = undefined
    hasFeedback = false
    checksStatus = 'none'
  }

  if (pr) {
    lastKnownPrState = pr.state
    if (pr.state === null) {
      lastKnownPrNumber = undefined
      lastKnownPrUrl = undefined
    } else {
      lastKnownPrNumber = pr.number ?? lastKnownPrNumber
      lastKnownPrUrl = pr.url ?? lastKnownPrUrl
    }
    hasFeedback = pr.hasFeedback
    checksStatus = pr.checksStatus
  }

  if (git.gitStatus.ahead > 0 || git.hasBranchCommitsFromGit) {
    hasHadCommits = true
  }

  // New work on a previously merged/closed branch → reset PR lifecycle.
  // Also reset hasHadCommits so the git-native merge check doesn't re-assert 'merged'.
  if (
    (lastKnownPrState === 'MERGED' || lastKnownPrState === 'CLOSED') &&
    (git.gitStatus.ahead > 0 || git.gitStatus.files.length > 0)
  ) {
    lastKnownPrState = undefined
    lastKnownPrNumber = undefined
    lastKnownPrUrl = undefined
    hasHadCommits = false
  }

  const branchStatus = computeBranchStatus({
    uncommittedFiles: git.gitStatus.files.length,
    ahead: git.gitStatus.ahead,
    hasTrackingBranch: !!git.gitStatus.tracking,
    isOnMainBranch: git.isOnMain,
    isMergedToMain: git.merged,
    hasHadCommits,
    lastKnownPrState,
  })
  const statusChip = computeStatusChip(branchStatus, hasFeedback, checksStatus)

  return {
    branch,
    gitStatus: git.gitStatus,
    branchStatus,
    statusChip,
    hasHadCommits,
    lastKnownPrState,
    lastKnownPrNumber,
    lastKnownPrUrl,
    hasFeedback,
    checksStatus,
  }
}

export function createRefreshAction(get: StoreGet, set: StoreSet) {
  return {
    refreshSession: async (sessionId: string, opts: RefreshOpts = {}) => {
      const initial = get().sessions.find(s => s.id === sessionId)
      if (!initial || initial.status === 'initializing') return

      const git = await fetchGit(initial.directory, initial.repoId)
      if (!git) return

      const pr = opts.includePr ? await fetchPr(initial.directory) : undefined

      const { sessions } = get()
      const current = sessions.find(s => s.id === sessionId)
      if (!current) return

      const derived = deriveFields(current, git, pr)
      set({
        sessions: sessions.map(s => s.id === sessionId ? { ...s, ...derived } : s),
      })
      debouncedSave()
    },
  }
}
