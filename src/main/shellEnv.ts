/**
 * Resolves the user's login shell environment.
 *
 * When Electron is launched as a macOS app, process.env has a minimal PATH.
 * This spawns the user's login shell to capture the full environment
 * (PATH, GOPATH, NVM_DIR, etc.) and merges it into process.env.
 */
import { execFile } from 'child_process'

export async function resolveShellEnv(): Promise<void> {
  if (process.platform === 'win32') return
  if (process.env.E2E_TEST === 'true') return

  const shell = process.env.SHELL || '/bin/zsh'

  try {
    const env = await new Promise<string>((resolve, reject) => {
      execFile(shell, ['-l', '-c', 'env -0'], { timeout: 5000 }, (err, stdout) => {
        if (err) reject(err as Error)
        else resolve(stdout)
      })
    })

    for (const entry of env.split('\0')) {
      const i = entry.indexOf('=')
      if (i > 0) {
        process.env[entry.slice(0, i)] = entry.slice(i + 1)
      }
    }
  } catch (err) {
    console.warn('[shellEnv] Failed to resolve login shell environment:', err)
    // If this fails, the app still works — just with the minimal PATH
  }
}
