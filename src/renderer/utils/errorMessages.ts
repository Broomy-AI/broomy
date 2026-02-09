export type ErrorCategory = 'git' | 'network' | 'permissions' | 'config' | 'github' | 'disk' | 'unknown'

export interface CategorizedError {
  message: string
  category: ErrorCategory
  suggestion?: string
}

interface ErrorPattern {
  pattern: RegExp
  message: string
  category: ErrorCategory
  suggestion?: string
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // SSH auth failures
  {
    pattern: /Permission denied \(publickey\)|Host key verification failed|Could not read from remote repository/i,
    message: 'SSH authentication failed',
    category: 'git',
    suggestion: 'Check that your SSH key is added to your Git host (ssh-add -l to verify)',
  },
  // Git push rejected
  {
    pattern: /\[rejected\].*non-fast-forward|Updates were rejected because the tip of your current branch is behind/i,
    message: 'Push rejected — remote has newer changes',
    category: 'git',
    suggestion: 'Pull the latest changes first, then try pushing again',
  },
  // Merge conflicts
  {
    pattern: /CONFLICT \(|Automatic merge failed|fix conflicts and then commit/i,
    message: 'Merge conflict detected',
    category: 'git',
    suggestion: 'Resolve the conflicts in the affected files, then stage and commit',
  },
  // Disk full
  {
    pattern: /ENOSPC|No space left on device/i,
    message: 'Disk is full',
    category: 'disk',
    suggestion: 'Free up disk space and try again',
  },
  // Permission denied (filesystem)
  {
    pattern: /EACCES|EPERM|permission denied/i,
    message: 'Permission denied',
    category: 'permissions',
    suggestion: 'Check file/folder permissions, or try running with appropriate access',
  },
  // GitHub CLI not installed
  {
    pattern: /gh: command not found|gh is not installed/i,
    message: 'GitHub CLI (gh) is not installed',
    category: 'github',
    suggestion: 'Install the GitHub CLI: https://cli.github.com',
  },
  // GitHub CLI not logged in
  {
    pattern: /gh auth login|not logged into any GitHub hosts/i,
    message: 'Not logged into GitHub CLI',
    category: 'github',
    suggestion: 'Run "gh auth login" in a terminal to authenticate',
  },
  // Config JSON corruption
  {
    pattern: /Unexpected token.*JSON|SyntaxError.*JSON\.parse|Unexpected end of JSON/i,
    message: 'Configuration file is corrupted',
    category: 'config',
    suggestion: 'Your config file may have been corrupted. Check ~/.broomy for malformed JSON files',
  },
  // Network / DNS failures
  {
    pattern: /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|getaddrinfo|network|fetch failed/i,
    message: 'Network connection failed',
    category: 'network',
    suggestion: 'Check your internet connection and try again',
  },
  // Git not found
  {
    pattern: /git: command not found|git is not installed/i,
    message: 'Git is not installed',
    category: 'git',
    suggestion: 'Install Git: https://git-scm.com/downloads',
  },
  // Repository not found
  {
    pattern: /repository not found|does not appear to be a git repository/i,
    message: 'Git repository not found',
    category: 'git',
    suggestion: 'Check that the directory exists and is a valid git repository',
  },
]

export function categorizeError(rawError: string): CategorizedError {
  for (const { pattern, message, category, suggestion } of ERROR_PATTERNS) {
    if (pattern.test(rawError)) {
      return { message, category, suggestion }
    }
  }
  return {
    message: rawError.length > 200 ? rawError.slice(0, 200) + '...' : rawError,
    category: 'unknown',
  }
}
