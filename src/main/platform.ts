/**
 * Cross-platform shell and path utilities.
 *
 * Provides OS detection flags, default shell resolution (respecting the SHELL
 * environment variable on Unix, ComSpec on Windows), path normalization to
 * forward slashes, and a chmod helper that is a no-op on Windows.
 */
export const isWindows = process.platform === 'win32'
export const isMac = process.platform === 'darwin'

export function getDefaultShell(): string {
  if (isWindows) return process.env.ComSpec || 'powershell.exe'
  return process.env.SHELL || '/bin/zsh'
}

export function getExecShell(): string | undefined {
  return isWindows ? undefined : '/bin/bash'
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function makeExecutable(filePath: string): void {
  if (!isWindows) {
    const { chmodSync } = require('fs')
    chmodSync(filePath, 0o755)
  }
}
