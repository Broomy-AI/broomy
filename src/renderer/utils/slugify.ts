/**
 * Converts a GitHub issue into a git branch name.
 *
 * Takes an issue number and title, lowercases the title, strips non-alphanumeric
 * characters, takes the first four words, and joins them with hyphens, prefixed
 * by the issue number (e.g. "42-fix-login-page-bug").
 */
export function issueToBranchName(issue: { number: number; title: string }): string {
  const slug = issue.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('-')
  return `${issue.number}-${slug}`
}
