import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fs before importing platform
vi.mock('fs', () => ({
  chmodSync: vi.fn(),
  existsSync: vi.fn(() => false),
}))

import { chmodSync } from 'fs'

describe('platform', () => {
  describe('isWindows', () => {
    it('reflects process.platform', async () => {
      const { isWindows } = await import('./platform')
      expect(typeof isWindows).toBe('boolean')
      // On macOS/Linux CI this should be false
      expect(isWindows).toBe(process.platform === 'win32')
    })
  })

  describe('isMac', () => {
    it('reflects process.platform', async () => {
      const { isMac } = await import('./platform')
      expect(typeof isMac).toBe('boolean')
      expect(isMac).toBe(process.platform === 'darwin')
    })
  })

  describe('getDefaultShell', () => {
    it('returns SHELL env var on non-Windows', async () => {
      const { getDefaultShell } = await import('./platform')
      // On macOS/Linux this should return process.env.SHELL or /bin/sh
      const result = getDefaultShell()
      if (process.platform === 'win32') {
        expect(result).toBe(process.env.ComSpec || 'powershell.exe')
      } else {
        expect(result).toBe(process.env.SHELL || '/bin/sh')
      }
    })
  })

  describe('getExecShell', () => {
    it('returns SHELL or /bin/sh on non-Windows', async () => {
      const { getExecShell } = await import('./platform')
      const result = getExecShell()
      if (process.platform === 'win32') {
        expect(result).toBeUndefined()
      } else {
        expect(result).toBe(process.env.SHELL || '/bin/sh')
      }
    })
  })

  describe('normalizePath', () => {
    it('replaces backslashes with forward slashes', async () => {
      const { normalizePath } = await import('./platform')
      expect(normalizePath('C:\\Users\\test\\file.ts')).toBe('C:/Users/test/file.ts')
    })

    it('leaves forward slashes unchanged', async () => {
      const { normalizePath } = await import('./platform')
      expect(normalizePath('/home/user/file.ts')).toBe('/home/user/file.ts')
    })

    it('handles mixed slashes', async () => {
      const { normalizePath } = await import('./platform')
      expect(normalizePath('path/to\\mixed\\slashes/here')).toBe('path/to/mixed/slashes/here')
    })

    it('handles empty string', async () => {
      const { normalizePath } = await import('./platform')
      expect(normalizePath('')).toBe('')
    })
  })

  describe('makeExecutable', () => {
    beforeEach(() => {
      vi.mocked(chmodSync).mockClear()
    })

    it('calls chmodSync with 0o755 on non-Windows', async () => {
      const { makeExecutable, isWindows } = await import('./platform')
      makeExecutable('/path/to/script.sh')
      if (isWindows) {
        expect(chmodSync).not.toHaveBeenCalled()
      } else {
        expect(chmodSync).toHaveBeenCalledWith('/path/to/script.sh', 0o755)
      }
    })
  })

  describe('getAvailableShells', () => {
    it('returns an array of shell options', async () => {
      const { getAvailableShells } = await import('./platform')
      const shells = getAvailableShells()
      expect(shells.length).toBeGreaterThan(0)
    })

    it('marks exactly one shell as default', async () => {
      const { getAvailableShells } = await import('./platform')
      const shells = getAvailableShells()
      const defaults = shells.filter(s => s.isDefault)
      expect(defaults).toHaveLength(1)
    })

    it('includes the login shell on Unix', async () => {
      const { getAvailableShells, isWindows } = await import('./platform')
      if (isWindows) return
      const shells = getAvailableShells()
      const loginShell = process.env.SHELL || '/bin/sh'
      expect(shells.some(s => s.path === loginShell)).toBe(true)
    })

    it('each shell has path, name, and isDefault', async () => {
      const { getAvailableShells } = await import('./platform')
      const shells = getAvailableShells()
      for (const shell of shells) {
        expect(shell.path).toBeTruthy()
        expect(shell.name).toBeTruthy()
        expect(typeof shell.isDefault).toBe('boolean')
      }
    })

    it('does not include duplicate paths', async () => {
      const { getAvailableShells } = await import('./platform')
      const shells = getAvailableShells()
      const paths = shells.map(s => s.path)
      expect(new Set(paths).size).toBe(paths.length)
    })
  })

  describe('resolveCommand', () => {
    it('finds git via which/where on the current platform', async () => {
      const { resolveCommand } = await import('./platform')
      // git should be on PATH in any CI/dev environment
      const result = resolveCommand('git')
      expect(result).toBeTruthy()
      expect(result!.toLowerCase()).toContain('git')
    })

    it('returns null for a command that does not exist', async () => {
      const { resolveCommand } = await import('./platform')
      const result = resolveCommand('definitely-not-a-real-command-12345')
      expect(result).toBeNull()
    })

    it('returns null for unknown command without well-known paths', async () => {
      const { resolveCommand } = await import('./platform')
      const result = resolveCommand('nonexistent-tool')
      expect(result).toBeNull()
    })

    it('resolveWindowsCommand is an alias for resolveCommand', async () => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const { resolveCommand, resolveWindowsCommand } = await import('./platform')
      expect(resolveWindowsCommand).toBe(resolveCommand)
    })
  })

  describe('getCommonBinPaths', () => {
    it('returns an array of paths', async () => {
      const { getCommonBinPaths } = await import('./platform')
      const paths = getCommonBinPaths()
      expect(Array.isArray(paths)).toBe(true)
      expect(paths.length).toBeGreaterThan(0)
    })

    it('includes ~/.local/bin on all platforms', async () => {
      const { getCommonBinPaths } = await import('./platform')
      const { homedir } = await import('os')
      const { join } = await import('path')
      const paths = getCommonBinPaths()
      expect(paths).toContain(join(homedir(), '.local', 'bin'))
    })
  })

  describe('enhancedPath', () => {
    it('appends common paths not already present', async () => {
      const { enhancedPath, getCommonBinPaths } = await import('./platform')
      const result = enhancedPath('/usr/bin')
      const commonPaths = getCommonBinPaths()
      // All common paths should appear in the result
      for (const p of commonPaths) {
        expect(result).toContain(p)
      }
    })

    it('does not duplicate paths already in PATH', async () => {
      const { enhancedPath, getCommonBinPaths, isWindows } = await import('./platform')
      const sep = isWindows ? ';' : ':'
      const commonPaths = getCommonBinPaths()
      // Include one common path already
      const existing = `/usr/bin${sep}${commonPaths[0]}`
      const result = enhancedPath(existing)
      const parts = result.split(sep)
      const counts = parts.filter((p: string) => p === commonPaths[0])
      expect(counts).toHaveLength(1)
    })

    it('handles empty/undefined PATH', async () => {
      const { enhancedPath } = await import('./platform')
      const result = enhancedPath(undefined)
      expect(result.length).toBeGreaterThan(0)
      const resultEmpty = enhancedPath('')
      expect(resultEmpty.length).toBeGreaterThan(0)
    })
  })
})
