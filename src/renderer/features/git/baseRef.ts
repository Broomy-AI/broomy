/**
 * Resolves the ref that a brand-new session branch should be created from.
 *
 * New branches are based on `origin/<defaultBranch>` rather than the local
 * `<defaultBranch>` ref, because the local ref is only current when the main
 * worktree happens to have the default branch checked out *and* the pull
 * succeeded. Neither is guaranteed: a dirty or diverged main worktree makes
 * `git pull` abort the merge (it still updates the remote-tracking ref), and
 * nothing pins the folder named `main/` to a branch actually called `main`.
 * Basing on the remote-tracking ref removes both assumptions.
 *
 * The default branch is also re-resolved from git instead of trusting the
 * value stored in config, which is captured once when the repo is added and
 * goes stale if the repo later renames its default branch.
 */

/** Returns the ref to pass as the worktree base, e.g. `origin/master`. */
export async function resolveBaseRef(mainDir: string, storedDefaultBranch: string): Promise<string> {
  let defaultBranch = storedDefaultBranch
  try {
    const resolved = await window.git.defaultBranch(mainDir)
    if (resolved) defaultBranch = resolved
  } catch {
    // Fall back to the stored value.
  }

  const fetchResult = await window.git.fetchBranch(mainDir, defaultBranch)
  if (!fetchResult.success) {
    throw new Error(
      `Couldn't fetch the latest "${defaultBranch}" from origin, so the new branch would be based on stale code.\n\n${fetchResult.error || ''}`.trim()
    )
  }

  return `origin/${defaultBranch}`
}
