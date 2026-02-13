/**
 * Git status parsing and GitHub URL helpers.
 *
 * Converts single-character git status codes (M, A, D, R, ?) into readable
 * strings, splits a file entry from `git status` into separate staged and
 * unstaged records when both exist, and builds properly-encoded GitHub PR
 * creation URLs from a repo slug and branch names.
 */

/**
 * Parses git status character codes into human-readable status strings.
 */
export function statusFromChar(c: string): string {
  switch (c) {
    case 'M': return 'modified'
    case 'A': return 'added'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case '?': return 'untracked'
    default: return 'modified'
  }
}

export type GitFileEntry = {
  path: string
  status: string
  staged: boolean
  indexStatus: string
  workingDirStatus: string
}

/**
 * Parses a single git status file entry into one or two GitFileEntry objects.
 * Files that have both staged (index) and unstaged (working dir) changes produce two entries.
 */
export function parseGitStatusFile(file: { path: string; index: string; working_dir: string }): GitFileEntry[] {
  const indexStatus = file.index || ' '
  const workingDirStatus = file.working_dir || ' '
  const hasIndexChange = indexStatus !== ' ' && indexStatus !== '?'
  const hasWorkingDirChange = workingDirStatus !== ' ' && workingDirStatus !== '?'

  const entries: GitFileEntry[] = []

  if (hasIndexChange) {
    entries.push({ path: file.path, status: statusFromChar(indexStatus), staged: true, indexStatus, workingDirStatus })
  }

  if (hasWorkingDirChange || (!hasIndexChange && workingDirStatus === '?')) {
    entries.push({ path: file.path, status: statusFromChar(workingDirStatus), staged: false, indexStatus, workingDirStatus })
  } else if (!hasIndexChange) {
    // Shouldn't happen, but handle gracefully
    entries.push({ path: file.path, status: 'modified', staged: false, indexStatus, workingDirStatus })
  }

  return entries
}

/**
 * Builds a GitHub PR creation URL with properly encoded branch names.
 */
export function buildPrCreateUrl(repoSlug: string, defaultBranch: string, currentBranch: string): string {
  return `https://github.com/${repoSlug}/compare/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(currentBranch)}?expand=1`
}
