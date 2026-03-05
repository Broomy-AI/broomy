/**
 * Maps raw error messages to human-friendly display messages.
 *
 * Each rule is a regex pattern matched against the raw error string.
 * The first matching rule wins. If no rule matches, the raw message is returned as-is.
 */

const rules: { pattern: RegExp; message: string }[] = [
  { pattern: /Please tell me who you are|Author identity unknown|empty ident name/i, message: 'Git identity not configured. Set your name and email to use git.' },
  { pattern: /Need to specify how to reconcile divergent branches|pull\.rebase/i, message: 'Git default merge mode not configured.' },
  { pattern: /Authentication failed|Permission denied \(publickey\)|could not read Username|terminal prompts disabled/i, message: 'Git authentication failed. Run "gh auth login" in a terminal to set up credentials.' },
  { pattern: /CONFLICT|merge conflict/i, message: 'Merge conflicts detected. Resolve them before continuing.' },
  { pattern: /not a git repository/i, message: 'This directory is not a git repository.' },
  { pattern: /already exists/i, message: 'Worktree or branch already exists.' },
  { pattern: /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|Could not resolve host/i, message: 'Network error. Check your internet connection.' },
  { pattern: /gh auth login|not logged in/i, message: 'GitHub CLI not authenticated. Run "gh auth login" in a terminal.' },
  { pattern: /gh: command not found/i, message: 'GitHub CLI (gh) not found. Install it from https://cli.github.com' },
  { pattern: /Failed to start terminal/i, message: 'Terminal failed to start. Try restarting the session.' },
  { pattern: /ENOENT|no such file or directory/i, message: 'File or directory not found.' },
  { pattern: /EACCES|permission denied/i, message: 'Permission denied. Check file permissions.' },
  { pattern: /\[rejected\]|rejected.*push|failed to push/i, message: 'Push rejected by remote. Pull first, or force-push if appropriate.' },
  { pattern: /clone failed|Repository not found/i, message: 'Clone failed. Check the repository URL and your access.' },
  { pattern: /timed? ?out|ETIMEDOUT|timeout/i, message: 'Operation timed out. Check your network and try again.' },
  { pattern: /daemon is not running|Cannot connect to the Docker daemon/i, message: 'Docker daemon is not running. Start Docker Desktop and try again.' },
  { pattern: /no space left|disk full/i, message: 'Disk full. Free up space and try again.' },
  { pattern: /manifest unknown|image.*not found/i, message: 'Docker image not found. Check the image name.' },
  { pattern: /unauthorized|denied.*login|authentication required/i, message: 'Docker authentication required. Run "docker login" first.' },
  { pattern: /command not found|ENOENT.*spawn/i, message: 'Required command not found. Check your PATH and installation.' },
  { pattern: /corrupt|invalid JSON|Unexpected token|SyntaxError/i, message: 'Configuration file is corrupt. It will be restored from backup.' },
]

export function humanizeError(rawMessage: string): string {
  for (const rule of rules) {
    if (rule.pattern.test(rawMessage)) {
      return rule.message
    }
  }
  return rawMessage
}
