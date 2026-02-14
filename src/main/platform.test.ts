import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fs before importing platform
vi.mock('fs', () => ({
  chmodSync: vi.fn(),
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
})
