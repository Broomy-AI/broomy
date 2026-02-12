/**
 * Playwright global setup: runs once before all test files.
 *
 * 1. Ensures the Electron binary is downloaded (same checks as dev-preflight.cjs)
 * 2. Runs `pnpm build` exactly once so every spec file can skip its own build step
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

function run(cmd: string) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
}

function ensureElectronBinary() {
  const electronDir = path.join(ROOT, 'node_modules', 'electron')
  const distDir = path.join(electronDir, 'dist')
  const pathTxt = path.join(electronDir, 'path.txt')

  if (
    fs.existsSync(distDir) &&
    fs.existsSync(pathTxt) &&
    fs.existsSync(path.join(distDir, fs.readFileSync(pathTxt, 'utf-8').trim()))
  ) {
    return // already present
  }

  console.log('\n  Electron binary missing — downloading…\n')
  try {
    run('node node_modules/electron/install.js')
  } catch {
    console.error('Electron download failed. Try: rm -rf node_modules/electron && pnpm install')
    process.exit(1)
  }

  if (!fs.existsSync(pathTxt)) {
    console.error('Electron binary still missing after download. Try: rm -rf node_modules && pnpm install')
    process.exit(1)
  }
}

export default function globalSetup() {
  ensureElectronBinary()

  console.log('\n  Building app for E2E tests…\n')
  run('pnpm build')
}
