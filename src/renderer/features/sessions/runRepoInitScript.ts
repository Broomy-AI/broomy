/**
 * Runs a repo's init script in a freshly created worktree.
 *
 * Session state is passed as BROOMY_* environment variables rather than
 * substituted into the script text: issue and PR titles carry
 * GitHub-controlled text, and splicing that into a shell script executes it.
 *
 * Failures are non-fatal — a session is still usable if setup did not finish.
 */
import { buildTemplateEnv, type TemplateVarInput, type TemplateVarRepo } from '../commands/templateVars'

export interface RepoForInitScript extends TemplateVarRepo {
  id: string
}

export async function runRepoInitScript(
  repo: RepoForInitScript,
  worktreePath: string,
  varInput: Omit<TemplateVarInput, 'directory' | 'repo'> = {}
): Promise<void> {
  try {
    const script = await window.repos.getInitScript(repo.id)
    if (!script) return
    const env = buildTemplateEnv({ ...varInput, repo, directory: worktreePath }, 'init')
    await window.shell.exec(script, worktreePath, env)
  } catch {
    // Non-fatal, matching the behaviour of the call sites this replaces.
  }
}
