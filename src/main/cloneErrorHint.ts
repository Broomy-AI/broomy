/**
 * Git clone error diagnosis and user-facing hint generation.
 *
 * Inspects the stderr output from a failed `git clone` to detect HTTPS
 * authentication failures (missing credentials, terminal prompts disabled)
 * and SSH authentication failures (public key denied, host verification,
 * connection refused/timed out). When a match is found, it returns a
 * multi-line hint suggesting the alternative protocol URL and relevant
 * setup commands (e.g. `gh auth setup-git`, `ssh -T git@github.com`).
 */

/**
 * Detects common git clone authentication errors and returns actionable hints.
 * Covers both HTTPS-when-SSH-is-needed and SSH-when-HTTPS-is-needed cases.
 */
export function getCloneErrorHint(errorStr: string, url: string): string | null {
  const isHttpsUrl = url.startsWith('https://') || url.startsWith('http://')
  const isSshUrl = url.startsWith('git@') || !!(/^ssh:\/\//.exec(url))

  // HTTPS auth failures — suggest SSH URL or credential setup
  const isHttpsAuthError = errorStr.includes('could not read Username')
    || errorStr.includes('Authentication failed')
    || errorStr.includes('terminal prompts disabled')
  if (isHttpsAuthError && isHttpsUrl) {
    const ghMatch = /https?:\/\/github\.com\/([^/]+\/[^/.]+)/.exec(url)
    const sshUrl = ghMatch ? `git@github.com:${ghMatch[1]}.git` : null
    let hint = '\n\nGit could not authenticate over HTTPS.'
    hint += '\n\nTry one of:'
    if (sshUrl) {
      hint += `\n• Use the SSH URL instead: ${sshUrl}`
    }
    hint += '\n• Run "gh auth setup-git" in your terminal to set up HTTPS credentials'
    return hint
  }

  // SSH auth failures — suggest HTTPS URL or SSH key setup
  const isSshAuthError = errorStr.includes('Permission denied (publickey)')
    || errorStr.includes('Host key verification failed')
    || (errorStr.includes('Connection refused') && isSshUrl)
    || (errorStr.includes('Connection timed out') && isSshUrl)
  if (isSshAuthError && isSshUrl) {
    const ghMatch = /git@github\.com:([^/]+\/[^/.]+?)(?:\.git)?$/.exec(url)
    const httpsUrl = ghMatch ? `https://github.com/${ghMatch[1]}.git` : null
    let hint = '\n\nGit could not authenticate over SSH.'
    hint += '\n\nTry one of:'
    if (httpsUrl) {
      hint += `\n• Use the HTTPS URL instead: ${httpsUrl}`
    }
    hint += '\n• Check that your SSH key is added: run "ssh -T git@github.com" to test'
    hint += '\n• Run "gh auth setup-git" to set up HTTPS credentials, then use an HTTPS URL'
    return hint
  }

  return null
}
