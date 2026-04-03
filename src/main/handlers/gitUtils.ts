/**
 * Shared git utility functions used across handler modules.
 */
import type { SimpleGit } from 'simple-git'
import simpleGit from 'simple-git'

/** Set env vars to prevent SSH/HTTPS prompts that would hang in Electron.
 *  Spreads process.env so credential helpers retain access to HOME, PATH,
 *  DBUS_SESSION_BUS_ADDRESS, etc. — required on Linux for keyring-based auth. */
export function withNonInteractive(git: ReturnType<typeof simpleGit>) {
  return git.env({ ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' })
}

/** Safely extract an error message string from an unknown thrown value. */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Detect the default branch for a repository by checking (in order):
 * 1. The symbolic ref `refs/remotes/origin/HEAD`
 * 2. Whether `origin/main` exists
 * 3. Whether `origin/master` exists
 * 4. Falls back to 'main'
 */
export async function getDefaultBranch(git: SimpleGit): Promise<string> {
  try {
    const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
    return ref.trim().replace('refs/remotes/origin/', '')
  } catch {
    for (const candidate of ['main', 'master']) {
      try {
        await git.raw(['rev-parse', '--verify', `origin/${candidate}`])
        return candidate
      } catch { /* try next candidate */ }
    }
    return 'main'
  }
}
