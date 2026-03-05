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

function sshToHttpsUrl(url: string): string | null {
  const ghMatch = /git@github\.com:([^/]+\/[^/.]+?)(?:\.git)?$/.exec(url)
  return ghMatch ? `https://github.com/${ghMatch[1]}.git` : null
}

function httpsToSshUrl(url: string): string | null {
  const ghMatch = /https?:\/\/github\.com\/([^/]+\/[^/.]+)/.exec(url)
  return ghMatch ? `git@github.com:${ghMatch[1]}.git` : null
}

function getHttpsAuthHint(url: string, options?: { ghAvailable?: boolean }): string {
  const sshUrl = httpsToSshUrl(url)
  let hint = '\n\nGit could not authenticate over HTTPS.'
  hint += '\n\nTry one of:'
  if (sshUrl) {
    hint += `\n• Use the SSH URL instead: ${sshUrl}`
  }
  if (options?.ghAvailable === false) {
    hint += '\n• Install GitHub CLI (cli.github.com) to set up credentials automatically'
  } else {
    hint += '\n• Run "gh auth setup-git" in your terminal to set up HTTPS credentials'
  }
  return hint
}

function getHostKeyHint(url: string, options?: { ghAvailable?: boolean }): string {
  const httpsUrl = sshToHttpsUrl(url)
  let hint = '\n\nGitHub\'s SSH host key is not yet trusted on this machine.'
  hint += '\n\nTry one of:'
  hint += '\n• Run "ssh -T git@github.com" in your terminal and type "yes" to trust GitHub\'s key'
  if (httpsUrl) {
    hint += `\n• Use the HTTPS URL instead: ${httpsUrl}`
  }
  if (options?.ghAvailable === false) {
    hint += '\n• Install GitHub CLI (cli.github.com) and run "gh auth login" choosing SSH to set up everything automatically'
  } else {
    hint += '\n• Run "gh auth login" and choose SSH to set up everything automatically'
  }
  return hint
}

function getSshAuthHint(url: string, options?: { ghAvailable?: boolean }): string {
  const httpsUrl = sshToHttpsUrl(url)
  let hint = '\n\nGit could not authenticate over SSH.'
  hint += '\n\nTry one of:'
  if (httpsUrl) {
    hint += `\n• Use the HTTPS URL instead: ${httpsUrl}`
  }
  hint += '\n• Check that your SSH key is added: run "ssh -T git@github.com" to test'
  if (options?.ghAvailable === false) {
    hint += '\n• Install GitHub CLI (cli.github.com) to set up HTTPS credentials, then use an HTTPS URL'
  } else {
    hint += '\n• Run "gh auth setup-git" to set up HTTPS credentials, then use an HTTPS URL'
  }
  return hint
}

/**
 * Detects common git authentication errors (push, pull, fetch) and returns actionable hints.
 * When a URL is provided, delegates to getCloneErrorHint for protocol-specific advice.
 * When no URL is available, gives generic advice.
 */
export function getGitAuthHint(errorStr: string, options?: { url?: string; ghAvailable?: boolean; ghAuthenticated?: boolean }): string | null {
  if (options?.url) {
    return getCloneErrorHint(errorStr, options.url, { ghAvailable: options.ghAvailable })
  }

  // Identity error detection
  const isIdentityError = errorStr.includes('Please tell me who you are')
    || errorStr.includes('Author identity unknown')
    || errorStr.includes('empty ident name')
    || errorStr.includes('user.useConfigOnly')
  if (isIdentityError) {
    return '\n\nGit identity not configured.\n\nRun:\n  git config --global user.name "Your Name"\n  git config --global user.email "you@example.com"'
  }

  // Merge mode error detection
  const isMergeModeError = errorStr.includes('Need to specify how to reconcile divergent branches')
    || (errorStr.includes('pull.rebase') && errorStr.includes('pull.ff'))
  if (isMergeModeError) {
    return '\n\nGit default merge mode not configured.\n\nRun:\n  git config --global pull.rebase false'
  }

  // Generic auth error detection (no URL available)
  const isAuthError = errorStr.includes('could not read Username')
    || errorStr.includes('Authentication failed')
    || errorStr.includes('terminal prompts disabled')
    || errorStr.includes('Permission denied (publickey)')
    || errorStr.includes('Host key verification failed')

  if (!isAuthError) return null

  let hint = '\n\nGit authentication failed.'
  hint += '\n\nTry one of:'
  if (options?.ghAvailable === false) {
    hint += '\n• Install GitHub CLI (cli.github.com) to set up credentials automatically'
  } else if (options?.ghAuthenticated === false) {
    hint += '\n• Run "gh auth login" in your terminal — gh is installed but not authenticated'
  } else {
    hint += '\n• Run "gh auth login" in your terminal to set up credentials'
  }
  hint += '\n• Check your SSH keys or HTTPS credentials'
  return hint
}

/**
 * Detects common git clone authentication errors and returns actionable hints.
 * Covers both HTTPS-when-SSH-is-needed and SSH-when-HTTPS-is-needed cases.
 */
export function getCloneErrorHint(errorStr: string, url: string, options?: { ghAvailable?: boolean }): string | null {
  const isHttpsUrl = url.startsWith('https://') || url.startsWith('http://')
  const isSshUrl = url.startsWith('git@') || !!(/^ssh:\/\//.exec(url))

  // HTTPS auth failures — suggest SSH URL or credential setup
  const isHttpsAuthError = errorStr.includes('could not read Username')
    || errorStr.includes('Authentication failed')
    || errorStr.includes('terminal prompts disabled')
  if (isHttpsAuthError && isHttpsUrl) {
    return getHttpsAuthHint(url, options)
  }

  // SSH host key not trusted — specific hint for fresh machines
  if (errorStr.includes('Host key verification failed') && isSshUrl) {
    return getHostKeyHint(url, options)
  }

  // SSH auth failures — suggest HTTPS URL or SSH key setup
  const isSshAuthError = errorStr.includes('Permission denied (publickey)')
    || (errorStr.includes('Connection refused') && isSshUrl)
    || (errorStr.includes('Connection timed out') && isSshUrl)
  if (isSshAuthError && isSshUrl) {
    return getSshAuthHint(url, options)
  }

  return null
}
