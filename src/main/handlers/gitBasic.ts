/**
 * IPC handlers for basic git queries: branch name, repo detection, status, diff, and log.
 */
import { IpcMain } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import simpleGit from 'simple-git'
import { statusFromChar } from '../gitStatusParser'
import { getGitAuthHint } from '../cloneErrorHint'
import { HandlerContext } from './types'
import { getScenarioData } from './scenarios'
import { getDefaultBranch } from './gitUtils'

const execFileAsync = promisify(execFile)
/** Set env vars to prevent SSH/HTTPS prompts that would hang in Electron.
 *  Spreads process.env so credential helpers retain access to HOME, PATH,
 *  DBUS_SESSION_BUS_ADDRESS, etc. — required on Linux for keyring-based auth. */
function withNonInteractive(git: ReturnType<typeof simpleGit>) {
  return git.env({ ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' })
}

async function handleGetBranch(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    const scenario = getScenarioData(ctx.e2eScenario)
    return scenario.branches[repoPath] || 'main'
  }

  try {
    const git = simpleGit(repoPath)
    const status = await git.status()
    return status.current || 'unknown'
  } catch {
    return 'unknown'
  }
}

async function handleIsGitRepo(ctx: HandlerContext, dirPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return true
  }

  try {
    const git = simpleGit(dirPath)
    return await git.checkIsRepo()
  } catch {
    return false
  }
}

/**
 * Count commits on HEAD that haven't been pushed to the remote branch.
 * Compares against origin/${branch} so the count matches the "Local"
 * group in the commits tab, rather than using @{upstream} which may
 * point at origin/main and inflate the number.
 */
async function countUnpushedCommits(git: ReturnType<typeof simpleGit>, branch: string): Promise<number> {
  try {
    await git.raw(['rev-parse', '--verify', `origin/${branch}`])
    const countStr = await git.raw(['rev-list', '--count', `origin/${branch}..HEAD`])
    return parseInt(countStr.trim(), 10) || 0
  } catch {
    // No remote branch — all commits since the default branch are unpushed
    try {
      const defaultBranch = await getDefaultBranch(git)
      const countStr = await git.raw(['rev-list', '--count', `origin/${defaultBranch}..HEAD`])
      return parseInt(countStr.trim(), 10) || 0
    } catch {
      return 0
    }
  }
}

async function handleStatus(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    const scenario = getScenarioData(ctx.e2eScenario)
    const mockMerge = process.env.E2E_MOCK_MERGE
    const branch = scenario.branches[repoPath] || 'main'
    const base = {
      ...scenario.gitStatus,
      current: branch,
      isMerging: mockMerge === 'true' || mockMerge === 'conflicts',
      hasConflicts: mockMerge === 'conflicts',
    }
    // Allow overriding git status fields for feature docs
    if (process.env.E2E_MOCK_GIT_CLEAN === 'true') {
      base.files = []
      base.ahead = 0
      base.behind = 0
      base.tracking = branch !== 'main' ? `origin/${branch}` : null
    }
    if (process.env.E2E_MOCK_GIT_AHEAD) {
      base.ahead = parseInt(process.env.E2E_MOCK_GIT_AHEAD, 10)
    }
    if (process.env.E2E_MOCK_GIT_TRACKING) {
      base.tracking = process.env.E2E_MOCK_GIT_TRACKING
    }
    return base
  }

  try {
    const git = simpleGit(repoPath)
    const status = await git.status()
    const files: { path: string; status: string; staged: boolean; indexStatus: string; workingDirStatus: string }[] = []

    for (const file of status.files) {
      const indexStatus = file.index || ' '
      const workingDirStatus = file.working_dir || ' '
      const hasIndexChange = indexStatus !== ' ' && indexStatus !== '?'
      const hasWorkingDirChange = workingDirStatus !== ' ' && workingDirStatus !== '?'

      if (hasIndexChange) {
        files.push({ path: file.path, status: statusFromChar(indexStatus), staged: true, indexStatus, workingDirStatus })
      }

      if (hasWorkingDirChange || (!hasIndexChange && workingDirStatus === '?')) {
        files.push({ path: file.path, status: statusFromChar(workingDirStatus), staged: false, indexStatus, workingDirStatus })
      } else if (!hasIndexChange) {
        // Shouldn't happen, but handle gracefully
        files.push({ path: file.path, status: 'modified', staged: false, indexStatus, workingDirStatus })
      }
    }

    const isMerging = await git.raw(['rev-parse', '--verify', 'MERGE_HEAD']).then(() => true).catch(() => false)
    const unmergedFiles = status.files.filter(f => f.index === 'U' || f.working_dir === 'U')
    let hasConflicts = false
    for (const file of unmergedFiles) {
      try {
        const content = await readFile(join(repoPath, file.path), 'utf-8')
        if (content.includes('<<<<<<<')) {
          hasConflicts = true
          break
        }
      } catch {
        hasConflicts = true
        break
      }
    }

    const ahead = status.current ? await countUnpushedCommits(git, status.current) : 0

    return {
      files,
      ahead,
      behind: status.behind,
      tracking: status.tracking,
      current: status.current,
      isMerging,
      hasConflicts,
    }
  } catch {
    return { files: [], ahead: 0, behind: 0, tracking: null, current: null, isMerging: false, hasConflicts: false }
  }
}

async function handleStage(ctx: HandlerContext, repoPath: string, filePath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.add([filePath])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleStageAll(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.add('.')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleUnstage(ctx: HandlerContext, repoPath: string, filePath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.reset(['HEAD', '--', filePath])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleCheckoutFile(ctx: HandlerContext, repoPath: string, filePath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.checkout(['--', filePath])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleCommit(ctx: HandlerContext, repoPath: string, message: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  if (!message || message.trim() === '') {
    return { success: false, error: 'Commit message cannot be empty' }
  }

  try {
    const git = simpleGit(repoPath)
    await git.commit(message)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleCommitMerge(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.raw(['commit', '--no-edit'])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function appendAuthHint(repoPath: string, errorStr: string): Promise<string> {
  let url: string | undefined
  try {
    const remotes = await simpleGit(repoPath).getRemotes(true)
    url = remotes.find(r => r.name === 'origin')?.refs.push
  } catch { /* ignore */ }
  let ghAvailable = true
  let ghAuthenticated = false
  try {
    await execFileAsync('gh', ['--version'], { encoding: 'utf-8' })
    // Also check auth status — gh may be installed but not authenticated
    try {
      await execFileAsync('gh', ['auth', 'status'], { encoding: 'utf-8', timeout: 5000 })
      ghAuthenticated = true
    } catch { /* not authenticated */ }
  } catch {
    ghAvailable = false
  }
  let credentialHelper: string | undefined
  try {
    // Use --get-regexp to find both global and URL-scoped credential helpers
    const { stdout } = await execFileAsync('git', ['config', '--get-regexp', 'credential.*helper'], { encoding: 'utf-8', cwd: repoPath })
    credentialHelper = stdout.trim()
  } catch { /* no credential helper configured */ }
  const hint = getGitAuthHint(errorStr, { url, ghAvailable, ghAuthenticated, credentialHelper })
  return hint ? errorStr + hint : errorStr
}

async function handlePush(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = withNonInteractive(simpleGit(repoPath))
    await git.push()
    return { success: true }
  } catch (error) {
    return { success: false, error: await appendAuthHint(repoPath, String(error)) }
  }
}

async function handlePull(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    const git = withNonInteractive(simpleGit(repoPath))
    await git.pull()
    return { success: true }
  } catch (error) {
    return { success: false, error: await appendAuthHint(repoPath, String(error)) }
  }
}

async function handleDiff(ctx: HandlerContext, repoPath: string, filePath?: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return getScenarioData(ctx.e2eScenario).diff
  }

  try {
    const git = simpleGit(repoPath)
    if (filePath) {
      return await git.diff([filePath])
    }
    return await git.diff()
  } catch {
    return ''
  }
}

async function handleShow(ctx: HandlerContext, repoPath: string, filePath: string, ref = 'HEAD') {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return getScenarioData(ctx.e2eScenario).show(filePath)
  }

  try {
    const git = simpleGit(repoPath)
    const result = await git.raw(['show', `${ref}:${filePath}`])
    return result
  } catch (error) {
    console.error('git show error:', error)
    return ''
  }
}

async function handleShowBase64(ctx: HandlerContext, repoPath: string, filePath: string, ref = 'HEAD') {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return ''
  }

  try {
    const { stdout } = await execFileAsync('git', ['show', `${ref}:${filePath}`], {
      cwd: repoPath,
      encoding: 'buffer',
      maxBuffer: 10 * 1024 * 1024,
    })
    return (stdout as unknown as Buffer).toString('base64')
  } catch (error) {
    console.error('git show base64 error:', error)
    return ''
  }
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('git:getBranch', (_event, repoPath: string) => handleGetBranch(ctx, repoPath))
  ipcMain.handle('git:isGitRepo', (_event, dirPath: string) => handleIsGitRepo(ctx, dirPath))
  ipcMain.handle('git:status', (_event, repoPath: string) => handleStatus(ctx, repoPath))
  ipcMain.handle('git:stage', (_event, repoPath: string, filePath: string) => handleStage(ctx, repoPath, filePath))
  ipcMain.handle('git:stageAll', (_event, repoPath: string) => handleStageAll(ctx, repoPath))
  ipcMain.handle('git:unstage', (_event, repoPath: string, filePath: string) => handleUnstage(ctx, repoPath, filePath))
  ipcMain.handle('git:checkoutFile', (_event, repoPath: string, filePath: string) => handleCheckoutFile(ctx, repoPath, filePath))
  ipcMain.handle('git:commit', (_event, repoPath: string, message: string) => handleCommit(ctx, repoPath, message))
  ipcMain.handle('git:commitMerge', (_event, repoPath: string) => handleCommitMerge(ctx, repoPath))
  ipcMain.handle('git:push', (_event, repoPath: string) => handlePush(ctx, repoPath))
  ipcMain.handle('git:pull', (_event, repoPath: string) => handlePull(ctx, repoPath))
  ipcMain.handle('git:diff', (_event, repoPath: string, filePath?: string) => handleDiff(ctx, repoPath, filePath))
  ipcMain.handle('git:show', (_event, repoPath: string, filePath: string, ref = 'HEAD') => handleShow(ctx, repoPath, filePath, ref))
  ipcMain.handle('git:showBase64', (_event, repoPath: string, filePath: string, ref = 'HEAD') => handleShowBase64(ctx, repoPath, filePath, ref))
}
