/**
 * Shared git utility functions used across handler modules.
 */
import type { SimpleGit } from 'simple-git'

/**
 * Detect the default branch for a repository by checking (in order):
 * 1. The symbolic ref `refs/remotes/origin/HEAD`
 * 2. What origin itself reports HEAD points at (`ls-remote --symref`),
 *    only when `allowRemote` is set
 * 3. Whether `origin/main` exists
 * 4. Whether `origin/master` exists
 * 5. Falls back to 'main'
 *
 * Step 2 matters for repos whose default branch is neither `main` nor
 * `master`: `refs/remotes/origin/HEAD` is not always present (it is only
 * written by clone and by recent git versions on fetch), and without it the
 * name-guessing in steps 3-4 would silently pick an unrelated branch. It hits
 * the network, so callers on the git-polling path leave `allowRemote` off.
 */
export async function getDefaultBranch(git: SimpleGit, allowRemote = false): Promise<string> {
  try {
    const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
    return ref.trim().replace('refs/remotes/origin/', '')
  } catch { /* fall through */ }

  if (allowRemote) {
    try {
      const out = await git.raw(['ls-remote', '--symref', 'origin', 'HEAD'])
      const match = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m.exec(out)
      if (match) return match[1]
    } catch { /* remote unreachable — fall through to name guessing */ }
  }

  for (const candidate of ['main', 'master']) {
    try {
      await git.raw(['rev-parse', '--verify', `origin/${candidate}`])
      return candidate
    } catch { /* try next candidate */ }
  }
  return 'main'
}
