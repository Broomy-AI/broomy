/**
 * The message to show in place of a session's panels when it can't be used.
 *
 * A session that failed to initialize usually has no directory either — the worktree was never
 * created, or was cleaned up after a failed push — so the missing-folder check fires as well.
 * Reporting that would show the symptom ("Folder not found: …") and hide the cause ("a local
 * branch … already exists"), so a recorded init failure always wins.
 */
import type { Session } from '../../store/sessions'

export function sessionErrorMessage(
  session: Pick<Session, 'directory' | 'initError'> | null | undefined,
  directoryExists: boolean,
): string | null {
  if (!session) return null
  if (session.initError) return session.initError
  return directoryExists ? null : `Folder not found: ${session.directory}`
}
