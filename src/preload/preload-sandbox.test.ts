/**
 * Smoke test: ensures preload source files don't import Node.js built-in modules
 * that are unavailable in Electron's sandboxed preload environment.
 *
 * Only 'electron' is allowed. Importing modules like 'os', 'fs', 'path', etc.
 * will crash the preload script at runtime and break all window.* APIs.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const PRELOAD_DIR = join(__dirname)

// Node built-in modules that are NOT available in Electron's sandboxed preload
const FORBIDDEN_MODULES = [
  'os', 'fs', 'path', 'child_process', 'crypto', 'http', 'https', 'net',
  'dgram', 'dns', 'tls', 'stream', 'zlib', 'util', 'buffer', 'events',
  'url', 'querystring', 'assert', 'cluster', 'worker_threads', 'vm',
  'readline', 'repl', 'module', 'perf_hooks', 'async_hooks', 'v8',
  'process', 'timers',
]

function getPreloadSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...getPreloadSourceFiles(fullPath))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

describe('preload sandbox safety', () => {
  const sourceFiles = getPreloadSourceFiles(PRELOAD_DIR)

  it('should have preload source files to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(0)
  })

  for (const filePath of getPreloadSourceFiles(PRELOAD_DIR)) {
    const relativePath = filePath.replace(PRELOAD_DIR, 'src/preload')

    it(`${relativePath} should not import forbidden Node.js modules`, () => {
      const content = readFileSync(filePath, 'utf-8')
      const violations: string[] = []

      for (const mod of FORBIDDEN_MODULES) {
        // Match: import ... from 'module' or import 'module' or require('module')
        // But skip `import type` which is erased at compile time and safe
        const importRegex = new RegExp(
          `(?:^|\\n)\\s*import\\s+(?!type\\s).*?from\\s+['"]${mod}['"]` +
          `|(?:^|\\n)\\s*import\\s+['"]${mod}['"]` +
          `|require\\s*\\(\\s*['"]${mod}['"]\\s*\\)`,
        )
        if (importRegex.test(content)) {
          violations.push(mod)
        }
      }

      expect(violations, `Forbidden Node.js imports found: ${violations.join(', ')}. ` +
        `These modules are not available in Electron's sandboxed preload. ` +
        `Use IPC calls to the main process instead.`).toEqual([])
    })
  }
})
