import { IpcMain } from 'electron'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { normalizePath } from '../platform'
import { HandlerContext } from './types'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('fs:search', (_event, dirPath: string, query: string) => {
    if (ctx.isE2ETest) {
      return []
    }

    const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', '.cache', 'dist', 'build', '__pycache__', '.venv', 'venv'])
    const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.avi', '.mov', '.zip', '.tar', '.gz', '.rar', '.7z', '.pdf', '.exe', '.dll', '.so', '.dylib', '.o', '.a', '.bin', '.dat', '.db', '.sqlite'])
    const MAX_RESULTS = 500
    const MAX_CONTENT_MATCHES_PER_FILE = 5
    const MAX_FILE_SIZE = 1024 * 1024

    const results: { path: string; name: string; relativePath: string; matchType: 'filename' | 'content'; contentMatches: { line: number; text: string }[] }[] = []
    const lowerQuery = query.toLowerCase()
    const normalizedDirPath = normalizePath(dirPath)

    const matchFileContent = (filePath: string, ext: string): { line: number; text: string }[] => {
      if (BINARY_EXTENSIONS.has(ext)) return []
      try {
        const stats = statSync(filePath)
        if (stats.size > MAX_FILE_SIZE) return []
        const content = readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')
        const matches: { line: number; text: string }[] = []
        for (let i = 0; i < lines.length && matches.length < MAX_CONTENT_MATCHES_PER_FILE; i++) {
          if (lines[i].toLowerCase().includes(lowerQuery)) {
            matches.push({ line: i + 1, text: lines[i].trim().substring(0, 200) })
          }
        }
        return matches
      } catch {
        return []
      }
    }

    const walkDir = (dir: string) => {
      if (results.length >= MAX_RESULTS) return

      let entries
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        if (results.length >= MAX_RESULTS) return

        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue
          walkDir(join(dir, entry.name))
          continue
        }

        const filePath = join(dir, entry.name)
        const normalizedFilePath = normalizePath(filePath)
        const relativePath = normalizedFilePath.replace(`${normalizedDirPath}/`, '')
        const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase()

        const filenameMatch = entry.name.toLowerCase().includes(lowerQuery)
        const contentMatches = matchFileContent(filePath, ext)

        if (filenameMatch || contentMatches.length > 0) {
          results.push({
            path: normalizedFilePath,
            name: entry.name,
            relativePath,
            matchType: filenameMatch ? 'filename' : 'content',
            contentMatches,
          })
        }
      }
    }

    walkDir(dirPath)
    return results
  })
}
