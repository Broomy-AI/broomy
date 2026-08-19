/**
 * Guard: main must never assign `nativeTheme.themeSource`.
 *
 * It is the obvious-looking way to make the last few native surfaces (macOS traffic
 * lights, the menu bar, file dialogs, the webview context menu) follow the app
 * theme, and it was used for exactly that until it was removed. The catch is that it
 * is process-global AND drives `prefers-color-scheme` for every web content in the
 * process, so a dark app theme silently turned every website in the file viewer dark
 * too.
 *
 * Comments explain that; only a test stops someone reinstating it. Sibling of the
 * `prefers-color-scheme` guard in renderer/theme.css.test.ts.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return []
    return [full]
  })
}

/** The rule is about code that runs, not about the words being written down. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('nativeTheme.themeSource', () => {
  const files = sourceFiles(__dirname)

  it('finds the main-process sources to scan', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('is never assigned — it would drag every website in the file viewer dark', () => {
    const offenders = files.filter((file) =>
      stripComments(readFileSync(file, 'utf-8')).includes('themeSource')
    )
    expect(offenders).toEqual([])
  })
})
