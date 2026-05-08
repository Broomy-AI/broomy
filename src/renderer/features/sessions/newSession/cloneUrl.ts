/**
 * Parse and validate clone URLs entered by the user.
 *
 * Accepts HTTPS, SSH, and `user/repo` shorthand. Rejects GitHub web-UI
 * sub-paths (tree/blob/pulls/etc.) so we don't end up with a "branch" or
 * "issues" folder name. Returns the normalized URL, the derived repo name,
 * and a human-readable error if the input isn't usable.
 */

const GITHUB_WEB_PATHS = new Set([
  'tree', 'blob', 'pulls', 'pull', 'issues', 'issue',
  'wiki', 'actions', 'commits', 'commit', 'branches',
  'tags', 'releases', 'compare', 'projects', 'discussions',
  'security', 'settings',
])

export type ParsedCloneUrl = {
  /** URL ready to pass to `git clone`. Empty when input is empty/invalid. */
  url: string
  /** Folder name to use for the clone destination. */
  repoName: string
  /** Human-readable reason input is unusable, or null when valid. */
  error: string | null
}

export function parseCloneUrl(input: string): ParsedCloneUrl {
  const trimmed = input.trim().replace(/^["']|["']$/g, '')
  if (!trimmed) {
    return { url: '', repoName: '', error: null }
  }

  // user/repo shorthand → assume GitHub
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
    const repoName = trimmed.split('/')[1].replace(/\.git$/, '')
    return {
      url: `https://github.com/${trimmed.replace(/\.git$/, '')}.git`,
      repoName: sanitizeRepoName(repoName),
      error: null,
    }
  }

  // SSH form: git@host:owner/repo(.git)
  const sshMatch = /^[\w.-]+@[\w.-]+:([^/].*?)\/?$/.exec(trimmed)
  if (sshMatch) {
    const path = sshMatch[1].replace(/\.git$/, '')
    const segments = path.split('/').filter(Boolean)
    if (segments.length < 2) {
      return { url: '', repoName: '', error: 'SSH URL is missing the repository path (expected git@host:owner/repo.git).' }
    }
    const repoName = sanitizeRepoName(segments[segments.length - 1])
    if (!repoName) {
      return { url: '', repoName: '', error: 'Could not derive a folder name from this URL.' }
    }
    return { url: trimmed, repoName, error: null }
  }

  // HTTPS / git:// / ssh:// — anything URL-shaped
  if (/^(https?|git|ssh):\/\//.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      return { url: '', repoName: '', error: 'That doesn\'t look like a valid URL.' }
    }

    const segments = parsed.pathname.replace(/\/$/, '').split('/').filter(Boolean)
    if (segments.length < 2) {
      return { url: '', repoName: '', error: 'URL is missing the repository path (expected https://host/owner/repo).' }
    }

    // Reject GitHub web-UI sub-paths like /user/repo/tree/branch
    if (segments.length > 2 && GITHUB_WEB_PATHS.has(segments[2].toLowerCase())) {
      return {
        url: '',
        repoName: '',
        error: `This is a GitHub ${segments[2]} page, not a clone URL. Use https://${parsed.host}/${segments[0]}/${segments[1]}.git`,
      }
    }

    const lastSegment = segments[segments.length - 1].replace(/\.git$/, '')
    const repoName = sanitizeRepoName(lastSegment)
    if (!repoName) {
      return { url: '', repoName: '', error: 'Could not derive a folder name from this URL.' }
    }

    // Strip any trailing slash from the URL but keep the rest intact
    const url = trimmed.replace(/\/+$/, '')
    return { url, repoName, error: null }
  }

  return {
    url: '',
    repoName: '',
    error: 'Enter an HTTPS URL (https://github.com/owner/repo), SSH URL (git@github.com:owner/repo.git), or owner/repo shorthand.',
  }
}

function sanitizeRepoName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '')
}
